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
  status: string;
  items_count: number;
  buyer: string | null;
  chain_id: string;
  chain_name: string;
  oc_status: "al_dia" | "por_vencer" | "vencida";
  days_overdue: number;     // positivo si vencida, negativo si por vencer
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
      <div className="flex justify-between items-start pb-5 border-b border-line">
        <div>
          <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1.5">
            BVDA · Mercado Nacional · Supermercados
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Órdenes · Asignación de facturas</h2>
          <p className="text-xs text-ink-2 mt-1">
            Centro de trabajo · {totalOc} OC activas · {capitalize(monthLabel)}
          </p>
        </div>
        <div className="flex gap-2">
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
            Cargar OC
          </Link>
        </div>
      </div>

      {/* TABS + FILTROS */}
      <div className="flex items-center justify-between mt-5 mb-5 pb-4 border-b border-line">
        <TabsNav ordenesCount={totalOc} alertasCount={totalVencidas} />
        <div className="flex items-center gap-2">
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
          <div className="relative">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar N° OC, cadena o comprador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs bg-bg-surface border border-line rounded-md pl-7 pr-3 py-1 w-64 placeholder-ink-3 focus:outline-none focus:border-ink-2"
            />
          </div>
        </div>
      </div>

      {/* KPI bar densa */}
      <div className="bg-bg-surface border border-line rounded-md p-4 mb-3">
        <div className="grid grid-cols-8 divide-x divide-line">
          <div className="px-4 first:pl-0">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">OC abiertas</div>
            <div className="text-xl font-semibold tabular text-ink mt-1 leading-none">{totalOc}</div>
            <div className="text-[10px] text-ink-2 mt-1.5 tabular">{fmtClpCompact(totalMonto)} total</div>
          </div>
          <div className="px-4">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Líneas por facturar</div>
            <div className="text-xl font-semibold tabular text-ink mt-1 leading-none">
              {fmtNum(totalLineas - totalLineasFacturadas)}<span className="text-xs text-ink-2 font-normal"> / {fmtNum(totalLineas)}</span>
            </div>
            <div className="mt-1.5 h-1 bg-bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-warn rounded-full" style={{ width: `${totalLineas > 0 ? Math.round((totalLineasFacturadas / totalLineas) * 100) : 0}%` }} />
            </div>
          </div>
          <div className="px-4">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Vencidas</div>
            <div className="text-xl font-semibold tabular text-neg mt-1 leading-none">{totalVencidas}</div>
            <div className="text-[10px] text-neg mt-1.5 tabular font-medium">{fmtClpCompact(totalVencidasMonto)} en riesgo</div>
          </div>
          <div className="px-4">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">% completado</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <div className={`text-xl font-semibold tabular leading-none ${fillRate >= 0.85 ? "text-pos" : fillRate >= 0.5 ? "text-warn" : "text-neg"}`}>
                {Math.round(fillRate * 100)}<span className="text-xs text-ink-2 font-normal">%</span>
              </div>
              {deltaFillPp !== 0 && (
                <span className={`text-[9px] tabular font-medium ${deltaFillPp > 0 ? "text-pos" : "text-neg"}`}>
                  {deltaFillPp > 0 ? "+" : ""}{deltaFillPp} pp
                </span>
              )}
            </div>
            <div className="text-[10px] text-ink-2 mt-1.5 tabular">vs mes ant. ({prevFillPct}%)</div>
          </div>

          <div className="px-4 bg-bg-subtle/40 -mx-px">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Sin asignar factura</div>
            <div className="text-xl font-semibold tabular text-warn mt-1 leading-none">{sinAsignar}</div>
            <div className="text-[10px] text-ink-2 mt-1.5 tabular">{fmtNum(sinAsignarLineas)} líneas</div>
          </div>
          <div className="px-4 bg-bg-subtle/40">
            <div className="text-[9px] uppercase tracking-wider text-pos font-medium">Marcadas 100%</div>
            <div className="text-xl font-semibold tabular text-ink mt-1 leading-none">{marcadas100}</div>
            <div className="text-[10px] text-pos mt-1.5 tabular font-medium">{fmtClpCompact(marcadas100Monto)} cerrados</div>
          </div>
          <div className="px-4 bg-bg-subtle/40">
            <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Facturado mes</div>
            <div className="text-xl font-semibold tabular text-ink mt-1 leading-none">{fmtClpCompact(totalFacturado)}</div>
            <div className="text-[10px] text-ink-2 mt-1.5 tabular">de {fmtClpCompact(totalMonto)}</div>
          </div>
          <div className="px-4 bg-bg-subtle/40 -mr-px">
            <div className="text-[9px] uppercase tracking-wider text-neg font-medium">Venta perdida</div>
            <div className="text-xl font-semibold tabular text-ink mt-1 leading-none">{fmtClpCompact(totalVencidasMonto)}</div>
            <div className="text-[10px] text-neg mt-1.5 tabular font-medium">{totalVencidas} OC vencidas</div>
          </div>
        </div>
        <div className="flex justify-between mt-3 pt-3 border-t border-line text-[9px] uppercase tracking-[0.1em] text-ink-3 font-medium">
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

                  {/* Mini-dashboard 5 columnas */}
                  <div className="grid grid-cols-5 divide-x divide-line bg-bg-subtle/40 border-t border-line">
                    <div className="px-4 py-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">OC abiertas</div>
                      <div className="text-base font-semibold tabular text-ink mt-1 leading-none">
                        {g.ocCount}<span className="text-[10px] text-ink-3 font-normal"> de {g.ocCountTotal}</span>
                      </div>
                    </div>
                    <div className="px-4 py-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Monto total</div>
                      <div className="text-base font-semibold tabular text-ink mt-1 leading-none">{fmtClpCompact(g.monto)}</div>
                      <div className="text-[9px] text-ink-2 mt-0.5 tabular">{g.cobertura.toFixed(1)}% del portafolio</div>
                    </div>
                    <div className="px-4 py-2.5">
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
                    <div className="px-4 py-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-ink-3 font-medium">Líneas / Facturadas</div>
                      <div className="text-base font-semibold tabular text-ink mt-1 leading-none">
                        {fmtNum(g.lineasFacturadas)}<span className="text-[10px] text-ink-3 font-normal"> / {fmtNum(g.lineasTotal)}</span>
                      </div>
                      {g.lineasFacturadas < g.lineasTotal && (
                        <div className="text-[9px] text-neg mt-0.5 tabular font-medium">
                          {fmtNum(g.lineasTotal - g.lineasFacturadas)} sin asignar
                        </div>
                      )}
                    </div>
                    <div className={`px-4 py-2.5 ${g.cumpl >= 0.85 ? "bg-pos/[0.04]" : "bg-wine/[0.04]"}`}>
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
                    <div className="grid grid-cols-[16px_120px_1fr_90px_100px_60px_90px_90px_55px_24px] gap-2 px-4 py-2 border-b border-line text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                      <div></div>
                      <div>N° OC</div>
                      <div>Comprador</div>
                      <div>Fecha</div>
                      <div>Vence</div>
                      <div className="text-right">Líneas</div>
                      <div className="text-right">Monto</div>
                      <div className="text-right">Facturado</div>
                      <div className="text-right">Cumpl.</div>
                      <div></div>
                    </div>
                    {rows.map((o) => {
                      const cumpl = o.total_amount > 0 ? Math.round((o.facturado / o.total_amount) * 100) : 0;
                      const dotColor = o.oc_status === "vencida" ? "bg-neg" : o.oc_status === "por_vencer" ? "bg-warn" : "bg-pos";
                      const bgRow = o.oc_status === "vencida" ? "bg-neg-soft/20" : "";
                      const cumplBg = cumpl >= 85 ? "bg-pos-soft text-pos" : cumpl >= 50 ? "bg-warn-soft text-warn" : "bg-neg-soft text-neg";
                      return (
                        <Link
                          key={o.id}
                          href={`/supermercados/oc/${o.id}`}
                          prefetch
                          className={`grid grid-cols-[16px_120px_1fr_90px_100px_60px_90px_90px_55px_24px] gap-2 px-4 py-2.5 hover:bg-bg-subtle border-b border-line last:border-b-0 items-center group ${bgRow}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${dotColor}`} title={o.oc_status === "vencida" ? "Vencida" : o.oc_status === "por_vencer" ? "Por vencer" : "Al día"}></span>
                          <span className="text-xs font-mono text-wine">{o.order_number}</span>
                          <span className="text-[11px] text-ink-2 truncate">{o.buyer ?? "—"}</span>
                          <span className="text-[11px] text-ink-2 tabular">{fmtDate(o.order_date)}</span>
                          <div className="text-[11px] tabular">
                            {o.oc_status === "vencida" ? (
                              <>
                                <span className="text-neg font-medium">{fmtDate(o.cancellation_date)}</span>
                                <span className="text-[10px] text-neg ml-1">+{o.days_overdue}d</span>
                              </>
                            ) : o.oc_status === "por_vencer" ? (
                              <>
                                <span className="text-warn font-medium">{fmtDate(o.cancellation_date)}</span>
                                <span className="text-[10px] text-warn ml-1">−{Math.abs(o.days_overdue)}d</span>
                              </>
                            ) : (
                              <span className="text-ink-2">{fmtDate(o.cancellation_date)}</span>
                            )}
                          </div>
                          <span className="text-[11px] tabular text-right text-ink-2">{o.items_count}</span>
                          <span className="text-xs font-medium tabular text-right text-ink">{fmtClpCompact(o.total_amount)}</span>
                          <span className={`text-[11px] tabular text-right ${o.facturado > 0 ? "text-ink" : "text-ink-3"}`}>
                            {o.facturado > 0 ? fmtClpCompact(o.facturado) : "—"}
                          </span>
                          <span className="text-right">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium tabular ${cumplBg}`}>{cumpl}%</span>
                          </span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-3 group-hover:text-ink-2"><path d="M9 6l6 6-6 6"/></svg>
                        </Link>
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
      <div className="flex justify-between mt-3 text-[10px] text-ink-3">
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pos"></span>Al día</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn"></span>Por vencer (≤3 días)</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-neg"></span>Vencida</span>
        </div>
        <span>{filteredOrders.length} OC mostradas · clic para ver detalle</span>
      </div>
    </>
  );
}
