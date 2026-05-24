"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export interface SaveNvLineInput {
  product_id: string;
  cajas: number;
  precio_bruto: number;
}

export interface SaveNvInput {
  client_id: string;
  payment_term_id: string | null;
  warehouse_id: string;
  delivery_address: string;
  delivery_schedule: string;
  observations: string;
  lines: SaveNvLineInput[];
}

export interface SaveNvResult {
  ok: boolean;
  error?: string;
  nv_id?: string;
  nv_number?: string;
  requires_vb?: boolean;
}

export async function saveSalesNote(input: SaveNvInput): Promise<SaveNvResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };

  const supabase = await createClient();

  // Cargar config (mismo cálculo que el front, autoritativo en server)
  const { data: cfgRows } = await supabase
    .from("system_config")
    .select("key, value")
    .in("key", [
      "logistics_cost_net_per_unit",
      "logistics_cost_iva_rate",
      "vb_tolerance_clp",
      "nv_prefix",
      "nv_padding",
    ]);
  const cfg = new Map((cfgRows ?? []).map((r) => [r.key, r.value]));
  const logNet = parseFloat(cfg.get("logistics_cost_net_per_unit") ?? "360");
  const logIvaRate = parseFloat(cfg.get("logistics_cost_iva_rate") ?? "0.19");
  const vbTol = parseFloat(cfg.get("vb_tolerance_clp") ?? "5");
  const nvPrefix = cfg.get("nv_prefix") ?? "";
  const nvPadding = parseInt(cfg.get("nv_padding") ?? "6", 10);

  // Validaciones
  if (!input.client_id) return { ok: false, error: "Cliente obligatorio." };
  if (!input.warehouse_id) return { ok: false, error: "Bodega obligatoria." };
  const validLines = input.lines.filter((l) => l.product_id && l.cajas > 0);
  if (validLines.length === 0) return { ok: false, error: "Debe incluir al menos una línea con cajas > 0." };

  // Cargar productos referenciados
  const productIds = Array.from(new Set(validLines.map((l) => l.product_id)));
  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, units_per_box, base_price_net, base_price_gross, min_price_net, iva_rate, ila_rate, category:product_categories(name), brand:brands(name)")
    .in("id", productIds);

  if (!products || products.length === 0) return { ok: false, error: "Productos inválidos." };
  type ProductRow = {
    id: string; sku: string; name: string; units_per_box: number;
    base_price_net: number; base_price_gross: number; min_price_net: number;
    iva_rate: number; ila_rate: number;
    category: { name: string } | null; brand: { name: string } | null;
  };
  const productMap = new Map<string, ProductRow>(
    (products as unknown as ProductRow[]).map((p) => [p.id, p])
  );

  // Calcular líneas (mismo método que el front)
  let totalNeto = 0, totalIva = 0, totalIla = 0, totalLog = 0, totalDescuento = 0;
  let totalCajas = 0, totalUnidades = 0;
  let requiresVb = false;

  const items: Array<Record<string, unknown>> = [];

  for (let i = 0; i < validLines.length; i++) {
    const l = validLines[i];
    const p = productMap.get(l.product_id);
    if (!p) return { ok: false, error: `Producto ${l.product_id} no encontrado.` };

    const unidades = l.cajas * p.units_per_box;
    const totalLinea = unidades * l.precio_bruto;
    const log_neto = unidades * logNet;
    const log_iva = log_neto * logIvaRate;
    const factor = 1 + p.iva_rate + p.ila_rate;
    const netoProducto = factor > 0 ? Math.max(0, (totalLinea - log_neto - log_iva) / factor) : 0;
    const ivaProducto = (netoProducto + log_neto) * p.iva_rate;
    const ilaProducto = netoProducto * p.ila_rate;
    const precioNetoUnit = unidades > 0 ? Math.round(netoProducto / unidades) : 0;
    const descuentoLinea = unidades * Math.max(0, p.base_price_gross - l.precio_bruto);
    const lineRequiresVb = precioNetoUnit < (p.min_price_net - vbTol);

    totalNeto += Math.round(netoProducto);
    totalIva += Math.round(ivaProducto);
    totalIla += Math.round(ilaProducto);
    totalLog += Math.round(log_neto);
    totalDescuento += descuentoLinea;
    totalCajas += l.cajas;
    totalUnidades += unidades;
    if (lineRequiresVb) requiresVb = true;

    items.push({
      product_id: p.id,
      line_number: i + 1,
      quantity_boxes: l.cajas,
      units_per_box: p.units_per_box,
      quantity_units: unidades,
      price_net_base: p.base_price_net,
      price_gross_base: p.base_price_gross,
      price_net_final: precioNetoUnit,
      price_gross_final: l.precio_bruto,
      min_price_net: p.min_price_net,
      requires_vb_financiero: lineRequiresVb,
      iva_rate: p.iva_rate,
      ila_rate: p.ila_rate,
      discount_amount: Math.round(descuentoLinea),
      logistics_net: Math.round(log_neto),
      logistics_iva: Math.round(log_iva),
      line_net: Math.round(netoProducto),
      line_iva: Math.round(ivaProducto),
      line_ila: Math.round(ilaProducto),
      line_total: totalLinea,
      product_sku: p.sku,
      product_name: p.name,
      category_name: p.category?.name ?? null,
      brand_name: p.brand?.name ?? null,
    });
  }

  const totalAmount = totalNeto + totalLog + totalIva + totalIla;

  // Resolver canal del cliente para correlativo por canal
  const { data: clientData } = await supabase
    .from("clients")
    .select("channel_id")
    .eq("id", input.client_id)
    .single();
  const channelId: string | null = clientData?.channel_id ?? null;

  let nvNumber: string;
  if (channelId) {
    const { data: newCorr, error: corrErr } = await supabase
      .rpc("increment_channel_correlative", { p_channel_id: channelId });
    if (corrErr || newCorr == null) {
      return { ok: false, error: `Error generando correlativo: ${corrErr?.message ?? "desconocido"}` };
    }
    const { data: ch } = await supabase
      .from("sales_channels")
      .select("nv_prefix")
      .eq("id", channelId)
      .single();
    const prefix = ch?.nv_prefix ?? "";
    nvNumber = `${prefix}-${String(newCorr as number).padStart(nvPadding, "0")}`;
  } else {
    const { data: seqRow, error: seqErr } = await supabase.rpc("nextval_nv");
    if (seqErr) {
      const { data: maxRow } = await supabase
        .from("sales_notes")
        .select("nv_number")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastNum = maxRow?.nv_number ? parseInt(String(maxRow.nv_number).replace(/\D/g, ""), 10) : 10000;
      nvNumber = `${nvPrefix}${String(lastNum + 1).padStart(nvPadding, "0")}`;
    } else {
      nvNumber = `${nvPrefix}${String(seqRow as number).padStart(nvPadding, "0")}`;
    }
  }

  // Insertar sales_note
  const { data: nv, error: nvErr } = await supabase
    .from("sales_notes")
    .insert({
      nv_number: nvNumber,
      client_id: input.client_id,
      channel_id: channelId,
      salesperson_id: profile.id,
      nv_date: new Date().toISOString().split("T")[0],
      payment_term_id: input.payment_term_id,
      warehouse_id: input.warehouse_id,
      delivery_address: input.delivery_address || null,
      delivery_schedule: input.delivery_schedule || null,
      observations: input.observations || null,
      status: requiresVb ? "PENDIENTE" : "APROBADO",
      requires_vb_financiero: requiresVb,
      vb_financiero_status: requiresVb ? "PENDIENTE" : null,
      total_base_net: totalNeto + totalDescuento,
      total_discount: totalDescuento,
      total_net: totalNeto,
      total_iva: totalIva,
      total_ila: totalIla,
      total_logistics: totalLog,
      total_amount: totalAmount,
      total_boxes: totalCajas,
      total_units: totalUnidades,
    })
    .select("id, nv_number")
    .single();

  if (nvErr || !nv) {
    return { ok: false, error: `Error guardando NV: ${nvErr?.message ?? "desconocido"}` };
  }

  // Insertar items
  const itemsWithNvId = items.map((it) => ({ ...it, sales_note_id: nv.id }));
  const { error: itemsErr } = await supabase.from("sales_note_items").insert(itemsWithNvId);

  if (itemsErr) {
    // rollback
    await supabase.from("sales_notes").delete().eq("id", nv.id);
    return { ok: false, error: `Error guardando items: ${itemsErr.message}` };
  }

  // Log
  await supabase.from("nv_status_log").insert({
    sales_note_id: nv.id,
    nv_number: nv.nv_number,
    action: "CREATE",
    new_status: requiresVb ? "PENDIENTE" : "APROBADO",
    user_id: profile.id,
    user_email: profile.email,
    detail: requiresVb ? "NV creada con V°B° pendiente" : "NV creada y aprobada",
  });

  revalidatePath("/nota-venta");

  return { ok: true, nv_id: nv.id, nv_number: nv.nv_number, requires_vb: requiresVb };
}

export async function redirectToNV(id: string): Promise<void> {
  redirect(`/nota-venta/${id}`);
}
