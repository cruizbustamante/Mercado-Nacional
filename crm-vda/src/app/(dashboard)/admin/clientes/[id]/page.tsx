import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRut } from "@/lib/rut";
import { ClientForm } from "../ClientForm";

export default async function EditClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: paymentTerms }, { data: salespeople }, { data: channels }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("payment_terms").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, short_name, role:roles(name)")
      .eq("is_active", true),
    supabase.from("sales_channels").select("id, display_name").eq("is_active", true),
  ]);

  if (!client) notFound();

  const sps = (salespeople ?? []).filter((p) => {
    const r = (p as unknown as { role: { name: string } | null }).role;
    return r && ["vendedor", "jefe_ventas", "admin"].includes(r.name);
  });

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-sm">
        <Link href="/admin/clientes" className="text-zinc-500 hover:text-zinc-900">
          ← Clientes
        </Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">{formatRut(client.rut_body, client.rut_dv)}</p>
      </header>
      <ClientForm
        initial={{
          id: client.id,
          rut: `${client.rut_body}-${client.rut_dv}`,
          name: client.name,
          address: client.address,
          commune: client.commune,
          city: client.city,
          phone: client.phone,
          email: client.email,
          payment_term_id: client.payment_term_id,
          salesperson_id: client.salesperson_id,
          channel_id: client.channel_id,
          credit_line_clp: client.credit_line_clp,
          insurer_name: client.insurer_name,
          insurer_credit_line_clp: client.insurer_credit_line_clp,
        }}
        paymentTerms={paymentTerms ?? []}
        salespeople={sps as Array<{ id: string; full_name: string; short_name: string | null }>}
        channels={channels ?? []}
      />
    </div>
  );
}
