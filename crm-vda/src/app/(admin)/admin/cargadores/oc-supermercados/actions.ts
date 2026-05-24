"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fileToText } from "@/lib/file-to-text";
import { parseOc, type ParsedOc } from "@/lib/oc-parser";
import { variantesUpc } from "@/lib/upc";

export interface OcFileResult {
  filename: string;
  ok: boolean;
  chain: string;
  order_number: string;
  total_amount: number;
  lines_total: number;
  lines_matched: number;
  status: "creada" | "duplicada" | "error" | "vacia";
  message: string;
}

export interface OcImportResult {
  ok: boolean;
  files: OcFileResult[];
  noMapeados: Array<{ upc: string; producto: string; orden: string }>;
}

export async function importOcFiles(formData: FormData): Promise<OcImportResult> {
  const files = formData.getAll("files") as File[];
  if (!files || files.length === 0) {
    return { ok: false, files: [], noMapeados: [] };
  }

  const supabase = await createClient();

  // Pre-cargar cadenas + mapping UPC
  const { data: chainsData } = await supabase.from("supermarket_chains").select("id, name, aliases").eq("is_active", true);
  type Chain = { id: string; name: string; aliases: string[] };
  const chains = (chainsData ?? []) as Chain[];

  function chainIdFor(chainName: string, issuer: string, buyer: string): string | null {
    const search = `${chainName} ${issuer} ${buyer}`.toUpperCase();
    for (const ch of chains) {
      if (search.includes(ch.name.toUpperCase())) return ch.id;
      for (const alias of ch.aliases ?? []) {
        if (search.includes(alias.toUpperCase())) return ch.id;
      }
    }
    return null;
  }

  const { data: upcMap } = await supabase.from("sku_upc_mapping").select("upc, product_id");
  const upcToProduct = new Map((upcMap ?? []).filter((r) => r.product_id).map((r) => [r.upc, r.product_id as string]));

  const results: OcFileResult[] = [];
  const noMapeadosMap = new Map<string, { upc: string; producto: string; orden: string }>();

  for (const file of files) {
    const baseResult: OcFileResult = {
      filename: file.name,
      ok: false,
      chain: "—",
      order_number: "—",
      total_amount: 0,
      lines_total: 0,
      lines_matched: 0,
      status: "error",
      message: "",
    };

    if (!file || file.size === 0) {
      results.push({ ...baseResult, message: "Archivo vacío" });
      continue;
    }

    let text: string;
    try {
      text = await fileToText(file);
    } catch (e) {
      results.push({ ...baseResult, message: `Error leyendo archivo: ${(e as Error).message}` });
      continue;
    }

    let parsed: ParsedOc;
    try {
      parsed = parseOc(text);
    } catch (e) {
      results.push({ ...baseResult, message: `Error parseando: ${(e as Error).message}` });
      continue;
    }

    if (!parsed.order_number) {
      results.push({
        ...baseResult,
        chain: parsed.chain,
        status: "vacia",
        message: parsed.chain === "Otro"
          ? "Cadena no detectada. Revisa el contenido del archivo."
          : `Parser de ${parsed.chain} no implementado todavía (pendiente ejemplo).`,
      });
      continue;
    }

    // Validar duplicado
    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("id, order_number")
      .eq("order_number", parsed.order_number)
      .maybeSingle();

    if (existing) {
      results.push({
        ...baseResult,
        chain: parsed.chain,
        order_number: parsed.order_number,
        status: "duplicada",
        message: `OC ${parsed.order_number} ya está cargada (id ${existing.id}). No se sobreescribe.`,
      });
      continue;
    }

    // Resolver chain_id
    const chain_id = chainIdFor(parsed.chain, parsed.issuer, parsed.buyer);

    const { data: newOc, error: insErr } = await supabase
      .from("purchase_orders")
      .insert({
        order_number: parsed.order_number,
        chain_id,
        buyer: parsed.buyer || null,
        issuer: parsed.issuer || null,
        order_date: parsed.order_date,
        cancellation_date: parsed.cancellation_date,
        total_amount: parsed.total_amount,
        source_pdf: file.name,
        status: "ACTIVA",
      })
      .select("id")
      .single();

    if (insErr || !newOc) {
      results.push({
        ...baseResult,
        chain: parsed.chain,
        order_number: parsed.order_number,
        message: `Error guardando OC: ${insErr?.message ?? "desconocido"}`,
      });
      continue;
    }

    let linesMatched = 0;
    const items = parsed.lines.map((l) => {
      let product_id: string | null = null;
      if (l.upc_code) {
        for (const v of variantesUpc(l.upc_code)) {
          if (upcToProduct.has(v)) { product_id = upcToProduct.get(v)!; break; }
        }
      }
      if (product_id) linesMatched++;
      else if (l.upc_code) {
        const key = l.upc_code;
        if (!noMapeadosMap.has(key)) {
          noMapeadosMap.set(key, { upc: l.upc_code, producto: l.product_name_oc, orden: parsed.order_number });
        }
      }
      return {
        purchase_order_id: newOc.id,
        product_id,
        line_number: l.line_number,
        upc_code: l.upc_code,
        product_name_oc: l.product_name_oc,
        quantity_boxes: l.quantity_boxes,
        quantity_units: l.quantity_boxes * (l.units_per_pack || 1),
        units_per_pack: l.units_per_pack || null,
        unit_price: l.unit_price,
        line_amount: l.line_amount || (l.unit_price * l.quantity_boxes * (l.units_per_pack || 1)),
      };
    });

    if (items.length > 0) {
      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(items);
      if (itemsErr) {
        await supabase.from("purchase_orders").delete().eq("id", newOc.id);
        results.push({
          ...baseResult,
          chain: parsed.chain,
          order_number: parsed.order_number,
          message: `Error guardando items: ${itemsErr.message}`,
        });
        continue;
      }
    }

    results.push({
      filename: file.name,
      ok: true,
      chain: parsed.chain,
      order_number: parsed.order_number,
      total_amount: parsed.total_amount,
      lines_total: parsed.lines.length,
      lines_matched: linesMatched,
      status: "creada",
      message: `OC creada con ${parsed.lines.length} líneas (${linesMatched} vinculadas a SKU).`,
    });
  }

  revalidatePath("/admin/cargadores/oc-supermercados");
  revalidatePath("/supermercados");
  revalidatePath("/admin");

  return {
    ok: results.every((r) => r.ok || r.status === "duplicada"),
    files: results,
    noMapeados: Array.from(noMapeadosMap.values()),
  };
}
