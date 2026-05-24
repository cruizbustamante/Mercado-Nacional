import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default async function ProductosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, sku, name, units_per_box, base_price_net, base_price_gross, min_price_net, is_active, category:product_categories(name), brand:brands(name)")
    .is("deleted_at", null)
    .order("name");

  if (q) {
    query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data } = await query.limit(500);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    sku: string;
    name: string;
    units_per_box: number;
    base_price_net: number;
    base_price_gross: number;
    min_price_net: number;
    is_active: boolean;
    category: { name: string } | null;
    brand: { name: string } | null;
  }>;

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {rows.length} resultado{rows.length === 1 ? "" : "s"}{q ? ` para "${q}"` : ""}
          </p>
        </div>
        <Link
          href="/admin/productos/nuevo"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Nuevo producto
        </Link>
      </header>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por SKU o nombre..."
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Marca</th>
              <th className="px-3 py-2 text-right">U/Caja</th>
              <th className="px-3 py-2 text-right">Neto base</th>
              <th className="px-3 py-2 text-right">Bruto base</th>
              <th className="px-3 py-2 text-right">Mín neto</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/admin/productos/${p.id}`} className="hover:underline">{p.sku}</Link>
                </td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{p.category?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{p.brand?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{p.units_per_box}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(p.base_price_net)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(p.base_price_gross)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(p.min_price_net)}</td>
                <td className="px-3 py-2">
                  {!p.is_active && (
                    <span className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600">Inactivo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
