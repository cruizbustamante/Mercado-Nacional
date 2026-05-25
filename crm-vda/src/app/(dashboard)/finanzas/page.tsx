import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { FinanzasModule, type FinClient, type FinUpload } from "./FinanzasModule";

export const dynamic = "force-dynamic";

export default async function FinanzasPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const [clientsRes, uploadsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, rut_body, rut_dv, name, credit_line_clp, insurer_name, insurer_credit_line_clp, insurer_status, insurer_credit_updated_at, payment_term:payment_terms(name)")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("insurance_uploads")
      .select("id, file_date, uf_value, total_records, total_active, total_uf, total_clp, matched_clients, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const clients = (clientsRes.data ?? []) as unknown as FinClient[];
  const uploads = (uploadsRes.data ?? []) as unknown as FinUpload[];

  const conSeguro = clients.filter((c) => (c.insurer_credit_line_clp ?? 0) > 0).length;
  const activos = clients.filter((c) => c.insurer_status === "ACTIVA").length;
  const totalLinea = clients.reduce((s, c) => s + (c.insurer_credit_line_clp ?? 0), 0);

  return (
    <div className="content">
      <FinanzasModule
        clients={clients}
        uploads={uploads}
        stats={{ total: clients.length, conSeguro, activos, totalLinea }}
        isAdmin={profile.role?.name === "admin"}
      />
    </div>
  );
}
