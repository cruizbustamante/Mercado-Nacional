"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

/* ============================================================
   Marcar / quitar venta perdida (sin tocar asignaciones)
   ============================================================ */

export interface LostSaleUpdate {
  lineId: string;
  reason: string | null;   // null = quitar la marca de venta perdida
}

/**
 * Actualiza SOLO la marca de venta perdida de líneas de OC. A diferencia de
 * saveOcLineUpdates, NO crea ni borra asignaciones de factura — las asignaciones
 * ahora llegan por writeback desde el módulo Facturación al facturar la NV.
 */
export async function setLostSaleReasons(
  ocId: string,
  updates: LostSaleUpdate[]
): Promise<{ ok: boolean; updated: number; error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, updated: 0, error: "No autenticado" };
  if (updates.length === 0) return { ok: true, updated: 0 };

  const supabase = await createClient();
  let updated = 0;

  for (const u of updates) {
    const { error } = await supabase
      .from("purchase_order_items")
      .update({
        lost_sale_reason: u.reason || null,
        lost_sale_marked_at: u.reason ? new Date().toISOString() : null,
      })
      .eq("id", u.lineId)
      .eq("purchase_order_id", ocId);
    if (error) return { ok: false, updated, error: error.message };
    updated++;
  }

  revalidatePath(`/supermercados/oc/${ocId}`);
  revalidatePath("/supermercados/ordenes");
  revalidatePath("/supermercados");
  return { ok: true, updated };
}

/* ============================================================
   Crear NV en maestro desde factura supermercado
   ============================================================ */

export interface SupermarketNvLine {
  ocLineId: string;        // purchase_order_items.id de origen (para writeback de cumplimiento)
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
  invoiceDate: string;     // fecha de la NV (normalmente hoy)
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
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, nvNumber: null, error: "No autenticado" };

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

  // 2.b) GUARDA anti-doble-facturación: las cajas pedidas no pueden superarse
  //      sumando lo ya facturado + lo que ya está en una NV pendiente. Evita que
  //      se genere otra NV por las mismas cajas (UI + ventana de refresh).
  {
    const ocLineIds = input.lines.map((l) => l.ocLineId).filter(Boolean);
    if (ocLineIds.length === 0) {
      return { ok: false, nvNumber: null, error: "La NV no tiene líneas ligadas a la OC." };
    }

    const [{ data: ocLines }, { data: invItems }, { data: pendItems }] = await Promise.all([
      supabase.from("purchase_order_items").select("id, quantity_boxes").in("id", ocLineIds),
      supabase.from("oc_invoice_items").select("purchase_order_item_id, boxes_invoiced").in("purchase_order_item_id", ocLineIds),
      supabase
        .from("sales_note_items")
        .select("purchase_order_item_id, quantity_boxes, sales_note:sales_notes!inner(status, invoice_number, purchase_order_id)")
        .in("purchase_order_item_id", ocLineIds)
        .eq("sales_note.purchase_order_id", input.ocId)
        .eq("sales_note.status", "APROBADO")
        .is("sales_note.invoice_number", null),
    ]);

    const qtyByLine = new Map((ocLines ?? []).map((l) => [l.id as string, l.quantity_boxes as number]));
    const committedByLine = new Map<string, number>();
    for (const it of invItems ?? []) {
      const k = it.purchase_order_item_id as string;
      committedByLine.set(k, (committedByLine.get(k) ?? 0) + (it.boxes_invoiced || 0));
    }
    for (const it of pendItems ?? []) {
      const k = it.purchase_order_item_id as string;
      committedByLine.set(k, (committedByLine.get(k) ?? 0) + (it.quantity_boxes || 0));
    }

    const over: string[] = [];
    for (const l of input.lines) {
      const qty = qtyByLine.get(l.ocLineId) ?? 0;
      const committed = committedByLine.get(l.ocLineId) ?? 0;
      const disponible = Math.max(0, qty - committed);
      if (l.boxes > disponible) {
        over.push(`${l.productSku || l.productName}: pides ${l.boxes}, disponible ${disponible}`);
      }
    }
    if (over.length > 0) {
      return {
        ok: false,
        nvNumber: null,
        error: `Cajas ya comprometidas (facturadas o en NV pendiente) — ${over.join(" · ")}. Refresca la OC.`,
      };
    }
  }

  // 3) Generate NV number atomically
  const { data: newCorr, error: rpcErr } = await supabase.rpc("increment_channel_correlative", {
    p_channel_id: channel.id,
  });

  if (rpcErr || newCorr == null) {
    return { ok: false, nvNumber: null, error: `Error generando correlativo: ${rpcErr?.message ?? "null"}` };
  }

  const nvNumber = `${channel.nv_prefix}-${String(newCorr).padStart(6, "0")}`;

  // 4) Vendedor = usuario actual
  const salespersonId: string | null = profile.id;

  // 5) Get warehouse (default first, then any)
  const { data: wh } = await supabase
    .from("warehouses")
    .select("id")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  const totalBoxes = input.lines.reduce((s, l) => s + l.boxes, 0);
  const totalUnits = input.lines.reduce((s, l) => s + l.boxes * l.unitsPerBox, 0);

  // 6) Insert sales_note
  // La OC de supermercado es venta firme con precios pactados → la NV nace
  // APROBADA (sin V°B°), pendiente de facturación. El folio NO se setea aquí:
  // se factura desde el módulo Facturación y el folio vuelve por writeback.
  const nowIso = new Date().toISOString();
  const { data: nv, error: nvErr } = await supabase
    .from("sales_notes")
    .insert({
      nv_number: nvNumber,
      client_id: chain.client_id,
      channel_id: channel.id,
      salesperson_id: salespersonId,
      nv_date: input.invoiceDate || new Date().toISOString().split("T")[0],
      warehouse_id: wh?.id ?? null,
      status: "APROBADO",
      purchase_order_id: input.ocId,
      requires_vb_financiero: false,
      approved_by: salespersonId,
      approved_at: nowIso,
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
      purchase_order_item_id: l.ocLineId,
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
  revalidatePath("/facturacion");
  revalidatePath(`/supermercados/oc/${input.ocId}`);
  revalidatePath("/supermercados/ordenes");
  revalidatePath("/supermercados");

  return { ok: true, nvNumber, error: null };
}
