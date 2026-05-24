import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const fmtClp = (n: number) => `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;

export default async function OcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: oc } = await supabase
    .from("purchase_orders")
    .select(`
      *,
      chain:supermarket_chains(name),
      items:purchase_order_items(*, product:products(sku, name, base_price_net)),
      invoices:oc_invoices(*, oc_invoice_items(*))
    `)
    .eq("id", id)
    .single();

  if (!oc) notFound();

  type Item = {
    id: string; line_number: number; sku: string | null;
    upc_code: string | null; product_name_oc: string | null;
    quantity_boxes: number; units_per_pack: number | null;
    unit_price: number; line_amount: number;
    product: { sku: string; name: string; base_price_net: number } | null;
  };
  const items = ((oc.items ?? []) as Item[]).sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

  const totalFacturado = ((oc.invoices ?? []) as Array<{ oc_invoice_items: { amount_invoiced: number }[] }>)
    .reduce((s, inv) => s + (inv.oc_invoice_items ?? []).reduce((a, it) => a + (it.amount_invoiced || 0), 0), 0);
  const cumplim = oc.total_amount > 0 ? Math.round((totalFacturado / oc.total_amount) * 100) : 0;
  const chain = oc.chain as { name: string } | null;

  return (
    <div className="warm">
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">
              <Link href="/supermercados">Supermercados</Link> · {chain?.name ?? "—"}
            </div>
            <h1 className="doc-title">OC {oc.order_number}</h1>
            <p className="doc-sub">
              Emitida {oc.order_date} · vence {oc.cancellation_date ?? "—"} · {items.length} líneas
            </p>
          </div>
        </div>

        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-key">Monto OC</div>
            <div className="stat-val">{fmtClp(oc.total_amount)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Facturado</div>
            <div className="stat-val">{fmtClp(totalFacturado)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Cumplimiento</div>
            <div className={`stat-val ${cumplim >= 80 ? "ok" : cumplim >= 50 ? "warn" : "danger"}`}>{cumplim}%</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Estado</div>
            <div className="stat-val">{oc.status}</div>
          </div>
        </div>
      </section>

      <main className="content">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>UPC / Producto OC</th>
                <th>SKU interno</th>
                <th className="num">Cj</th>
                <th className="num">U/Cj</th>
                <th className="num">Precio unit.</th>
                <th className="num">Monto línea</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="num mono">{String(it.line_number).padStart(2, "0")}</td>
                  <td>
                    <div className="prod-name">{it.product_name_oc ?? "—"}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>UPC {it.upc_code}</div>
                  </td>
                  <td>
                    {it.product ? (
                      <div>
                        <span className="sku-cell">{it.product.sku}</span>
                        <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>{it.product.name}</div>
                      </div>
                    ) : <span className="badge badge-warn">sin mapear</span>}
                  </td>
                  <td className="num mono">{it.quantity_boxes}</td>
                  <td className="num mono">{it.units_per_pack ?? "—"}</td>
                  <td className="num"><span className="price">{fmtClp(it.unit_price)}</span></td>
                  <td className="num"><span className="price price-neto">{fmtClp(it.line_amount)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 24, padding: 16, background: "var(--surface)", border: "1px dashed var(--border-2)", borderRadius: "var(--r)", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
          La asignación de facturas se construirá en la siguiente iteración.
        </div>
      </main>
    </div>
  );
}
