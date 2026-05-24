import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const STATUS_COLORS: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800 border-amber-200",
  APROBADO: "bg-blue-100 text-blue-800 border-blue-200",
  RECHAZADO: "bg-red-100 text-red-800 border-red-200",
  FACTURADO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DESPACHADO: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export default async function NotaVentaPage() {
  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("sales_notes")
    .select("id, nv_number, nv_date, status, total_amount, client:clients(name), salesperson:profiles(short_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (notes ?? []) as unknown as Array<{
    id: string;
    nv_number: string;
    nv_date: string;
    status: string;
    total_amount: number;
    client: { name: string } | null;
    salesperson: { short_name: string } | null;
  }>;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notas de Venta</h1>
          <p className="mt-1 text-sm text-zinc-500">Últimas 50 emitidas.</p>
        </div>
        <Link
          href="/nota-venta/nueva"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Nueva NV
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-sm text-zinc-500">
            Aún no hay notas de venta emitidas.
          </p>
          <Link
            href="/nota-venta/nueva"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Emitir la primera NV
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2">NV</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Vendedor</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/nota-venta/${n.id}`} className="hover:underline">{n.nv_number}</Link>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">{n.nv_date}</td>
                  <td className="px-4 py-2">{n.client?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-600">{n.salesperson?.short_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[n.status] ?? "bg-zinc-100"}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt.format(n.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
