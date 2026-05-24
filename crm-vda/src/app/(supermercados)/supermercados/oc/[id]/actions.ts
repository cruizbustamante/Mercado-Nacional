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
      await supabase.from("oc_invoice_items").delete().in("id", prevIds);
      prevInvoiceIds.forEach((id) => affectedInvoices.add(id));
    }

    // 3) Crear nueva asignación si corresponde
    const boxes = u.boxesInvoiced ?? 0;
    if (boxes > 0 && u.invoiceNumber?.trim()) {
      const invoiceId = await getOrCreateInvoice(u.invoiceNumber.trim(), u.invoiceDate);
      if (invoiceId) {
        const unitsPerPack = line.units_per_pack ?? 1;
        const amount = boxes * unitsPerPack * line.unit_price;
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

  return {
    ok: errors.length === 0,
    updatedLines,
    invoicesAffected: affectedInvoices.size,
    errors,
  };
}
