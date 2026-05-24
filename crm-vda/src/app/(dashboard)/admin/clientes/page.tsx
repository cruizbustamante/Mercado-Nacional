import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRut } from "@/lib/rut";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default async function ClientesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select(
      "id, rut_body, rut_dv, name, commune, city, credit_line_clp, insurer_credit_line_clp, salesperson:profiles(short_name), payment_term:payment_terms(name)"
    )
    .is("deleted_at", null)
    .order("name");

  if (q) {
    if (/^\d+$/.test(q)) {
      query = query.eq("rut_body", parseInt(q, 10));
    } else {
      query = query.ilike("name", `%${q}%`);
    }
  }

  const { data } = await query.limit(500);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    rut_body: number;
    rut_dv: string;
    name: string;
    commune: string | null;
    city: string | null;
    credit_line_clp: number;
    insurer_credit_line_clp: number;
    salesperson: { short_name: string } | null;
    payment_term: { name: string } | null;
  }>;

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {rows.length} resultado{rows.length === 1 ? "" : "s"}{q ? ` para "${q}"` : ""}
          </p>
        </div>
        <Link
          href="/admin/clientes/nuevo"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Nuevo cliente
        </Link>
      </header>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre o RUT..."
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">RUT</th>
              <th className="px-3 py-2">Razón Social</th>
              <th className="px-3 py-2">Comuna / Ciudad</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Cond. Pago</th>
              <th className="px-3 py-2 text-right">L. Crédito</th>
              <th className="px-3 py-2 text-right">L. Seguro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">{formatRut(c.rut_body, c.rut_dv)}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/clientes/${c.id}`} className="hover:underline">{c.name}</Link>
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {c.commune ?? "—"}{c.city ? ` · ${c.city}` : ""}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">{c.salesperson?.short_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{c.payment_term?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(c.credit_line_clp)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(c.insurer_credit_line_clp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
