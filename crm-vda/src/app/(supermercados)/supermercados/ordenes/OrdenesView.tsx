"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TabsNav } from "../_components/TabsNav";

export interface OrdenRow {
  id: string;
  order_number: string;
  order_date: string;       // ISO yyyy-mm-dd
  cancellation_date: string | null;
  total_amount: number;
  facturado: number;
  pendiente: number;        // total_amount - facturado
  status: string;
  items_count: number;
  boxes_total: number;      // cajas pedidas
  boxes_invoiced: number;   // cajas facturadas
  age_days: number;         // días desde order_date hasta hoy
  source_pdf: string | null;
  buyer: string | null;
  chain_id: string;
  chain_name: string;
  oc_status: "al_dia" | "por_vencer" | "vencida";
  days_overdue: number;     // positivo si vencida, negativo si por vencer
  nv_pending: number;       // NV emitidas APROBADO sin folio (pendientes de facturación)
  nv_facturada: number;     // NV ya facturadas (con folio)
}

/** Estado de NV de la OC para el badge de la lista. */
function nvBadge(o: OrdenRow): { label: string; cls: string } | null {
  if (o.nv_pending > 0) return { label: "NV pendiente", cls: "bg-info-soft text-info" };
  if (o.nv_facturada > 0) return { label: "Facturada", cls: "bg-pos-soft text-pos" };
  return null;
}

export interface ChainGroup {
  id: string;
  name: string;
  subtitle: string;
  ocCount: number;          // del grupo (filtro aplicado)
  ocCountTotal: number;     // total del mes (sin filtro)
  monto: number;
  facturado: number;
  cumpl: number;            // 0..1
  vencidas: number;
  porVencer: number;
  lineasTotal: number;
  lineasFacturadas: number;
  cobertura: number;        // % del portafolio (monto / totalGlobal)
  deltaPp: number;          // pp vs mes anterior (signed)
  bg: string;               // tailwind chain bg class
}

interface Props {
  orders: OrdenRow[];
  chainGroups: ChainGroup[];
  monthLabel: string;
  prevMesParam: string;
  nextMesParam: string;
  totalOc: number;
  totalMonto: number;
  totalFacturado: number;
  totalVencidas: number;
  totalVencidasMonto: number;
  totalLineas: number;
  totalLineasFacturadas: number;
  fillRate: number;
  deltaFillPp: number;
  prevFillPct: number;
}

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};
const fmtNum = (n: number) => new Intl.NumberFormat("es-CL").format(n);

const monthAbbr = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${monthAbbr[m - 1]}-${String(y).slice(2)}`;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const TONE_BG: Record<string, string> = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" };
const TONE_TEXT: Record<string, string> = { pos: "text-pos", warn: "text-warn", neg: "text-neg" };
const TONE_BG_SOFT: Record<string, string> = { pos: "bg-pos-soft", warn: "bg-warn-soft", neg: "bg-neg-soft" };

export function OrdenesView({
  orders, chainGroups, monthLabel, prevMesParam, nextMesParam,
  totalOc, totalMonto, totalFacturado,
  totalVencidas, totalVencidasMonto,
  totalLineas, totalLineasFacturadas,
  fillRate, deltaFillPp, prevFillPct,
}: Props) {
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [onlyVencidas, setOnlyVencidas] = useState(false);
  const [expandedChain, setExpandedChain] = useState<string | null>(() => chainGroups[0]?.id ?? null);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (chainFilter !== "all" && o.chain_id !== chainFilter) return false;
      if (onlyVencidas && o.oc_status !== "vencida") return false;
      if (q && !o.order_number.toLowerCase().includes(q) && !o.chain_name.toLowerCase().includes(q) && !(o.buyer ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, chainFilter, onlyVencidas]);

  const grouped = useMemo(() => {
    const map = new Map<string, OrdenRow[]>();
    for (const o of filteredOrders) {
      const arr = map.get(o.chain_id) ?? [];
      arr.push(o);
      map.set(o.chain_id, arr);
    }
    return chainGroups
      .map((g) => ({ group: g, rows: map.get(g.id) ?? [] }))
      .filter(({ rows }) => rows.length > 0);
  }, [filteredOrders, chainGroups]);

  // Top KPIs
  const sinAsignar = filteredOrders.filter((o) => o.facturado === 0).length;
  const sinAsignarLineas = filteredOrders.filter((o) => o.facturado === 0).reduce((s, o) => s + o.items_count, 0);
  const marcadas100 = orders.filter((o) => o.total_amount > 0 && o.facturado >= o.total_amount).length;
  const marcadas100Monto = orders.filter((o) => o.total_amount > 0 && o.facturado >= o.total_amount).reduce((s, o) => s + o.facturado, 0);

  return (
    <>
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 pb-4 border-b border-line">
        <div>
          <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1">
            BVDA · Mercado Nacional · Supermercados
          </div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">Órdenes · Asignación de facturas</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Centro de trabajo · {totalOc} OC activas · {capitalize(monthLabel)}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <div className="inline-flex bg-bg-surface border border-line rounded-md text-xs">
            <Link href={`?mes=${prevMesParam}`} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-l-md border-r border-line" prefetch>‹</Link>
            <span className="px-3 py-1.5 bg-ink text-white font-medium tabular">{capitalize(monthLabel)}</span>
            <Link href={`?mes=${nextMesParam}`} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-r-md border-l border-line" prefetch>›</Link>
          </div>
          <Link
            href="/admin/cargadores/oc-supermercados"
            className="text-xs px-3 py-1.5 rounded-md bg-wine text-white hover:bg-wine-2 inline-flex items-center gap-1.5 font-medium"
            prefetch
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            <span className="hidden sm:inline">Cargar OC</span>
          </Link>
        </div>
      </div>

      {/* TABS + FILTROS */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mt-4 mb-4 pb-3 border-b border-line">
        <TabsNav ordenesCount={totalOc} alertasCount={totalVencidas} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-2 cursor-pointer">
            <input type="checkbox" className="rounded border-line accent-wine" checked={onlyVencidas} onChange={(e) => setOnlyVencidas(e.target.checked)} />
            Solo vencidas
            <span className="text-[10px] text-neg tabular font-medium">{totalVencidas}</span>
          </label>
          <select
            value={chainFilter}
            onChange={(e) => setChainFilter(e.target.value)}
            className="text-xs bg-bg-surface border border-line rounded-md px-2.5 py-1 text-ink-2"
          >
            <option value="all">Todas las cadenas</option>
            {chainGroups.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar N° OC, cadena..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs bg-bg-surface border border-line rounded-md pl-7 pr-3 py-1 w-full placeholder-ink-3 focus:outline-none focus:border-ink-2"
            />
          </div>
        </div>
      </div>

      {/* KPI bar densa */}
      <div className="bg-bg-surface border border-line rounded-md p-3 sm:p-4 mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-px bg-line">
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-surface">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">OC abiertas</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-ink mt-1 leading-none">{totalOc}</div>
            <div className="text-[10px] text-ink-2 mt-1 tabular">{fmtClpCompact(totalMonto)} total</div>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-surface">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Líneas por fact.</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-ink mt-1 leading-none">
              {fmtNum(totalLineas - totalLineasFacturadas)}<span className="text-xs text-ink-2 font-normal"> / {fmtNum(totalLineas)}</span>
            </div>
            <div className="mt-1 h-1 bg-bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-warn rounded-full" style={{ width: `${totalLineas > 0 ? Math.round((totalLineasFacturadas / totalLineas) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-surface">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Vencidas</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-neg mt-1 leading-none">{totalVencidas}</div>
            <div className="text-[10px] text-neg mt-1 tabular font-medium">{fmtClpCompact(totalVencidasMonto)} en riesgo</div>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-surface">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">% completado</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <div className={`text-lg sm:text-xl font-semibold tabular leading-none ${fillRate >= 0.85 ? "text-pos" : fillRate >= 0.5 ? "text-warn" : "text-neg"}`}>
                {Math.round(fillRate * 100)}<span className="text-xs text-ink-2 font-normal">%</span>
              </div>
              {deltaFillPp !== 0 && (
                <span className={`text-[9px] tabular font-medium ${deltaFillPp > 0 ? "text-pos" : "text-neg"}`}>
                  {deltaFillPp > 0 ? "+" : ""}{deltaFillPp} pp
                </span>
              )}
            </div>
            <div className="text-[10px] text-ink-2 mt-1 tabular">vs mes ant. ({prevFillPct}%)</div>
          </div>

          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-subtle/40">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Sin asignar</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-warn mt-1 leading-none">{sinAsignar}</div>
            <div className="text-[10px] text-ink-2 mt-1 tabular">{fmtNum(sinAsignarLineas)} líneas</div>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-subtle/40">
            <div className="text-[9px] uppercase tracking-wider text-pos font-medium">100%</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-ink mt-1 leading-none">{marcadas100}</div>
            <div className="text-[10px] text-pos mt-1 tabular font-medium">{fmtClpCompact(marcadas100Monto)} cerrados</div>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-subtle/40">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Facturado</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-ink mt-1 leading-none">{fmtClpCompact(totalFacturado)}</div>
            <div className="text-[10px] text-ink-2 mt-1 tabular">de {fmtClpCompact(totalMonto)}</div>
          </div>
          <div className="px-3 sm:px-4 py-2 sm:py-0 bg-bg-subtle/40">
            <div className="text-[9px] uppercase tracking-wider text-neg font-medium">Vta. perdida</div>
            <div className="text-lg sm:text-xl font-semibold tabular text-ink mt-1 leading-none">{fmtClpCompact(totalVencidasMonto)}</div>
            <div className="text-[10px] text-neg mt-1 tabular font-medium">{totalVencidas} OC vencidas</div>
          </div>
        </div>
        <div className="hidden sm:flex justify-between mt-3 pt-3 border-t border-line text-[9px] uppercase tracking-[0.1em] text-ink-3 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-ink-3"></span>
            Indicadores · estado global del mes
          </span>
          <span className="inline-flex items-center gap-1.5">
            Trabajo del día · sesión activa
            <span className="w-1 h-1 rounded-full bg-ink-3"></span>
          </span>
        </div>
      </div>

      {/* CADENAS — acordeón */}
      <div className="space-y-3">
        {grouped.length === 0 ? (
          <div className="bg-bg-surface border border-line rounded-md p-8 text-center">
            <div className="text-sm font-medium text-ink">Sin OC para mostrar</div>
            <p className="text-xs text-ink-2 mt-1">
              {orders.length === 0
                ? `No hay OC cargadas en ${capitalize(monthLabel)}.`
                : "Ningún resultado matchea los filtros."}
            </p>
            {orders.length === 0 && (
              <Link href="/admin/cargadores/oc-supermercados" className="inline-block mt-3 text-xs px-3 py-1.5 rounded-md bg-wine text-white hover:bg-wine-2 font-medium" prefetch>
                Cargar OC
              </Link>
            )}
          </div>
        ) : (
          grouped.map(({ group: g, rows }) => {
            const isOpen = expandedChain === g.id;
            const pct = Math.round(g.cumpl * 100);
            const tone = g.cumpl >= 0.85 ? "pos" : g.cumpl >= 0.5 ? "warn" : "neg";
            return (
              <div key={g.id} className="bg-bg-surface border border-line rounded-md overflow-hidden">
                <div className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => setExpandedChain(isOpen ? null : g.id)}
                    className="w-full text-left px-4 pt-3 pb-2 flex items-center justify-between hover:bg-bg-subtle"
                  >
                    <div className="inline-flex items-center gap-2.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-ink-2 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                      <span className={`w-2.5 h-5 rounded-sm ${g.bg}`}></span>
                      <span className="text-sm font-semibold text-ink">{g.name}</span>
                      {g.subtitle && <span className="text-[10px] text-ink-3">{g.subtitle}</span>}
                    </div>
                    <div className="inline-flex items-center gap-2">
                      {g.vencidas > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-neg-soft text-neg font-medium tabular">
                          {g.vencidas} vencida{g.vencidas !== 1 ? "s" : ""}
                        </span>
                      )}
                      {g.porVencer > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-warn-soft text-warn font-medium tabular">
                          {g.porVencer} por vencer
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${TONE_BG_SOFT[tone]} ${TONE_TEXT[tone]} font-medium tabular`}>
                        {pct}% cumpl.
                      </span>
                    </div>
                  </button>

                  {/* Mini-dashboard */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-line border-t border-line">
                    <div className="px-3 sm:px-4 py-2 bg-bg-subtle/40">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">OC abiertas</div>
                      <div className="text-base font-semibold tabular text-ink mt-1 leading-none">
                        {g.ocCount}<span className="text-[10px] text-ink-3 font-normal"> de {g.ocCountTotal}</span>
                      </div>
                    </div>
                    <div className="px-3 sm:px-4 py-2 bg-bg-subtle/40">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Monto total</div>
                      <div className="text-base font-semibold tabular text-ink mt-1 leading-none">{fmtClpCompact(g.monto)}</div>
                      <div className="text-[9px] text-ink-2 mt-0.5 tabular">{g.cobertura.toFixed(1)}% del portafolio</div>
                    </div>
                    <div className="px-3 sm:px-4 py-2 bg-bg-subtle/40">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Cumplimiento</div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <div className={`text-base font-semibold tabular leading-none ${TONE_TEXT[tone]}`}>{pct}%</div>
                        {g.deltaPp !== 0 && (
                          <span className={`text-[9px] tabular font-medium ${g.deltaPp > 0 ? "text-pos" : "text-neg"}`}>
                            {g.deltaPp > 0 ? "+" : ""}{g.deltaPp} pp
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1 bg-bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${TONE_BG[tone]} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="px-3 sm:px-4 py-2 bg-bg-subtle/40">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Líneas / Fact.</div>
                      <div className="text-base font-semibold tabular text-ink mt-1 leading-none">
                        {fmtNum(g.lineasFacturadas)}<span className="text-[10px] text-ink-3 font-normal"> / {fmtNum(g.lineasTotal)}</span>
                      </div>
                      {g.lineasFacturadas < g.lineasTotal && (
                        <div className="text-[9px] text-neg mt-0.5 tabular font-medium">
                          {fmtNum(g.lineasTotal - g.lineasFacturadas)} sin asignar
                        </div>
                      )}
                    </div>
                    <div className={`px-3 sm:px-4 py-2 col-span-2 sm:col-span-1 ${g.cumpl >= 0.85 ? "bg-pos/[0.04]" : "bg-wine/[0.04]"}`}>
                      <div className={`text-[9px] uppercase tracking-wider font-medium ${g.cumpl >= 0.85 ? "text-pos" : "text-wine"}`}>Acción siguiente</div>
                      <div className="text-xs font-medium text-ink mt-1">
                        {g.vencidas > 0 ? "Asignar facturas" : g.cumpl >= 0.85 ? "Mantener ritmo" : "Asignar facturas"}
                      </div>
                      <div className="text-[9px] text-ink-2 mt-0.5">
                        {g.vencidas > 0 ? `${g.vencidas} OC vencidas urgentes` : `${g.ocCount} OC pendientes`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabla expandible */}
                {isOpen && (
                  <>
                    {/* Desktop header — flex con anchos fijos (mismos que las filas) */}
                    <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 border-b border-line text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                      <div className="w-3 flex-shrink-0"></div>
                      <div className="w-[124px] flex-shrink-0">N° OC</div>
                      <div className="flex-1 min-w-0">Comprador</div>
                      <div className="w-[44px] flex-shrink-0 text-right">Edad</div>
                      <div className="w-[86px] flex-shrink-0">Vence</div>
                      <div className="w-[58px] flex-shrink-0 text-right">Cajas</div>
                      <div className="w-[74px] flex-shrink-0 text-right">Monto</div>
                      <div className="w-[74px] flex-shrink-0 text-right">Pendiente</div>
                      <div className="w-[44px] flex-shrink-0 text-right">Cumpl.</div>
                      <div className="w-[92px] flex-shrink-0">NV</div>
                      <div className="w-[20px] flex-shrink-0 text-center">PDF</div>
                      <div className="w-[14px] flex-shrink-0"></div>
                    </div>
                    {rows.map((o) => {
                      const cumpl = o.total_amount > 0 ? Math.round((o.facturado / o.total_amount) * 100) : 0;
                      const dotColor = o.oc_status === "vencida" ? "bg-neg" : o.oc_status === "por_vencer" ? "bg-warn" : "bg-pos";
                      const bgRow = o.oc_status === "vencida" ? "bg-neg-soft/20" : "";
                      const cumplBg = cumpl >= 85 ? "bg-pos-soft text-pos" : cumpl >= 50 ? "bg-warn-soft text-warn" : "bg-neg-soft text-neg";
                      const ageCls = o.age_days >= 30 ? "text-neg font-medium" : o.age_days >= 14 ? "text-warn" : "text-ink-2";
                      const nv = nvBadge(o);
                      return (
                        <div key={o.id} className={`relative border-b border-line last:border-b-0 hover:bg-bg-subtle group ${bgRow}`}>
                          {/* Desktop — flex con altura fija (sin espacio muerto). Link overlay absoluto. */}
                          <div className="hidden lg:flex items-center gap-2 px-4 h-11 text-xs">
                            <Link href={`/supermercados/oc/${o.id}`} prefetch aria-label={`OC ${o.order_number}`} className="absolute inset-0 z-0" />
                            <span className="w-3 flex-shrink-0 flex items-center">
                              <span className={`pointer-events-none w-2 h-2 rounded-full ${dotColor}`}></span>
                            </span>
                            <span className="w-[124px] flex-shrink-0 pointer-events-none font-mono text-wine truncate" title={o.order_number}>{o.order_number}</span>
                            <span className="flex-1 min-w-0 pointer-events-none text-ink-2 truncate" title={o.buyer ?? ""}>{o.buyer ?? "—"}</span>
                            <span className={`w-[44px] flex-shrink-0 pointer-events-none tabular text-right ${ageCls}`}>{o.age_days}d</span>
                            <span className="w-[86px] flex-shrink-0 pointer-events-none tabular whitespace-nowrap">
                              {o.oc_status === "vencida" ? (
                                <><span className="text-neg font-medium">{fmtDate(o.cancellation_date)}</span><span className="text-[10px] text-neg ml-1">+{o.days_overdue}d</span></>
                              ) : o.oc_status === "por_vencer" ? (
                                <><span className="text-warn font-medium">{fmtDate(o.cancellation_date)}</span><span className="text-[10px] text-warn ml-1">{Math.abs(o.days_overdue)}d</span></>
                              ) : (
                                <span className="text-ink-2">{fmtDate(o.cancellation_date)}</span>
                              )}
                            </span>
                            <span className="w-[58px] flex-shrink-0 pointer-events-none tabular text-right text-ink-2">
                              {o.boxes_invoiced > 0 ? <><span className="text-ink font-medium">{fmtNum(o.boxes_invoiced)}</span><span className="text-ink-3">/{fmtNum(o.boxes_total)}</span></> : fmtNum(o.boxes_total)}
                            </span>
                            <span className="w-[74px] flex-shrink-0 pointer-events-none font-medium tabular text-right text-ink">{fmtClpCompact(o.total_amount)}</span>
                            <span className={`w-[74px] flex-shrink-0 pointer-events-none tabular text-right ${o.pendiente > 0 ? (o.oc_status === "vencida" ? "text-neg font-medium" : "text-warn") : "text-ink-3"}`}>
                              {o.pendiente > 0 ? fmtClpCompact(o.pendiente) : "—"}
                            </span>
                            <span className="w-[44px] flex-shrink-0 pointer-events-none text-right">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium tabular ${cumplBg}`}>{cumpl}%</span>
                            </span>
                            <span className="w-[92px] flex-shrink-0 pointer-events-none">
                              {nv
                                ? <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap ${nv.cls}`}>{nv.label}</span>
                                : <span className="text-[10px] text-ink-3">—</span>}
                            </span>
                            {o.source_pdf ? (
                              <a
                                href={o.source_pdf}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="w-[20px] flex-shrink-0 relative z-10 pointer-events-auto text-ink-3 hover:text-wine inline-flex justify-center"
                                title="Abrir PDF de OC"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
                              </a>
                            ) : <span className="w-[20px] flex-shrink-0 pointer-events-none text-ink-3 text-center">—</span>}
                            <span className="w-[14px] flex-shrink-0 pointer-events-none inline-flex justify-end">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-3 group-hover:text-ink-2"><path d="M9 6l6 6-6 6"/></svg>
                            </span>
                          </div>
                          {/* Mobile */}
                          <Link href={`/supermercados/oc/${o.id}`} prefetch className="block lg:hidden px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`}></span>
                                <span className="text-xs font-mono text-wine">{o.order_number}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium tabular ${cumplBg}`}>{cumpl}%</span>
                                {nv && <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium whitespace-nowrap ${nv.cls}`}>{nv.label}</span>}
                              </div>
                              <span className="text-xs font-medium tabular text-ink">{fmtClpCompact(o.total_amount)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[10px] text-ink-2">
                              <span className="truncate min-w-0 max-w-[60%]">{o.buyer ?? "—"} · {fmtNum(o.boxes_total)} cj</span>
                              {o.oc_status === "vencida" ? (
                                <span className="text-neg font-medium">Vencida +{o.days_overdue}d</span>
                              ) : o.oc_status === "por_vencer" ? (
                                <span className="text-warn font-medium">Vence en {Math.abs(o.days_overdue)}d</span>
                              ) : (
                                <span>{o.age_days}d · {fmtDate(o.cancellation_date)}</span>
                              )}
                            </div>
                            {o.pendiente > 0 && (
                              <div className="text-[10px] text-warn tabular mt-0.5 font-medium">
                                Pendiente {fmtClpCompact(o.pendiente)}
                              </div>
                            )}
                          </Link>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Leyenda */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 mt-3 text-[10px] text-ink-3">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pos"></span>Al día</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn"></span>Por vencer</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-neg"></span>Vencida</span>
        </div>
        <span>{filteredOrders.length} OC mostradas</span>
      </div>
    </>
  );
}
