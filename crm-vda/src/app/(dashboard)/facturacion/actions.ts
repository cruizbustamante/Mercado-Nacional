"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export interface MarcarResult {
  success: boolean;
  error?: string;
}

/**
 * Marca una NV como FACTURADA con el folio real (tras emitir en facturacion.cl).
 * Sale de "Por facturar" y queda registrada → evita facturar dos veces la misma NV.
 */
export async function marcarFacturada(nvId: string, folio: string): Promise<MarcarResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: "No autenticado" };
  if (!["admin", "facturador"].includes(profile.role?.name ?? "")) {
    return { success: false, error: "Sin permiso para facturar" };
  }

  const folioClean = folio.trim();
  if (!folioClean) return { success: false, error: "El N° de folio es obligatorio" };

  const supabase = await createClient();
  const { data: nv } = await supabase
    .from("sales_notes")
    .select("id, nv_number, status, invoice_number, purchase_order_id, nv_date")
    .eq("id", nvId)
    .single();

  if (!nv) return { success: false, error: "NV no encontrada" };
  if (nv.invoice_number) return { success: false, error: `NV ${nv.nv_number} ya está facturada (folio ${nv.invoice_number})` };
  if (nv.status !== "APROBADO") return { success: false, error: `Solo se factura una NV APROBADA (estado: ${nv.status})` };

  const { error } = await supabase
    .from("sales_notes")
    .update({
      status: "FACTURADO",
      invoice_number: folioClean,
      invoiced_at: new Date().toISOString(),
      invoiced_by: profile.id,
      invoice_job_status: "EMITIDA",
      invoice_error: null,
    })
    .eq("id", nvId);

  if (error) return { success: false, error: error.message };

  // ── Writeback a Supermercados: si la NV nació de una OC, devolver folio +
  //    cantidades facturadas al módulo para alimentar el cumplimiento (fill rate). ──
  if (nv.purchase_order_id) {
    await writebackOcInvoice(supabase, nvId, nv.purchase_order_id, folioClean, nv.nv_date as string);
    revalidatePath(`/supermercados/oc/${nv.purchase_order_id}`);
    revalidatePath("/supermercados/ordenes");
    revalidatePath("/supermercados");
  }

  revalidatePath("/facturacion");
  revalidatePath("/nota-venta");
  return { success: true };
}

/**
 * Crea la factura de supermercado (oc_invoices + oc_invoice_items) a partir de la
 * NV recién facturada, mapeando cada línea de NV a su línea de OC. El monto se
 * calcula como cajas × unit_price de la OC para que el cumplimiento cuadre con los
 * totales OC del módulo (misma semántica que la asignación manual previa).
 */
async function writebackOcInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nvId: string,
  ocId: string,
  folio: string,
  nvDate: string
): Promise<void> {
  // 1) Líneas de la NV ligadas a líneas de OC.
  const { data: nvItems } = await supabase
    .from("sales_note_items")
    .select("purchase_order_item_id, quantity_boxes")
    .eq("sales_note_id", nvId)
    .not("purchase_order_item_id", "is", null);

  const lines = (nvItems ?? []).filter((l) => l.purchase_order_item_id && (l.quantity_boxes ?? 0) > 0);
  if (lines.length === 0) return;

  // 2) unit_price de las líneas de OC (para el monto facturado).
  const ocLineIds = lines.map((l) => l.purchase_order_item_id as string);
  const { data: ocLines } = await supabase
    .from("purchase_order_items")
    .select("id, unit_price")
    .in("id", ocLineIds);
  const priceByLine = new Map((ocLines ?? []).map((l) => [l.id, l.unit_price as number]));

  // 3) Factura (oc_invoices): reutiliza si ya existe ese folio en la OC.
  const { data: existingInv } = await supabase
    .from("oc_invoices")
    .select("id")
    .eq("purchase_order_id", ocId)
    .eq("invoice_number", folio)
    .maybeSingle();

  let invoiceId = existingInv?.id ?? null;
  if (!invoiceId) {
    const { data: created } = await supabase
      .from("oc_invoices")
      .insert({ purchase_order_id: ocId, invoice_number: folio, invoice_date: nvDate })
      .select("id")
      .single();
    invoiceId = created?.id ?? null;
  }
  if (!invoiceId) return;

  // 4) Ítems de la factura. Evita duplicar si ya existen para esa (factura, línea OC).
  const { data: prevItems } = await supabase
    .from("oc_invoice_items")
    .select("purchase_order_item_id")
    .eq("oc_invoice_id", invoiceId);
  const already = new Set((prevItems ?? []).map((p) => p.purchase_order_item_id));

  const toInsert = lines
    .filter((l) => !already.has(l.purchase_order_item_id))
    .map((l) => ({
      oc_invoice_id: invoiceId,
      purchase_order_item_id: l.purchase_order_item_id as string,
      boxes_invoiced: l.quantity_boxes as number,
      amount_invoiced: (l.quantity_boxes as number) * (priceByLine.get(l.purchase_order_item_id as string) ?? 0),
    }));

  if (toInsert.length > 0) {
    await supabase.from("oc_invoice_items").insert(toInsert);
  }

  // 5) Recalcular status de la OC según facturación total.
  const [{ data: lineAmounts }, { data: invAmounts }] = await Promise.all([
    supabase.from("purchase_order_items").select("line_amount").eq("purchase_order_id", ocId),
    supabase
      .from("oc_invoice_items")
      .select("amount_invoiced, oc_invoice:oc_invoices!inner(purchase_order_id)")
      .eq("oc_invoice.purchase_order_id", ocId),
  ]);

  const totalOc = (lineAmounts ?? []).reduce((s, l) => s + (l.line_amount || 0), 0);
  const totalFact = (invAmounts ?? []).reduce((s, l) => s + (l.amount_invoiced || 0), 0);
  const newStatus = totalFact === 0 ? "ACTIVA" : totalFact >= totalOc * 0.99 ? "COMPLETADA" : "PARCIAL";
  await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", ocId);
}
