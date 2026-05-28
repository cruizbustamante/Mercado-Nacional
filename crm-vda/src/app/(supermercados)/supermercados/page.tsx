import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { parsePeriod } from "./_lib/period";
import {
  getDashboardKpis,
  getChainBreakdown,
  getRanking,
  getFilterOptions,
  type Filters,
} from "./_lib/queries";
import { TabsNav } from "./_components/TabsNav";
import { FilterSelect } from "./_components/FilterSelect";

export const revalidate = 60;

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};
const fmtNum = (n: number) => new Intl.NumberFormat("es-CL").format(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function chainBgClass(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud") || n.includes("jumbo") || n.includes("santa isabel")) return "bg-ch-cencosud";
  if (n === "alvi" || n.includes("alvi")) return "bg-orange";
  if (n === "rendic" || n.includes("rendic")) return "bg-info";
  if (n === "scpd") return "bg-warn";
  if (n.includes("smu") || n.includes("unimarc")) return "bg-ch-smu";
  if (n.includes("tottus") || n.includes("falabella")) return "bg-ch-tottus";
  if (n.includes("walmart") || n.includes("lider") || n.includes("líder") || n.includes("acuenta")) return "bg-ch-walmart";
  return "bg-ch-other";
}

const TONE_BG: Record<string, string> = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" };
const TONE_TEXT: Record<string, string> = { pos: "text-pos", warn: "text-warn", neg: "text-neg" };
function toneFor(rate: number): "pos" | "warn" | "neg" {
  return rate >= 0.85 ? "pos" : rate >= 0.5 ? "warn" : "neg";
}

function chainSubtitle(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud")) return "Jumbo · Santa Isabel · Spid 35";
  if (n === "alvi") return "Alvi mayorista";
  if (n === "rendic") return "CD Coquimbo · Transición";
  if (n === "scpd") return "Cadena independiente";
  if (n.includes("smu")) return "Unimarc · OK Market · Mayorista 10";
  if (n.includes("tottus")) return "Falabella retail";
  if (n.includes("walmart")) return "Líder · Ekono · aCuenta";
  return "";
}

// Construye un href manteniendo otros params y modificando uno
function buildHref(base: Record<string, string | undefined>, key: string, value: string | null): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && k !== key) params.set(k, v);
  }
  if (value) params.set(key, value);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string; chain?: string; brand?: string; categoria?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.mes ?? sp.periodo);

  const filters: Filters = {
    chain: sp.chain ?? null,
    brand: sp.brand ?? null,
    categoria: sp.categoria ?? null,
  };

  const hasFilters = !!(filters.chain || filters.brand || filters.categoria);

  // Cargar todo en paralelo
  const [kpis, chains, brandRanking, catRanking, skuRanking, filterOpts, supabase] = await Promise.all([
    getDashboardKpis(period, filters),
    getChainBreakdown(period, filters),
    getRanking(period, "marca", filters),
    getRanking(period, "categoria", filters),
    getRanking(period, "sku", filters),
    getFilterOptions(period),
    createClient(),
  ]);

  // Razones de venta perdida del período
  const { data: lostData } = await supabase
    .from("purchase_order_items")
    .select(`lost_sale_reason, line_amount, purchase_order:purchase_orders!inner(order_date)`)
    .gte("purchase_order.order_date", period.start)
    .lte("purchase_order.order_date", period.end)
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
  const lostTotal = Array.from(lostMap.values()).reduce(
    (a, c) => ({ count: a.count + c.count, monto: a.monto + c.monto }),
    { count: 0, monto: 0 }
  );
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
  const lostRows = Object.keys(REASON_LABELS)
    .map((k) => {
      const c = lostMap.get(k) ?? { count: 0, monto: 0 };
      return {
        key: k,
        label: REASON_LABELS[k],
        color: REASON_COLORS[k],
        count: c.count,
        monto: c.monto,
        pct: lostTotal.monto > 0 ? (c.monto / lostTotal.monto) * 100 : 0,
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.monto - a.monto);

  // Detalle mensual YTD del año actual + año anterior
  const [yearStr, monthStr] = period.paramValue.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const ytdStart = `${year}-01-01`;
  const ytdEnd = new Date(year, month, 0).toISOString().split("T")[0];
  const prevYear = year - 1;
  const [{ data: ytdData }, { data: prevYtdData }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(`order_date, total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))`)
      .gte("order_date", ytdStart)
      .lte("order_date", ytdEnd)
      .limit(2000),
    supabase
      .from("purchase_orders")
      .select(`order_date, total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))`)
      .gte("order_date", `${prevYear}-01-01`)
      .lte("order_date", `${prevYear}-12-31`)
      .limit(2000),
  ]);
  type YtdRow = { order_date: string; total_amount: number; invoices: { oc_invoice_items: { amount_invoiced: number }[] }[] };
  const ytd = (ytdData ?? []) as unknown as YtdRow[];
  const prevYtd = (prevYtdData ?? []) as unknown as YtdRow[];

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
  const monthsRange = Array.from({ length: month }, (_, i) => i + 1);
  const ytdTotal = monthsRange.reduce(
    (acc, m) => {
      const c = byMonth.get(m)!;
      return { ocCount: acc.ocCount + c.ocCount, monto: acc.monto + c.monto, fact: acc.fact + c.fact };
    },
    { ocCount: 0, monto: 0, fact: 0 }
  );
  const prevYtdTotal = monthsRange.reduce(
    (acc, m) => {
      const c = byMonthPrev.get(m)!;
      return { ocCount: acc.ocCount + c.ocCount, monto: acc.monto + c.monto, fact: acc.fact + c.fact };
    },
    { ocCount: 0, monto: 0, fact: 0 }
  );

  // Navegación de meses
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const fmtMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const totalVencidasMonto = Math.max(0, kpis.totalPerdido);
  const baseParams = { mes: period.paramValue, chain: filters.chain ?? undefined, brand: filters.brand ?? undefined, categoria: filters.categoria ?? undefined };

  return (
    <>
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 pb-4 border-b border-line">
        <div>
          <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1">
            BVDA · Mercado Nacional · Supermercados
          </div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">
            Análisis · Cumplimiento de Supermercados
          </h2>
          <p className="text-xs text-ink-2 mt-0.5">
            {kpis.ocCount} OC activas · {capitalize(period.label)}
            {hasFilters && <span className="text-wine font-medium"> · filtros activos</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <div className="inline-flex bg-bg-surface border border-line rounded-md text-xs">
            <Link href={buildHref(baseParams, "mes", fmtMes(prev))} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-l-md border-r border-line" prefetch>‹</Link>
            <span className="px-3 py-1.5 bg-ink text-white font-medium tabular" style={{ color: "#fff" }}>{capitalize(period.label)}</span>
            <Link href={buildHref(baseParams, "mes", fmtMes(next))} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-r-md border-l border-line" prefetch>›</Link>
          </div>
          <Link
            href="/admin/cargadores/oc-supermercados"
            className="text-xs px-3 py-1.5 rounded-md bg-wine inline-flex items-center gap-1.5 font-medium"
            style={{ color: "#fff" }}
            prefetch
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            <span className="hidden sm:inline">Cargar OC</span>
          </Link>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center justify-between mt-4 mb-4">
        <TabsNav ordenesCount={kpis.ocCount} alertasCount={kpis.vencidasCount} />
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2.5 bg-bg-surface border border-line rounded-md">
        <span className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">Filtros:</span>
        <FilterSelect
          paramName="chain"
          value={filters.chain ?? ""}
          placeholder="Todas las cadenas"
          options={filterOpts.chains.map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          paramName="brand"
          value={filters.brand ?? ""}
          placeholder="Todas las marcas"
          options={filterOpts.brands.map((b) => ({ value: b, label: b }))}
        />
        <FilterSelect
          paramName="categoria"
          value={filters.categoria ?? ""}
          placeholder="Todas las categorías"
          options={filterOpts.categories.map((c) => ({ value: c, label: c }))}
        />
        {hasFilters && (
          <Link
            href={`?mes=${period.paramValue}`}
            className="text-[11px] text-wine hover:underline font-medium ml-auto"
          >
            ✕ Limpiar filtros
          </Link>
        )}
      </div>

      {/* ALERT BANNER */}
      {kpis.vencidasCount > 0 && (
        <Link
          href="/supermercados/alertas"
          className="flex items-center gap-3 px-3 sm:px-4 py-2.5 mb-4 bg-neg-soft border-l-[3px] border-neg rounded-r-md hover:bg-neg-soft/70 transition-colors"
          prefetch
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F1D1D" strokeWidth="1.5" className="flex-shrink-0">
            <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-[#7F1D1D]">
              <span className="tabular">{kpis.vencidasCount} OC vencida{kpis.vencidasCount !== 1 ? "s" : ""}</span> suman{" "}
              <span className="tabular">{fmtClpCompact(totalVencidasMonto)}</span> en pendiente de facturar
            </div>
            <div className="text-[11px] text-[#A32D2D] mt-0.5 hidden sm:block">
              Revisar asignación de facturas antes del cierre de mes
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-md border border-neg/20 bg-neg-soft hover:bg-neg-soft/60 text-neg font-medium hidden sm:inline-flex items-center gap-1">
            Ver alertas
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </Link>
      )}

      {/* KPIs */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">01</div>
          <div className="text-xs font-medium text-ink">Indicadores del período</div>
          <div className="text-[10px] text-ink-3 hidden sm:block">— consolidado de OCs activas</div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-bg-surface border border-line rounded-md p-3 sm:p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Cumplimiento global</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight tabular text-ink leading-none">
                {Math.round(kpis.fillRate * 100)}<span className="text-base text-ink-2 font-normal">%</span>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 bg-bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${kpis.fillRate >= 0.85 ? "bg-pos" : kpis.fillRate >= 0.5 ? "bg-warn" : "bg-neg"}`}
                style={{ width: `${Math.round(kpis.fillRate * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-ink-2 mt-1 tabular">{kpis.ocCount} OC · cobertura {Math.round(kpis.marginCoverage * 100)}%</div>
          </div>

          <div className="bg-bg-surface border border-line rounded-md p-3 sm:p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Facturado</div>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight tabular text-ink mt-1.5 leading-none">
              {fmtClpCompact(kpis.totalFacturado)}
            </div>
            <div className="text-[10px] text-ink-2 mt-2 tabular">de {fmtClpCompact(kpis.totalOc)} en OCs</div>
          </div>

          <div className="bg-bg-surface border border-line rounded-md p-3 sm:p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Pendiente facturación</div>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight tabular text-ink mt-1.5 leading-none">
              {fmtClpCompact(kpis.totalPendiente)}
            </div>
            <div className="text-[10px] text-ink-2 mt-2 tabular">
              {kpis.totalOc > 0 ? (((kpis.totalOc - kpis.totalFacturado) / kpis.totalOc) * 100).toFixed(1) : 0}% del total
            </div>
          </div>

          <div className="bg-wine rounded-md p-3 sm:p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase font-medium" style={{ color: "#D9B8B8" }}>OC vencidas</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <div className="text-2xl sm:text-3xl font-semibold tracking-tight tabular leading-none" style={{ color: "#fff" }}>{kpis.vencidasCount}</div>
              <span className="text-[10px] tabular" style={{ color: "#D9B8B8" }}>
                {kpis.ocCount > 0 ? Math.round((kpis.vencidasCount / kpis.ocCount) * 100) : 0}% del total
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-[10px]" style={{ color: "#F5E1E1" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span className="tabular">{fmtClpCompact(totalVencidasMonto)} en pendiente</span>
            </div>
          </div>
        </div>
      </div>

      {/* DETALLE MENSUAL */}
      <div className="mt-6">
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">02</div>
          <div className="text-xs font-medium text-ink">Detalle mensual</div>
          <div className="text-[10px] text-ink-3 hidden sm:block">— facturación y cumplimiento {prevYear} vs {year} YTD</div>
        </div>
        <div className="bg-bg-surface border border-line rounded-md p-3 sm:p-4 overflow-x-auto">
          <table className="w-full text-[11px] tabular border-collapse min-w-[640px]">
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
                const prevM = byMonthPrev.get(m)!;
                const cumpl = cur.monto > 0 ? cur.fact / cur.monto : 0;
                const yoy = prevM.fact > 0 ? (cur.fact - prevM.fact) / prevM.fact : null;
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
                    <td className="text-right py-1.5 px-1.5 text-ink-2">{prevM.fact > 0 ? fmtClpCompact(prevM.fact) : "—"}</td>
                    <td className="text-right py-1.5 px-1.5 text-ink-3">{prevM.ocCount}</td>
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
      </div>

      {/* GRID 2x2 — Cadena · Marca · Categoría · Top productos · Razones · Performance */}
      <div className="mt-6">
        <div className="flex items-baseline gap-2 mb-2">
          <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">03</div>
          <div className="text-xs font-medium text-ink">Desempeño por dimensión</div>
          <div className="text-[10px] text-ink-3 hidden sm:block">— clic en una fila para filtrar</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Por cadena */}
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-sm font-medium text-ink">Por cadena</div>
              <div className="text-[10px] text-ink-3">monto OC · cumplimiento</div>
            </div>
            {chains.length === 0 ? (
              <div className="text-[11px] text-ink-3 py-6 text-center">Sin datos</div>
            ) : (
              <table className="w-full text-[11px] tabular">
                <thead className="border-b border-line">
                  <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                    <th className="text-left py-2 pl-1">Cadena</th>
                    <th className="text-right py-2 px-1.5">OC</th>
                    <th className="text-right py-2 px-1.5">Monto</th>
                    <th className="text-right py-2 pr-1">Cumpl.</th>
                  </tr>
                </thead>
                <tbody>
                  {chains.map((c) => {
                    const pct = Math.round(c.fillRate * 100);
                    const tone = toneFor(c.fillRate);
                    const isActive = filters.chain === c.id;
                    return (
                      <tr key={c.id} className={`border-b border-line last:border-b-0 hover:bg-bg-subtle ${isActive ? "bg-wine/5" : ""}`}>
                        <td className="py-1.5 pl-1">
                          <Link href={buildHref(baseParams, "chain", isActive ? null : c.id)} prefetch className="inline-flex items-center gap-1.5">
                            <span className={`w-1.5 h-3 rounded-sm ${chainBgClass(c.name)}`}></span>
                            <span className="font-medium text-ink hover:text-wine">{c.name}</span>
                            {isActive && <span className="text-[9px] text-wine">●</span>}
                          </Link>
                          {chainSubtitle(c.name) && <div className="text-[9px] text-ink-3 mt-0.5 pl-3">{chainSubtitle(c.name)}</div>}
                        </td>
                        <td className="text-right py-1.5 px-1.5">{c.ocCount}</td>
                        <td className="text-right py-1.5 px-1.5 font-medium">{fmtClpCompact(c.totalOc)}</td>
                        <td className={`text-right py-1.5 pr-1 font-medium ${TONE_TEXT[tone]}`}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Por marca */}
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-sm font-medium text-ink">Por marca</div>
              <div className="text-[10px] text-ink-3">top 10 · clic para filtrar</div>
            </div>
            {brandRanking.length === 0 ? (
              <div className="text-[11px] text-ink-3 py-6 text-center">Sin datos</div>
            ) : (
              <table className="w-full text-[11px] tabular">
                <thead className="border-b border-line">
                  <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                    <th className="text-left py-2 pl-1">Marca</th>
                    <th className="text-right py-2 px-1.5">Cajas</th>
                    <th className="text-right py-2 px-1.5">Monto OC</th>
                    <th className="text-right py-2 pr-1">Δ YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {brandRanking.slice(0, 10).map((b) => {
                    const isActive = filters.brand === b.label;
                    const delta = b.deltaOcPct;
                    return (
                      <tr key={b.key} className={`border-b border-line last:border-b-0 hover:bg-bg-subtle ${isActive ? "bg-wine/5" : ""}`}>
                        <td className="py-1.5 pl-1 truncate max-w-[140px]">
                          <Link href={buildHref(baseParams, "brand", isActive ? null : b.label)} prefetch className="font-medium text-ink hover:text-wine">
                            {b.label}
                            {isActive && <span className="text-[9px] text-wine ml-1">●</span>}
                          </Link>
                        </td>
                        <td className="text-right py-1.5 px-1.5">{fmtNum(b.boxes)}</td>
                        <td className="text-right py-1.5 px-1.5 font-medium">{fmtClpCompact(b.totalOc)}</td>
                        <td className={`text-right py-1.5 pr-1 font-medium ${delta === null ? "text-ink-3" : delta > 0 ? "text-pos" : "text-neg"}`}>
                          {delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Por categoría */}
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-sm font-medium text-ink">Por categoría</div>
              <div className="text-[10px] text-ink-3">clic para filtrar</div>
            </div>
            {catRanking.length === 0 ? (
              <div className="text-[11px] text-ink-3 py-6 text-center">Sin datos</div>
            ) : (
              <table className="w-full text-[11px] tabular">
                <thead className="border-b border-line">
                  <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                    <th className="text-left py-2 pl-1">Categoría</th>
                    <th className="text-right py-2 px-1.5">OC</th>
                    <th className="text-right py-2 px-1.5">Monto OC</th>
                    <th className="text-right py-2 pr-1">Cumpl.</th>
                  </tr>
                </thead>
                <tbody>
                  {catRanking.map((c) => {
                    const isActive = filters.categoria === c.label;
                    const pct = Math.round(c.fillRate * 100);
                    const tone = toneFor(c.fillRate);
                    return (
                      <tr key={c.key} className={`border-b border-line last:border-b-0 hover:bg-bg-subtle ${isActive ? "bg-wine/5" : ""}`}>
                        <td className="py-1.5 pl-1">
                          <Link href={buildHref(baseParams, "categoria", isActive ? null : c.label)} prefetch className="font-medium text-ink hover:text-wine">
                            {c.label}
                            {isActive && <span className="text-[9px] text-wine ml-1">●</span>}
                          </Link>
                        </td>
                        <td className="text-right py-1.5 px-1.5">{c.ocCount}</td>
                        <td className="text-right py-1.5 px-1.5 font-medium">{fmtClpCompact(c.totalOc)}</td>
                        <td className={`text-right py-1.5 pr-1 font-medium ${TONE_TEXT[tone]}`}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Top productos */}
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-sm font-medium text-ink">Top productos</div>
              <div className="text-[10px] text-ink-3">top 10 · cajas en OC</div>
            </div>
            {skuRanking.length === 0 ? (
              <div className="text-[11px] text-ink-3 py-6 text-center">Sin datos</div>
            ) : (
              <table className="w-full text-[11px] tabular">
                <thead className="border-b border-line">
                  <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                    <th className="text-left py-2 pl-1">Producto</th>
                    <th className="text-right py-2 px-1.5">Cajas</th>
                    <th className="text-right py-2 pr-1">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {skuRanking.slice(0, 10).map((s) => (
                    <tr key={s.key} className="border-b border-line last:border-b-0 hover:bg-bg-subtle">
                      <td className="py-1.5 pl-1 text-ink truncate max-w-[260px]">{s.label}</td>
                      <td className="text-right py-1.5 px-1.5 font-medium">{fmtNum(s.boxes)}</td>
                      <td className="text-right py-1.5 pr-1">{fmtClpCompact(s.totalOc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Razones venta perdida */}
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-sm font-medium text-ink">Razones de venta perdida</div>
              <div className="text-[10px] text-ink-3">acumulado del mes</div>
            </div>
            {lostRows.length === 0 ? (
              <div className="text-[11px] text-ink-3 py-6 text-center">Sin venta perdida registrada</div>
            ) : (
              <table className="w-full text-[11px] tabular">
                <thead className="border-b border-line">
                  <tr className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                    <th className="text-left py-2 pl-1">Motivo</th>
                    <th className="text-right py-2 px-1.5">Líneas</th>
                    <th className="text-right py-2 px-1.5">Monto</th>
                    <th className="text-left py-2 pl-3 w-20">Cuota</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Performance ranking */}
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-sm font-medium text-ink">Performance por cadena</div>
              <div className="text-[10px] text-ink-3">cumplimiento ordenado</div>
            </div>
            {chains.length === 0 ? (
              <div className="text-[11px] text-ink-3 py-6 text-center">Sin cadenas en el período</div>
            ) : (
              <div className="space-y-2 mt-2">
                {[...chains].sort((a, b) => b.fillRate - a.fillRate).map((c) => {
                  const pct = Math.round(c.fillRate * 100);
                  const tone = toneFor(c.fillRate);
                  return (
                    <div key={c.id} className="flex items-center gap-2 py-1">
                      <span className={`w-1.5 h-4 rounded-sm ${chainBgClass(c.name)}`}></span>
                      <span className="text-xs text-ink font-medium w-20 sm:w-24 truncate">{c.name}</span>
                      <div className="flex-1 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${TONE_BG[tone]} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[11px] tabular ${TONE_TEXT[tone]} font-medium w-10 text-right`}>{pct}%</span>
                      <span className="text-[10px] tabular text-ink-3 w-14 text-right hidden sm:inline">{fmtClpCompact(c.totalOc)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
