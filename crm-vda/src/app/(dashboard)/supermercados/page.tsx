import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const fmtClp = (n: number) => `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;

const STATUS_COLOR: Record<string, string> = {
  ACTIVA: "badge-info",
  PARCIAL: "badge-warn",
  COMPLETADA: "badge-ok",
  VENCIDA: "badge-danger",
  CANCELLED: "badge-warn",
};

export default async function SupermercadosPage({
  searchParams,
}: {
  searchParams: Promise<{ chain?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Periodo: por defecto mes actual
  const now = new Date();
  const mesParam = params.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = mesParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const end = new Date(year, month, 0).toISOString().split("T")[0];

  // Cargar todas las cadenas para chips
  const [{ data: chains }, { data: ordersData }] = await Promise.all([
    supabase.from("supermarket_chains").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("purchase_orders")
      .select(`
        id, order_number, order_date, cancellation_date, total_amount, status, source_pdf,
        chain:supermarket_chains(id, name),
        items:purchase_order_items(line_amount),
        invoices:oc_invoices(id, oc_invoice_items(amount_invoiced, boxes_invoiced))
      `)
      .gte("order_date", start)
      .lte("order_date", end)
      .order("order_date", { ascending: false })
      .limit(500),
  ]);

  type OcRow = {
    id: string;
    order_number: string;
    order_date: string;
    cancellation_date: string | null;
    total_amount: number;
    status: string;
    source_pdf: string | null;
    chain: { id: string; name: string } | null;
    items: { line_amount: number }[];
    invoices: { id: string; oc_invoice_items: { amount_invoiced: number; boxes_invoiced: number }[] }[];
  };

  const allOrders = (ordersData ?? []) as unknown as OcRow[];

  // Si hay filtro de cadena
  const chainFilter = params.chain ?? null;
  const orders = chainFilter ? allOrders.filter((o) => o.chain?.id === chainFilter) : allOrders;

  // KPIs
  const totalOc = orders.length;
  const totalMonto = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalFacturado = orders.reduce((s, o) => {
    return s + o.invoices.reduce((acc, inv) => acc + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0), 0);
  }, 0);
  const cumplim = totalMonto > 0 ? Math.round((totalFacturado / totalMonto) * 100) : 0;
  const vencidas = orders.filter((o) => o.cancellation_date && new Date(o.cancellation_date) < now && o.status !== "COMPLETADA").length;

  // Chips por cadena (count en allOrders, no filtrado)
  const chainCounts = new Map<string, number>();
  for (const o of allOrders) {
    if (o.chain) chainCounts.set(o.chain.id, (chainCounts.get(o.chain.id) ?? 0) + 1);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  return (
    <div className="warm">
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Cumplimiento</div>
            <h1 className="doc-title">Supermercados</h1>
            <p className="doc-sub">
              OC vs facturación por cadena · período: <b style={{ color: "var(--text)", textTransform: "capitalize" }}>{monthLabel}</b>
            </p>
          </div>
        </div>

        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-key">Total OC</div>
            <div className="stat-val">{totalOc}</div>
            <div className="stat-sub">en el periodo</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Monto OC</div>
            <div className="stat-val">{fmtClp(totalMonto)}</div>
            <div className="stat-sub">solicitado</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Monto facturado</div>
            <div className="stat-val">{fmtClp(totalFacturado)}</div>
            <div className="stat-sub">acumulado</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Cumplimiento</div>
            <div className={`stat-val ${cumplim >= 80 ? "ok" : cumplim >= 50 ? "warn" : "danger"}`}>{cumplim}%</div>
            <div className="stat-sub">facturado / OC</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">OC vencidas</div>
            <div className={`stat-val ${vencidas > 0 ? "danger" : "ok"}`}>{vencidas}</div>
            <div className="stat-sub">{vencidas > 0 ? "fuera de plazo" : "ninguna"}</div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="filter-chips">
            <Link href={`/supermercados?mes=${mesParam}`} className={`chip ${!chainFilter ? "active" : ""}`}>
              Todas <span className="count">{allOrders.length}</span>
            </Link>
            {(chains ?? []).map((ch) => (
              <Link key={ch.id} href={`/supermercados?mes=${mesParam}&chain=${ch.id}`} className={`chip ${chainFilter === ch.id ? "active" : ""}`}>
                {ch.name} <span className="count">{chainCounts.get(ch.id) ?? 0}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <main className="content">
        {orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", background: "var(--surface)", border: "1px dashed var(--border-2)", borderRadius: "var(--r)" }}>
            <p style={{ color: "var(--text-3)", fontSize: 14 }}>
              {chainFilter ? "No hay OC para esta cadena en el período." : "No hay OC cargadas en este período."}
            </p>
            <Link href="/admin/cargadores/oc-supermercados" className="btn btn-primary" style={{ marginTop: 14, display: "inline-flex" }}>
              + Cargar OC
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Cadena</th>
                  <th>N° Orden</th>
                  <th>Fecha</th>
                  <th>Vence</th>
                  <th>Líneas</th>
                  <th className="num">Monto OC</th>
                  <th className="num">Facturado</th>
                  <th className="num">Cumpl.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const facturado = o.invoices.reduce((acc, inv) => acc + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0), 0);
                  const ocCumplim = o.total_amount > 0 ? Math.round((facturado / o.total_amount) * 100) : 0;
                  const vencida = o.cancellation_date && new Date(o.cancellation_date) < now && o.status !== "COMPLETADA";
                  return (
                    <tr key={o.id} onClick={() => (window.location.href = `/supermercados/${o.id}`)} style={{ cursor: "pointer" }}>
                      <td>{o.chain?.name ?? "—"}</td>
                      <td>
                        <Link href={`/supermercados/${o.id}`} className="sku-cell" style={{ color: "var(--text)" }}>
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{o.order_date}</td>
                      <td className="mono" style={{ fontSize: 11.5, color: vencida ? "var(--danger)" : undefined }}>
                        {o.cancellation_date ?? "—"}
                      </td>
                      <td className="num mono">{o.items.length}</td>
                      <td className="num"><span className="price">{fmtClp(o.total_amount)}</span></td>
                      <td className="num"><span className={`price ${facturado > 0 ? "price-neto" : ""}`}>{fmtClp(facturado)}</span></td>
                      <td className="num">
                        <span style={{ color: ocCumplim >= 80 ? "var(--success)" : ocCumplim >= 50 ? "var(--warning)" : "var(--danger)", fontFamily: "var(--f-mono)" }}>
                          {ocCumplim}%
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLOR[o.status] ?? "badge-info"}`}>{o.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
