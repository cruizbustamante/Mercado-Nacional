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
    .select("id, nv_number, status, invoice_number")
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

  revalidatePath("/facturacion");
  revalidatePath("/nota-venta");
  return { success: true };
}
