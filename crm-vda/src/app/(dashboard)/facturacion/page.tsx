import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FacturacionModule, type FacturaRow, type FacturaItem } from "./FacturacionModule";

export const dynamic = "force-dynamic";

export default async function FacturacionPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const canEmit = ["admin", "facturador"].includes(profile.role?.name ?? "");

  const supabase = await createClient();

  // Trae las NV relevantes para el facturador: aprobadas (por facturar) y ya facturadas.
  const { data } = await supabase
    .from("sales_notes")
    .select(
      `id, nv_number, nv_date, status, requires_vb_financiero, vb_financiero_status,
       invoice_number, invoiced_at, invoice_job_status, invoice_error, invoice_pdf_url,
       total_net, total_iva, total_ila, total_logistics, total_amount, total_boxes, total_units,
       delivery_address,
       client:clients(name, rut_body, rut_dv, commune, city),
       salesperson:profiles!sales_notes_salesperson_id_fkey(full_name, short_name, initials),
       payment_term:payment_terms(name, days),
       channel:sales_channels(name, display_name),
       items:sales_note_items(line_number, product_sku, product_name, quantity_boxes, quantity_units, price_net_final, line_net, line_ila, line_total)`
    )
    .in("status", ["APROBADO", "FACTURADO"])
    .order("nv_date", { ascending: false })
    .limit(1500);

  type Raw = {
    id: string;
    nv_number: string;
    nv_date: string;
    status: string;
    requires_vb_financiero: boolean;
    vb_financiero_status: string | null;
    invoice_number: string | null;
    invoiced_at: string | null;
    invoice_job_status: string | null;
    invoice_error: string | null;
    invoice_pdf_url: string | null;
    total_net: number;
    total_iva: number;
    total_ila: number;
    total_logistics: number;
    total_amount: number;
    total_boxes: number;
    total_units: number;
    delivery_address: string | null;
    client: { name: string; rut_body: number | null; rut_dv: string | null; commune: string | null; city: string | null } | null;
    salesperson: { full_name: string; short_name: string | null; initials: string | null } | null;
    payment_term: { name: string; days: number } | null;
    channel: { name: string; display_name: string } | null;
    items: FacturaItem[];
  };

  const raw = (data ?? []) as unknown as Raw[];

  const rows: FacturaRow[] = raw.map((n) => {
    const vbOk = !n.requires_vb_financiero || n.vb_financiero_status === "OTORGADO";
    const lista = n.status === "APROBADO" && vbOk && !n.invoice_number;
    const bloqueadaVB = n.status === "APROBADO" && !vbOk && !n.invoice_number;
    return {
      id: n.id,
      nv_number: n.nv_number,
      nv_date: n.nv_date,
      status: n.status,
      requires_vb_financiero: n.requires_vb_financiero,
      vb_financiero_status: n.vb_financiero_status,
      vb_ok: vbOk,
      lista,
      bloqueada_vb: bloqueadaVB,
      invoice_number: n.invoice_number,
      invoiced_at: n.invoiced_at,
      invoice_job_status: n.invoice_job_status,
      invoice_error: n.invoice_error,
      invoice_pdf_url: n.invoice_pdf_url,
      total_net: n.total_net,
      total_iva: n.total_iva,
      total_ila: n.total_ila,
      total_logistics: n.total_logistics,
      total_amount: n.total_amount,
      total_boxes: n.total_boxes,
      total_units: n.total_units,
      delivery_address: n.delivery_address,
      client: n.client,
      salesperson: n.salesperson,
      payment_term: n.payment_term,
      channel: n.channel,
      items: (n.items ?? []).sort((a, b) => a.line_number - b.line_number),
    };
  });

  return <FacturacionModule rows={rows} canEmit={canEmit} />;
}
