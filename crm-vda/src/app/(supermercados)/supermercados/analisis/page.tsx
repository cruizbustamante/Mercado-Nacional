import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { parsePeriod } from "../_lib/period";
import { getChainBreakdown, getTopSkus } from "../_lib/queries";
import { TabsNav } from "../_components/TabsNav";

export const revalidate = 60;

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};
const fmtNum = (n: number) => new Intl.NumberFormat("es-CL").format(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const TONE_BG: Record<string, string> = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" };
const TONE_TEXT: Record<string, string> = { pos: "text-pos", warn: "text-warn", neg: "text-neg" };

function chainBg(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud")) return "bg-ch-cencosud";
  if (n.includes("smu")) return "bg-ch-smu";
  if (n.includes("tottus")) return "bg-ch-tottus";
  if (n.includes("walmart") || n.includes("lider") || n.includes("líder")) return "bg-ch-walmart";
  return "bg-ch-other";
}

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.mes ?? sp.periodo);
  const supabase = await createClient();

  const [yearStr, monthStr] = period.paramValue.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Detalle mensual YTD del año actual
  const ytdStart = `${year}-01-01`;
  const ytdEnd = new Date(year, month, 0).toISOString().split("T")[0];
  const { data: ytdData } = await supabase
    .from("purchase_orders")
    .select(`order_date, total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))`)
    .gte("order_date", ytdStart)
    .lte("order_date", ytdEnd)
    .limit(2000);
  type YtdRow = { order_date: string; total_amount: number; invoices: { oc_invoice_items: { amount_invoiced: number }[] }[] };
  const ytd = (ytdData ?? []) as unknown as YtdRow[];

  // Año anterior YTD
  const prevYear = year - 1;
  const prevStart = `${prevYear}-01-01`;
  const prevEnd = `${prevYear}-12-31`;
  const { data: prevYtdData } = await supabase
    .from("purchase_orders")
    .select(`order_date, total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))`)
    .gte("order_date", prevStart)
    .lte("order_date", prevEnd)
    .limit(2000);
  const prevYtd = (prevYtdData ?? []) as unknown as YtdRow[];

  // Agrupar por mes
  const byMonth = new Map<number, { ocCount: number; monto: number; fact: number }>();
  const byMonthPrev = new Map<number, { ocCount: number; monto: number; fact: number }>();
  for (let i = 1; i <= 12; i++) {
    byMonth.set(i, { ocCount: 0, monto: 0, fact: 0 });
    byMonthPrev.set(i, { ocCount: 0, monto: 0, fact: 0 });
  }
  for (const o of ytd) {
    const m = parseInt(o.order_date.slice(5, 7), 10);
    const cell = byMonth.get(m)!;
    cell.ocCount++;
    cell.monto += o.total_amount;
    cell.fact += o.invoices.reduce((a, inv) => a + inv.oc_invoice_items.reduce((aa, it) => aa + (it.amount_invoiced || 0), 0), 0);
  }
  for (const o of prevYtd) {
    const m = parseInt(o.order_date.slice(5, 7), 10);
    const cell = byMonthPrev.get(m)!;
    cell.ocCount++;
    cell.monto += o.total_amount;
    cell.fact += o.invoices.reduce((a, inv) => a + inv.oc_invoice_items.reduce((aa, it) => aa + (it.amount_invoiced || 0), 0), 0);
  }

  // Solo meses hasta el actual
  const monthsRange = Array.from({ length: month }, (_, i) => i + 1);

  const ytdTotal = monthsRange.reduce((acc, m) => {
    const c = byMonth.get(m)!;
    acc.ocCount += c.ocCount;
    acc.monto += c.monto;
    acc.fact += c.fact;
    return acc;
  }, { ocCount: 0, monto: 0, fact: 0 });
  const prevYtdTotal = monthsRange.reduce((acc, m) => {
    const c = byMonthPrev.get(m)!;
    acc.ocCount += c.ocCount;
    acc.monto += c.monto;
    acc.fact += c.fact;
    return acc;
  }, { ocCount: 0, monto: 0, fact: 0 });

  // Por cadena (período actual)
  const chains = await getChainBreakdown(period);
  const topSkus = await getTopSkus(period, 5);

  // Razones de venta perdida
  const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const end = new Date(year, month, 0).toISOString().split("T")[0];
  const { data: lostData } = await supabase
    .from("purchase_order_items")
    .select(`lost_sale_reason, line_amount, purchase_order:purchase_orders!inner(order_date)`)
    .gte("purchase_order.order_date", start)
    .lte("purchase_order.order_date", end)
    .not("lost_sale_reason", "is", null)
    .limit(5000);
  type LostRow = { lost_sale_reason: string; line_amount: number };
  const lostRaw = (lostData ?? []) as unknown as LostRow[];
  const lostMap = new Map<string, { count: number; monto: number }>();
  for (const r of lostRaw) {
    if (!r.lost_sale_reason) continue;
    const cell = lostMap.get(r.lost_sale_reason) ?? { count: 0, monto: 0 };
    cell.count++;
    cell.monto += r.line_amount || 0;
    lostMap.set(r.lost_sale_reason, cell);
  }
  const lostTotal = Array.from(lostMap.values()).reduce((a, c) => ({ count: a.count + c.count, monto: a.monto + c.monto }), { count: 0, monto: 0 });
  const REASON_LABELS: Record<string, string> = {
    sin_stock: "Sin stock",
    no_entro_cd: "No entró a CD",
    fuera_plazo: "Fuera de plazo",
    error_mapeo: "Error de mapeo",
    otro: "Otro",
  };
  const REASON_COLORS: Record<string, string> = {
    sin_stock: "bg-neg",
    no_entro_cd: "bg-orange",
    fuera_plazo: "bg-warn",
    error_mapeo: "bg-info",
    otro: "bg-ink-3",
  };
  const lostRows = Object.keys(REASON_LABELS).map((k) => {
    const c = lostMap.get(k) ?? { count: 0, monto: 0 };
    return {
      key: k,
      label: REASON_LABELS[k],
      color: REASON_COLORS[k],
      count: c.count,
      monto: c.monto,
      pct: lostTotal.monto > 0 ? (c.monto / lostTotal.monto) * 100 : 0,
    };
  }).filter((r) => r.count > 0).sort((a, b) => b.monto - a.monto);

  // Mes nav
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const fmtMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  // Total de cadenas para porcentajes
  const totalChainsMonto = chains.reduce((s, c) => s + c.totalOc, 0);
  const totalChainsOc = chains.reduce((s, c) => s + c.ocCount, 0);

  return (
    <>
      {/* PAGE HEADER */}
      <div className="flex justify-between items-start pb-5 border-b border-line">
        <div>
          <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1.5">
            BVDA · Mercado Nacional · Supermercados
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Análisis · Desempeño por dimensión</h2>
          <p className="text-xs text-ink-2 mt-1">
            Comparativo YTD {year} vs {prevYear} · {capitalize(period.label)}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex bg-bg-surface border border-line rounded-md text-xs">
            <Link href={`?mes=${fmtMes(prevDate)}`} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-l-md border-r border-line" prefetch>‹</Link>
            <span className="px-3 py-1.5 bg-ink text-white font-medium tabular">{capitalize(period.label)}</span>
            <Link href={`?mes=${fmtMes(nextDate)}`} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-r-md border-l border-line" prefetch>›</Link>
          </div>
          <Link
            href="/admin/cargadores/oc-supermercados"
            className="text-xs px-3 py-1.5 rounded-md bg-wine text-white hover:bg-wine-2 inline-flex items-center gap-1.5 font-medium"
            prefetch
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Cargar OC
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5 mb-5">
        <TabsNav ordenesCount={ytdTotal.ocCount} alertasCount={0} />
      </div>

      {/* DETALLE MENSUAL */}
      <div className="bg-bg-surface border border-line rounded-md p-4 mb-3">
        <div className="flex justify-between items-end mb-2">
          <div>
            <div className="text-sm font-medium text-ink">Detalle mensual</div>
            <div className="text-[11px] text-ink-2 mt-0.5">Facturación y cumplimiento · {prevYear} vs {year} YTD</div>
          </div>
          <span className="text-[10px] text-ink-3">valores en CLP</span>
        </div>

        <table className="w-full text-[11px] tabular border-collapse">
          <thead>
            <tr className="border-b border-line text-[9px] uppercase tracking-wider text-ink-3 font-medium">
              <th className="text-left py-2 pl-1">Mes</th>
              <th className="text-right py-2 px-1.5" colSpan={2}>Total OC {year}</th>
              <th className="text-right py-2 px-1.5" colSpan={2}>Facturado {year}</th>
              <th className="text-right py-2 px-1.5">% cumpl.</th>
              <th className="text-right py-2 px-1.5" colSpan={2}>Facturado {prevYear}</th>
              <th className="text-right py-2 pr-1">Δ YoY</th>
            </tr>
            <tr className="border-b border-line text-[9px] uppercase tracking-wider text-ink-3">
              <th></th>
              <th className="text-right py-1 px-1.5 font-normal">Monto</th>
              <th className="text-right py-1 px-1.5 font-normal">OC</th>
              <th className="text-right py-1 px-1.5 font-normal">Monto</th>
              <th className="text-right py-1 px-1.5 font-normal">OC</th>
              <th></th>
              <th className="text-right py-1 px-1.5 font-normal">Monto</th>
              <th className="text-right py-1 px-1.5 font-normal">OC</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {monthsRange.map((m) => {
              const cur = byMonth.get(m)!;
              const prev = byMonthPrev.get(m)!;
              const cumpl = cur.monto > 0 ? cur.fact / cur.monto : 0;
              const yoy = prev.fact > 0 ? (cur.fact - prev.fact) / prev.fact : null;
              const cumplCls = cumpl >= 0.5 ? "text-pos" : cumpl >= 0.3 ? "text-warn" : "text-neg";
              const yoyCls = yoy === null ? "text-ink-3" : yoy > 0 ? "text-pos" : "text-neg";
              const isCurrent = m === month;
              return (
                <tr key={m} className={`border-b border-line hover:bg-bg-subtle text-ink ${isCurrent ? "bg-bg-subtle/40" : ""}`}>
                  <td className={`py-1.5 pl-1 ${isCurrent ? "text-ink" : "text-ink-2"} font-medium`}>{MONTHS_SHORT[m - 1]}</td>
                  <td className={`text-right py-1.5 px-1.5 ${isCurrent ? "font-medium" : ""}`}>{cur.monto > 0 ? fmtClpCompact(cur.monto) : "—"}</td>
                  <td className="text-right py-1.5 px-1.5 text-ink-3">{cur.ocCount}</td>
                  <td className={`text-right py-1.5 px-1.5 ${isCurrent ? "font-medium" : ""}`}>{cur.fact > 0 ? fmtClpCompact(cur.fact) : "—"}</td>
                  <td className="text-right py-1.5 px-1.5 text-ink-3">{cur.ocCount > 0 && cur.fact > 0 ? Math.round(cur.fact / Math.max(1, cur.monto / cur.ocCount)) : 0}</td>
                  <td className={`text-right py-1.5 px-1.5 font-medium ${cumplCls}`}>{cur.monto > 0 ? `${Math.round(cumpl * 100)}%` : "—"}</td>
                  <td className="text-right py-1.5 px-1.5 text-ink-2">{prev.fact > 0 ? fmtClpCompact(prev.fact) : "—"}</td>
                  <td className="text-right py-1.5 px-1.5 text-ink-3">{prev.ocCount}</td>
                  <td className={`text-right py-1.5 pr-1 font-medium ${yoyCls}`}>{yoy === null ? "—" : `${yoy > 0 ? "+" : ""}${Math.round(yoy * 100)}%`}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-wine font-medium">
              <td className="py-2 pl-1 text-[9px] uppercase tracking-wider text-ink-3">YTD</td>
              <td className="text-right py-2 px-1.5">{fmtClpCompact(ytdTotal.monto)}</td>
              <td className="text-right py-2 px-1.5 text-ink-3">{ytdTotal.ocCount}</td>
              <td className="text-right py-2 px-1.5">{fmtClpCompact(ytdTotal.fact)}</td>
              <td className="text-right py-2 px-1.5 text-ink-3">—</td>
              <td className={`text-right py-2 px-1.5 ${ytdTotal.monto > 0 && ytdTotal.fact / ytdTotal.monto >= 0.5 ? "text-pos" : "text-warn"}`}>
                {ytdTotal.monto > 0 ? `${Math.round((ytdTotal.fact / ytdTotal.monto) * 100)}%` : "—"}
              </td>
              <td className="text-right py-2 px-1.5 text-ink-2">{fmtClpCompact(prevYtdTotal.fact)}</td>
              <td className="text-right py-2 px-1.5 text-ink-3">{prevYtdTotal.ocCount}</td>
              <td className={`text-right py-2 pr-1 ${prevYtdTotal.fact > 0 && ytdTotal.fact > prevYtdTotal.fact ? "text-pos" : "text-neg"}`}>
                {prevYtdTotal.fact > 0 ? `${ytdTotal.fact > prevYtdTotal.fact ? "+" : ""}${Math.round(((ytdTotal.fact - prevYtdTotal.fact) / prevYtdTotal.fact) * 100)}%` : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* GRID 2x2 */}
      <div className="grid grid-cols-2 gap-3 mt-3">

        {/* Por cadena */}
        <div className="bg-bg-surface border border-line rounded-md p-4">
          <div className="flex justify-between items-baseline mb-2">
            <div>
              <div className="text-sm font-medium text-ink">Por cadena</div>
              <div className="text-[11px] text-ink-2 mt-0.5">{capitalize(period.label)} · monto OC vs facturado</div>
            </div>
          </div>
          <table className="w-full text-[11px] tabular">
            <thead className="border-b border-line">
              <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                <th className="text-left py-2 pl-1">Cadena</th>
                <th className="text-right py-2 px-1.5">OC</th>
                <th className="text-right py-2 px-1.5">Monto</th>
                <th className="text-right py-2 pr-1">% cumpl.</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => {
                const pct = Math.round(c.fillRate * 100);
                const cls = c.fillRate >= 0.85 ? "text-pos" : c.fillRate >= 0.5 ? "text-warn" : "text-neg";
                return (
                  <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-bg-subtle">
                    <td className="py-1.5 pl-1">
                      <div className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${chainBg(c.name)}`}></span>
                        <span className="font-medium text-ink">{c.name}</span>
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-1.5">{c.ocCount}</td>
                    <td className="text-right py-1.5 px-1.5 font-medium">{fmtClpCompact(c.totalOc)}</td>
                    <td className={`text-right py-1.5 pr-1 font-medium ${cls}`}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-line-2 font-medium">
              <tr>
                <td className="py-2 pl-1 text-[9px] uppercase tracking-wider text-ink-3">Total</td>
                <td className="text-right py-2 px-1.5">{totalChainsOc}</td>
                <td className="text-right py-2 px-1.5">{fmtClpCompact(totalChainsMonto)}</td>
                <td className={`text-right py-2 pr-1 ${chains.length > 0 && chains.reduce((s, c) => s + c.totalFacturado, 0) / Math.max(1, totalChainsMonto) >= 0.5 ? "text-pos" : "text-neg"}`}>
                  {totalChainsMonto > 0 ? `${Math.round((chains.reduce((s, c) => s + c.totalFacturado, 0) / totalChainsMonto) * 100)}%` : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Razones venta perdida */}
        <div className="bg-bg-surface border border-line rounded-md p-4">
          <div className="flex justify-between items-baseline mb-2">
            <div>
              <div className="text-sm font-medium text-ink">Razones de venta perdida</div>
              <div className="text-[11px] text-ink-2 mt-0.5">Líneas no facturadas · acumulado mes</div>
            </div>
          </div>
          {lostRows.length === 0 ? (
            <div className="text-[11px] text-ink-3 py-6 text-center">Sin venta perdida registrada en el período</div>
          ) : (
            <table className="w-full text-[11px] tabular">
              <thead className="border-b border-line">
                <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                  <th className="text-left py-2 pl-1">Motivo</th>
                  <th className="text-right py-2 px-1.5">Líneas</th>
                  <th className="text-right py-2 px-1.5">Monto</th>
                  <th className="text-left py-2 pl-3 w-20">Cuota</th>
                  <th className="text-right py-2 pr-1">%</th>
                </tr>
              </thead>
              <tbody>
                {lostRows.map((r) => (
                  <tr key={r.key} className="border-b border-line last:border-b-0 hover:bg-bg-subtle">
                    <td className="py-1.5 pl-1 font-medium">{r.label}</td>
                    <td className="text-right py-1.5 px-1.5">{r.count}</td>
                    <td className="text-right py-1.5 px-1.5 font-medium">{fmtClpCompact(r.monto)}</td>
                    <td className="py-1.5 pl-3">
                      <div className="h-1.5 bg-bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${r.color} rounded-full`} style={{ width: `${r.pct}%` }} />
                      </div>
                    </td>
                    <td className="text-right py-1.5 pr-1 text-ink-2">{r.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line-2 font-medium">
                <tr>
                  <td className="py-2 pl-1 text-[9px] uppercase tracking-wider text-ink-3">Total venta perdida</td>
                  <td className="text-right py-2 px-1.5">{lostTotal.count}</td>
                  <td className="text-right py-2 px-1.5 text-neg">{fmtClpCompact(lostTotal.monto)}</td>
                  <td className="py-2 pl-3 text-[10px] text-ink-3">100%</td>
                  <td className="text-right py-2 pr-1 text-ink-3">100%</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Top productos */}
        <div className="bg-bg-surface border border-line rounded-md p-4">
          <div className="flex justify-between items-baseline mb-2">
            <div>
              <div className="text-sm font-medium text-ink">Top productos pedidos</div>
              <div className="text-[11px] text-ink-2 mt-0.5">{capitalize(period.label)} · cajas en OC</div>
            </div>
          </div>
          {topSkus.length === 0 ? (
            <div className="text-[11px] text-ink-3 py-6 text-center">Sin datos en el período</div>
          ) : (
            <table className="w-full text-[11px] tabular">
              <thead className="border-b border-line">
                <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                  <th className="text-left py-2 pl-1">SKU</th>
                  <th className="text-left py-2 px-1.5">Producto</th>
                  <th className="text-right py-2 px-1.5">Cajas</th>
                  <th className="text-right py-2 pr-1">Monto OC</th>
                </tr>
              </thead>
              <tbody>
                {topSkus.map((s) => (
                  <tr key={s.product_id ?? s.name} className="border-b border-line last:border-b-0 hover:bg-bg-subtle">
                    <td className="py-1.5 pl-1 font-mono text-[10px] text-ink-2">{s.sku ?? "—"}</td>
                    <td className="py-1.5 px-1.5 text-ink truncate max-w-xs">{s.name}</td>
                    <td className="text-right py-1.5 px-1.5 font-medium">{fmtNum(s.boxes)}</td>
                    <td className="text-right py-1.5 pr-1">{fmtClpCompact(s.totalOc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Performance por cadena ranking */}
        <div className="bg-bg-surface border border-line rounded-md p-4">
          <div className="flex justify-between items-baseline mb-2">
            <div>
              <div className="text-sm font-medium text-ink">Performance por cadena</div>
              <div className="text-[11px] text-ink-2 mt-0.5">Cumplimiento ordenado · top a fondo</div>
            </div>
          </div>
          {chains.length === 0 ? (
            <div className="text-[11px] text-ink-3 py-6 text-center">Sin cadenas en el período</div>
          ) : (
            <div className="space-y-2 mt-2">
              {[...chains].sort((a, b) => b.fillRate - a.fillRate).map((c) => {
                const pct = Math.round(c.fillRate * 100);
                const tone = c.fillRate >= 0.85 ? "pos" : c.fillRate >= 0.5 ? "warn" : "neg";
                return (
                  <div key={c.id} className="flex items-center gap-2 py-1">
                    <span className={`w-1.5 h-4 rounded-sm ${chainBg(c.name)}`}></span>
                    <span className="text-xs text-ink font-medium w-24 truncate">{c.name}</span>
                    <div className="flex-1 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${TONE_BG[tone]} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[11px] tabular ${TONE_TEXT[tone]} font-medium w-10 text-right`}>{pct}%</span>
                    <span className="text-[10px] tabular text-ink-3 w-16 text-right">{fmtClpCompact(c.totalOc)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
