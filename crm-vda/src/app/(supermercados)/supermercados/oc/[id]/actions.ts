"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface LineUpdate {
  lineId: string;
  boxesInvoiced: number | null;   // null = quitar asignación
  invoiceNumber: string | null;
  invoiceDate: string | null;     // ISO yyyy-mm-dd
  lostSaleReason: string | null;  // null = quitar marca de pérdida
}

export interface SaveResult {
  ok: boolean;
  updatedLines: number;
  invoicesAffected: number;
  errors: string[];
}

/**
 * Guarda un batch de cambios sobre las líneas de una OC.
 *
 * Reglas:
 * - Si boxesInvoiced > 0 y hay invoiceNumber → crea/actualiza assignment
 * - Si boxesInvoiced === null o 0 → borra el assignment existente para esa línea
 * - Si lostSaleReason existe → lo marca; si es null → lo quita
 *
 * El amount_invoiced se calcula proporcional a las cajas: line.unit_price * units_per_pack * boxes
 */
export async function saveOcLineUpdates(
  ocId: string,
  updates: LineUpdate[]
): Promise<SaveResult> {
  console.log("[saveOcLineUpdates] ocId:", ocId, "updates:", updates.length);
  const supabase = await createClient();
  const errors: string[] = [];
  const affectedInvoices = new Set<string>();
  let updatedLines = 0;

  // Cargar líneas actuales para validar y calcular amount_invoiced
  const { data: lines } = await supabase
    .from("purchase_order_items")
    .select("id, unit_price, units_per_pack, quantity_boxes, purchase_order_id")
    .eq("purchase_order_id", ocId);

  const linesMap = new Map((lines ?? []).map((l) => [l.id, l]));

  // Cache de facturas: invoiceNumber → invoiceId (creadas o existentes)
  const invoiceIdCache = new Map<string, string>();

  async function getOrCreateInvoice(invoiceNumber: string, invoiceDate: string | null): Promise<string | null> {
    const key = `${invoiceNumber}|${invoiceDate ?? ""}`;
    if (invoiceIdCache.has(key)) return invoiceIdCache.get(key)!;

    const { data: existing } = await supabase
      .from("oc_invoices")
      .select("id")
      .eq("purchase_order_id", ocId)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

    if (existing) {
      invoiceIdCache.set(key, existing.id);
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from("oc_invoices")
      .insert({
        purchase_order_id: ocId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
      })
      .select("id")
      .single();

    if (error || !created) {
      errors.push(`Factura ${invoiceNumber}: ${error?.message ?? "no se pudo crear"}`);
      return null;
    }
    invoiceIdCache.set(key, created.id);
    return created.id;
  }

  for (const u of updates) {
    const line = linesMap.get(u.lineId);
    if (!line) {
      errors.push(`Línea ${u.lineId.slice(0, 8)} no encontrada`);
      continue;
    }

    // 1) Manejar venta perdida (independiente de la asignación)
    const lostSaleUpdate: Record<string, unknown> = {};
    if (u.lostSaleReason !== undefined) {
      lostSaleUpdate.lost_sale_reason = u.lostSaleReason || null;
      lostSaleUpdate.lost_sale_marked_at = u.lostSaleReason ? new Date().toISOString() : null;
    }
    if (Object.keys(lostSaleUpdate).length > 0) {
      const { error } = await supabase
        .from("purchase_order_items")
        .update(lostSaleUpdate)
        .eq("id", u.lineId);
      if (error) errors.push(`Línea ${line.id.slice(0, 8)} pérdida: ${error.message}`);
    }

    // 2) Limpiar asignaciones previas de esta línea (para rehacer)
    const { data: prevAssignments } = await supabase
      .from("oc_invoice_items")
      .select("id, oc_invoice_id")
      .eq("purchase_order_item_id", u.lineId);

    if (prevAssignments && prevAssignments.length > 0) {
      const prevIds = prevAssignments.map((a) => a.id);
      const prevInvoiceIds = prevAssignments.map((a) => a.oc_invoice_id);
      const { error: delError } = await supabase.from("oc_invoice_items").delete().in("id", prevIds);
      if (delError) console.error("[saveOcLineUpdates] delete prev:", delError.message);
      prevInvoiceIds.forEach((id) => affectedInvoices.add(id));
    }

    // 3) Crear nueva asignación si corresponde
    const boxes = u.boxesInvoiced ?? 0;
    if (boxes > 0 && u.invoiceNumber?.trim()) {
      const invoiceId = await getOrCreateInvoice(u.invoiceNumber.trim(), u.invoiceDate);
      if (invoiceId) {
        const amount = boxes * line.unit_price;
        console.log("[saveOcLineUpdates] insert item:", { invoiceId, lineId: u.lineId, boxes, amount });
        const { error } = await supabase.from("oc_invoice_items").insert({
          oc_invoice_id: invoiceId,
          purchase_order_item_id: u.lineId,
          boxes_invoiced: boxes,
          amount_invoiced: amount,
        });
        if (error) {
          errors.push(`Línea ${line.id.slice(0, 8)} asignar: ${error.message}`);
        } else {
          affectedInvoices.add(invoiceId);
          updatedLines++;
        }
      }
    } else if (boxes === 0 && (prevAssignments?.length ?? 0) > 0) {
      // Se borró la asignación, contar como update
      updatedLines++;
    }
  }

  // Limpiar facturas que quedaron sin items (cleanup)
  for (const invId of affectedInvoices) {
    const { count } = await supabase
      .from("oc_invoice_items")
      .select("id", { count: "exact", head: true })
      .eq("oc_invoice_id", invId);
    if ((count ?? 0) === 0) {
      await supabase.from("oc_invoices").delete().eq("id", invId);
    }
  }

  // Actualizar status de la OC según facturación total
  const { data: lineAmounts } = await supabase
    .from("purchase_order_items")
    .select("line_amount")
    .eq("purchase_order_id", ocId);
  const { data: invAmounts } = await supabase
    .from("oc_invoice_items")
    .select("amount_invoiced, oc_invoice:oc_invoices!inner(purchase_order_id)")
    .eq("oc_invoice.purchase_order_id", ocId);

  const totalOc = (lineAmounts ?? []).reduce((s, l) => s + (l.line_amount || 0), 0);
  const totalFact = (invAmounts ?? []).reduce((s, l) => s + (l.amount_invoiced || 0), 0);

  let newStatus: string | null = null;
  if (totalFact === 0) newStatus = "ACTIVA";
  else if (totalFact >= totalOc * 0.99) newStatus = "COMPLETADA";
  else newStatus = "PARCIAL";

  if (newStatus) {
    await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", ocId);
  }

  revalidatePath(`/supermercados/oc/${ocId}`);
  revalidatePath("/supermercados/ordenes");
  revalidatePath("/supermercados");
  revalidatePath("/supermercados/analisis");
  revalidatePath("/nota-venta");

  return {
    ok: errors.length === 0,
    updatedLines,
    invoicesAffected: affectedInvoices.size,
    errors,
  };
}

/* ============================================================
   Crear NV en maestro desde factura supermercado
   ============================================================ */

export interface SupermarketNvLine {
  productId: string;
  productSku: string;
  productName: string;
  brandName: string | null;
  categoryName: string | null;
  boxes: number;
  unitsPerBox: number;
  unitPrice: number;
  netProduct: number;
  logisticsCostPerUnit: number;
  logisticsTotal: number;
}

export interface SupermarketNvInput {
  ocId: string;
  invoiceNumber: string;
  invoiceDate: string;
  chainId: string;
  lines: SupermarketNvLine[];
  totalNetProduct: number;
  totalLogistics: number;
  totalIla: number;
  totalIva: number;
  grandTotal: number;
}

export interface NvCreateResult {
  ok: boolean;
  nvNumber: string | null;
  error: string | null;
}

export async function createSupermarketNv(input: SupermarketNvInput): Promise<NvCreateResult> {
  const supabase = await createClient();

  // 1) Resolve chain → client
  const { data: chain } = await supabase
    .from("supermarket_chains")
    .select("id, name, client_id")
    .eq("id", input.chainId)
    .single();

  if (!chain?.client_id) {
    return {
      ok: false,
      nvNumber: null,
      error: `Cadena "${chain?.name ?? input.chainId}" no tiene cliente asignado. Configúralo en Admin > Cadenas.`,
    };
  }

  // 2) Get supermercado channel
  const { data: channel } = await supabase
    .from("sales_channels")
    .select("id, nv_prefix, nv_last_correlative")
    .eq("name", "supermercado")
    .single();

  if (!channel) {
    return { ok: false, nvNumber: null, error: "Canal 'supermercado' no encontrado." };
  }

  // 3) Generate NV number atomically
  const { data: newCorr, error: rpcErr } = await supabase.rpc("increment_channel_correlative", {
    p_channel_id: channel.id,
  });

  if (rpcErr || newCorr == null) {
    return { ok: false, nvNumber: null, error: `Error generando correlativo: ${rpcErr?.message ?? "null"}` };
  }

  const nvNumber = `${channel.nv_prefix}-${String(newCorr).padStart(6, "0")}`;

  // 4) Get current user
  const { data: { user } } = await supabase.auth.getUser();
  let salespersonId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();
    salespersonId = profile?.id ?? null;
  }

  // 5) Get default warehouse
  const { data: wh } = await supabase
    .from("warehouses")
    .select("id")
    .eq("is_default", true)
    .limit(1)
    .single();

  const totalBoxes = input.lines.reduce((s, l) => s + l.boxes, 0);
  const totalUnits = input.lines.reduce((s, l) => s + l.boxes * l.unitsPerBox, 0);

  // 6) Insert sales_note
  const { data: nv, error: nvErr } = await supabase
    .from("sales_notes")
    .insert({
      nv_number: nvNumber,
      client_id: chain.client_id,
      channel_id: channel.id,
      salesperson_id: salespersonId,
      nv_date: input.invoiceDate || new Date().toISOString().split("T")[0],
      warehouse_id: wh?.id ?? null,
      status: "FACTURADO",
      invoice_number: input.invoiceNumber,
      invoiced_at: new Date().toISOString(),
      invoiced_by: salespersonId,
      total_base_net: input.totalNetProduct,
      total_discount: 0,
      total_net: input.totalNetProduct,
      total_iva: input.totalIva,
      total_ila: input.totalIla,
      total_logistics: input.totalLogistics,
      total_amount: input.grandTotal,
      total_boxes: totalBoxes,
      total_units: totalUnits,
    })
    .select("id")
    .single();

  if (nvErr || !nv) {
    return { ok: false, nvNumber, error: `Error creando NV: ${nvErr?.message ?? "desconocido"}` };
  }

  // 7) Resolve brand/category names for denormalization
  const productIds = input.lines.map((l) => l.productId);
  const { data: prodDetails } = await supabase
    .from("products")
    .select("id, brand:brands(name), category:product_categories(name)")
    .in("id", productIds);

  type ProdDetail = { id: string; brand: { name: string } | null; category: { name: string } | null };
  const prodMap = new Map<string, ProdDetail>();
  for (const p of ((prodDetails ?? []) as unknown as ProdDetail[])) {
    prodMap.set(p.id, p);
  }

  // 8) Insert sales_note_items
  const items = input.lines.map((l, i) => {
    const lineNet = l.netProduct;
    const lineIla = Math.round(lineNet * 0.205);
    const lineIva = Math.round((lineNet + l.logisticsTotal) * 0.19);
    const lineTotal = lineNet + l.logisticsTotal + lineIla + lineIva;
    return {
      sales_note_id: nv.id,
      product_id: l.productId,
      line_number: i + 1,
      quantity_boxes: l.boxes,
      units_per_box: l.unitsPerBox,
      quantity_units: l.boxes * l.unitsPerBox,
      price_net_base: l.unitPrice,
      price_gross_base: l.unitPrice,
      price_net_final: l.unitPrice,
      price_gross_final: l.unitPrice,
      min_price_net: 0,
      iva_rate: 0.19,
      ila_rate: 0.205,
      discount_amount: 0,
      logistics_net: l.logisticsTotal,
      logistics_iva: Math.round(l.logisticsTotal * 0.19),
      line_net: lineNet,
      line_iva: lineIva,
      line_ila: lineIla,
      line_total: lineTotal,
      product_sku: l.productSku,
      product_name: l.productName,
      category_name: prodMap.get(l.productId)?.category?.name ?? l.categoryName,
      brand_name: prodMap.get(l.productId)?.brand?.name ?? l.brandName,
    };
  });

  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from("sales_note_items").insert(items);
    if (itemsErr) {
      return { ok: false, nvNumber, error: `NV creada pero error en líneas: ${itemsErr.message}` };
    }
  }

  revalidatePath("/nota-venta");

  return { ok: true, nvNumber, error: null };
}
