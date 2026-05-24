import { createClient } from "@/lib/supabase/server";
import { ClientsTable, type ClientRow, type Option } from "./ClientsTable";

export default async function ClientesAdminPage() {
  const supabase = await createClient();

  const [clientsRes, ptRes, profilesRes, channelsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, rut_body, rut_dv, name, address, commune, city, phone, email, payment_term_id, salesperson_id, channel_id, credit_line_clp, insurer_name, insurer_credit_line_clp, payment_term:payment_terms(name), salesperson:profiles(short_name, full_name)")
      .is("deleted_at", null)
      .order("name"),
    supabase.from("payment_terms").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, short_name, role:roles(name), is_active")
      .eq("is_active", true),
    supabase.from("sales_channels").select("id, display_name").eq("is_active", true),
  ]);

  const rows: ClientRow[] = ((clientsRes.data ?? []) as unknown as Array<{
    id: string; rut_body: number; rut_dv: string; name: string;
    address: string | null; commune: string | null; city: string | null;
    phone: string | null; email: string | null;
    payment_term_id: string | null; salesperson_id: string | null; channel_id: string | null;
    credit_line_clp: number; insurer_name: string | null; insurer_credit_line_clp: number;
    payment_term: { name: string } | null;
    salesperson: { short_name: string | null; full_name: string } | null;
  }>).map((c) => ({
    id: c.id, rut_body: c.rut_body, rut_dv: c.rut_dv, name: c.name,
    address: c.address, commune: c.commune, city: c.city,
    phone: c.phone, email: c.email,
    payment_term_id: c.payment_term_id, salesperson_id: c.salesperson_id, channel_id: c.channel_id,
    credit_line_clp: c.credit_line_clp, insurer_name: c.insurer_name,
    insurer_credit_line_clp: c.insurer_credit_line_clp,
    payment_term_name: c.payment_term?.name ?? null,
    salesperson_name: c.salesperson?.short_name ?? c.salesperson?.full_name ?? null,
  }));

  const paymentTerms: Option[] = (ptRes.data ?? []).map((p) => ({ id: p.id, label: p.name }));
  const channels: Option[] = (channelsRes.data ?? []).map((c) => ({ id: c.id, label: c.display_name }));
  const salespeople: Option[] = ((profilesRes.data ?? []) as unknown as Array<{
    id: string; full_name: string; short_name: string | null; role: { name: string } | null;
  }>)
    .filter((p) => p.role && ["vendedor", "jefe_ventas", "admin"].includes(p.role.name))
    .map((p) => ({ id: p.id, label: p.short_name ?? p.full_name }));

  const cities = new Set(rows.map((r) => r.city).filter(Boolean));

  return (
    <ClientsTable
      initial={rows}
      paymentTerms={paymentTerms}
      salespeople={salespeople}
      channels={channels}
      stats={{
        total: rows.length,
        with_insurer: rows.filter((r) => r.insurer_credit_line_clp > 0).length,
        without_salesperson: rows.filter((r) => !r.salesperson_id).length,
        cities: cities.size,
      }}
    />
  );
}
