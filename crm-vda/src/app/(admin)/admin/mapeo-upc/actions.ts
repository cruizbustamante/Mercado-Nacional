"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readSheet, pickCol } from "@/lib/xlsx-utils";
import { canonUpc, variantesUpc } from "@/lib/upc";
import { getCurrentProfile } from "@/lib/auth";

export interface UpcMappingFormState { ok: boolean; error: string | null }

export interface UpcImportResult {
  ok: boolean;
  totalRows: number;        // filas leídas del Excel
  duns: number;             // DUN canónicos importados (1 por fila válida)
  productsMatched: number;  // DUN con SKU resuelto
  productsMissing: string[];// SKUs del Excel que no existen en products
  orphanLinesBefore: number;
  orphanLinesAfter: number;
  remapped: number;         // líneas de OC re-mapeadas (orphan_before - orphan_after)
  errors: string[];
}

export async function importUpcMapping(formData: FormData): Promise<UpcImportResult> {
  const empty: UpcImportResult = {
    ok: false, totalRows: 0, duns: 0, productsMatched: 0, productsMissing: [],
    orphanLinesBefore: 0, orphanLinesAfter: 0, remapped: 0, errors: [],
  };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ...empty, errors: ["Selecciona un archivo Excel."] };

  const buf = await file.arrayBuffer();
  let rows: Record<string, unknown>[];
  try {
    rows = readSheet(buf);
  } catch (e) {
    return { ...empty, errors: [`Error leyendo Excel: ${(e as Error).message}`] };
  }
  if (rows.length === 0) return { ...empty, errors: ["El archivo no tiene filas."] };

  const sample = rows[0];
  const cUpc = pickCol(sample, ["Cod_UPC", "UPC", "Codigo_UPC", "codigo_upc", "EAN", "DUN"]);
  const cSku = pickCol(sample, ["sku", "SKU", "Codigo", "Código"]);
  const cProd = pickCol(sample, ["producto", "Producto", "descripcion", "Descripción", "nombre", "Nombre"]);
  const cCat = pickCol(sample, ["categoria", "Categoría", "Categoria"]);
  const cBrand = pickCol(sample, ["marca", "Marca"]);

  if (!cUpc || !cSku) {
    return { ...empty, totalRows: rows.length, errors: ["Faltan columnas obligatorias: Cod_UPC (o UPC) y sku."] };
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  // Resolver SKUs → product_id
  const skus = Array.from(new Set(rows.map((r) => String(r[cSku] ?? "").trim()).filter(Boolean)));
  const { data: products } = await supabase.from("products").select("id, sku").in("sku", skus).is("deleted_at", null);
  const productMap = new Map((products ?? []).map((p) => [p.sku, p.id]));
  const productsMissing = skus.filter((s) => !productMap.has(s));

  // Contar huérfanas ANTES
  const { count: orphanBefore } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .is("product_id", null);

  // 1 DUN canónico por fila — sin expandir variantes
  const seen = new Set<string>();
  const payloads: Array<{
    upc: string; product_id: string | null; product_name_oc: string | null;
    category_name: string | null; brand_name: string | null; created_by: string | null;
  }> = [];

  for (const row of rows) {
    const upc = canonUpc(row[cUpc] as string);
    if (!upc) continue;
    if (seen.has(upc)) continue;
    seen.add(upc);
    const sku = String(row[cSku] ?? "").trim();
    payloads.push({
      upc,
      product_id: productMap.get(sku) ?? null,
      product_name_oc: cProd && row[cProd] ? String(row[cProd]).trim() : null,
      category_name: cCat && row[cCat] ? String(row[cCat]).trim() : null,
      brand_name: cBrand && row[cBrand] ? String(row[cBrand]).trim() : null,
      created_by: profile?.id ?? null,
    });
  }

  // Upsert en batches
  const errors: string[] = [];
  const batchSize = 500;
  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const { error } = await supabase
      .from("sku_upc_mapping")
      .upsert(batch, { onConflict: "upc", ignoreDuplicates: false });
    if (error) errors.push(`Batch ${i}: ${error.message}`);
  }

  // Auto-remap líneas OC huérfanas usando variantes del DUN
  const remappedCount = errors.length === 0 ? await remapOrphanLines(supabase) : 0;

  // Contar huérfanas DESPUÉS
  const { count: orphanAfter } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .is("product_id", null);

  revalidatePath("/admin/mapeo-upc");
  revalidatePath("/admin");
  revalidatePath("/supermercados");

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    duns: payloads.length,
    productsMatched: payloads.filter((p) => p.product_id).length,
    productsMissing,
    orphanLinesBefore: orphanBefore ?? 0,
    orphanLinesAfter: orphanAfter ?? 0,
    remapped: remappedCount,
    errors,
  };
}

/**
 * Recorre todas las líneas de OC sin product_id e intenta mapearlas
 * probando variantes del UPC contra sku_upc_mapping.
 * Devuelve cuántas líneas se actualizaron.
 */
async function remapOrphanLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  const { data: mapData } = await supabase
    .from("sku_upc_mapping")
    .select("upc, product_id")
    .not("product_id", "is", null);
  const upcToProduct = new Map((mapData ?? []).map((r) => [r.upc, r.product_id as string]));
  if (upcToProduct.size === 0) return 0;

  const { data: orphans } = await supabase
    .from("purchase_order_items")
    .select("id, upc_code")
    .is("product_id", null)
    .not("upc_code", "is", null);

  if (!orphans || orphans.length === 0) return 0;

  // Agrupar por (UPC → product_id resuelto vía variantes)
  const upcResolutions = new Map<string, string>();
  for (const o of orphans) {
    const u = o.upc_code as string;
    if (upcResolutions.has(u)) continue;
    for (const v of variantesUpc(u)) {
      const pid = upcToProduct.get(v);
      if (pid) { upcResolutions.set(u, pid); break; }
    }
  }

  if (upcResolutions.size === 0) return 0;

  // Update por product_id (UN UPDATE por SKU resuelto)
  let total = 0;
  // Invertir: product_id → [upcs]
  const productToUpcs = new Map<string, string[]>();
  for (const [upc, pid] of upcResolutions) {
    if (!productToUpcs.has(pid)) productToUpcs.set(pid, []);
    productToUpcs.get(pid)!.push(upc);
  }

  for (const [pid, upcs] of productToUpcs) {
    const { data, error } = await supabase
      .from("purchase_order_items")
      .update({ product_id: pid })
      .is("product_id", null)
      .in("upc_code", upcs)
      .select("id");
    if (!error && data) total += data.length;
  }

  return total;
}

export async function saveUpcMapping(prev: UpcMappingFormState, fd: FormData): Promise<UpcMappingFormState> {
  const id = fd.get("id") as string | null;
  const upcRaw = (fd.get("upc") as string)?.trim() ?? "";
  const upc = canonUpc(upcRaw);
  if (!upc) return { ok: false, error: "UPC obligatorio (solo dígitos)." };

  const product_id = (fd.get("product_id") as string)?.trim() || null;
  const product_name_oc = ((fd.get("product_name_oc") as string) ?? "").trim() || null;
  const category_name = ((fd.get("category_name") as string) ?? "").trim() || null;
  const brand_name = ((fd.get("brand_name") as string) ?? "").trim() || null;
  const notes = ((fd.get("notes") as string) ?? "").trim() || null;

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const payload = { upc, product_id, product_name_oc, category_name, brand_name, notes, created_by: profile?.id ?? null };

  if (id) {
    const { error } = await supabase.from("sku_upc_mapping").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("sku_upc_mapping").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  // Después de cualquier edit/insert, re-correr el mapeo
  if (product_id) await remapOrphanLines(supabase);

  revalidatePath("/admin/mapeo-upc");
  revalidatePath("/supermercados");
  return { ok: true, error: null };
}

export async function deleteUpcMapping(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("sku_upc_mapping").delete().eq("id", id);
  revalidatePath("/admin/mapeo-upc");
}

/**
 * Acción manual: corre el re-mapeo sin importar nuevo Excel.
 * Útil tras editar un mapeo a mano.
 */
export async function remapAllOrphans(): Promise<{ remapped: number; remaining: number }> {
  const supabase = await createClient();
  const remapped = await remapOrphanLines(supabase);
  const { count: remaining } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .is("product_id", null);
  revalidatePath("/admin/mapeo-upc");
  revalidatePath("/supermercados");
  return { remapped, remaining: remaining ?? 0 };
}
