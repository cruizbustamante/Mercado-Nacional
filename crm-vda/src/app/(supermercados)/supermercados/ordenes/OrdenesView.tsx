"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface OrdenRow {
  id: string;
  order_number: string;
  order_date: string;
  cancellation_date: string | null;
  total_amount: number;
  facturado: number;
  status: string;
  items_count: number;
  chain_id: string;
  chain_name: string;
  is_vencida: boolean;
}

export interface ChainCard {
  id: string;
  name: string;
  ocCount: number;
  totalOc: number;
  totalFacturado: number;
  vencidas: number;
  fillRate: number;
}

interface Props {
  orders: OrdenRow[];
  chainCards: ChainCard[];
  monthLabel: string;
  prevMesParam: string;
  nextMesParam: string;
  prevLabel: string;
  nextLabel: string;
  totalVencidas: number;
  totalVencidasMonto: number;
}

const fmtClp = (n: number) =>
  `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function OrdenesView({
  orders, chainCards, monthLabel,
  prevMesParam, nextMesParam, prevLabel, nextLabel,
  totalVencidas, totalVencidasMonto,
}: Props) {
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const [onlyVencidas, setOnlyVencidas] = useState(false);

  // Totales agregados del período
  const totals = useMemo(() => {
    const totalOc = orders.length;
    const totalMonto = orders.reduce((s, o) => s + o.total_amount, 0);
    const totalFacturado = orders.reduce((s, o) => s + o.facturado, 0);
    const cumplim = totalMonto > 0 ? totalFacturado / totalMonto : 0;
    return { totalOc, totalMonto, totalFacturado, cumplim };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (chainFilter && o.chain_id !== chainFilter) return false;
      if (onlyVencidas && !o.is_vencida) return false;
      if (q && !o.order_number.toLowerCase().includes(q) && !o.chain_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, chainFilter, onlyVencidas]);

  const groupedByChain = useMemo(() => {
    const map = new Map<string, { chain: ChainCard; rows: OrdenRow[] }>();
    for (const card of chainCards) {
      map.set(card.id, { chain: card, rows: [] });
    }
    for (const o of filteredOrders) {
      const g = map.get(o.chain_id);
      if (g) g.rows.push(o);
    }
    return Array.from(map.values()).filter((g) => g.rows.length > 0);
  }, [filteredOrders, chainCards]);

  return (
    <>
      {/* HEADER */}
      <section className="ord-header">
        <div className="ord-title-block">
          <div className="ord-eyebrow">Listado</div>
          <h1 className="ord-title">Órdenes de Compra</h1>
          <div className="ord-meta">
            Período <span className="ord-meta-value">{capitalize(monthLabel)}</span> · {totals.totalOc} órdenes
          </div>
        </div>
        <div className="ord-controls">
          <div className="ord-month-nav">
            <Link href={`/supermercados/ordenes?mes=${prevMesParam}`} className="ord-month-btn" title={capitalize(prevLabel)} prefetch>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </Link>
            <span className="ord-month-label">{capitalize(monthLabel)}</span>
            <Link href={`/supermercados/ordenes?mes=${nextMesParam}`} className="ord-month-btn" title={capitalize(nextLabel)} prefetch>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          </div>
          <Link href="/admin/cargadores/oc-supermercados" className="ord-cta" prefetch>Cargar OC</Link>
        </div>
      </section>

      {/* KPIs */}
      <section className="ord-kpis">
        <div className="ord-kpi">
          <div className="ord-kpi-label">Órdenes</div>
          <div className="ord-kpi-value">{totals.totalOc}</div>
          <div className="ord-kpi-sub">recibidas en el período</div>
        </div>
        <div className="ord-kpi">
          <div className="ord-kpi-label">Monto comprado</div>
          <div className="ord-kpi-value">{fmtClpCompact(totals.totalMonto)}</div>
          <div className="ord-kpi-sub">{fmtClp(totals.totalMonto)}</div>
        </div>
        <div className="ord-kpi">
          <div className="ord-kpi-label">Facturado</div>
          <div className="ord-kpi-value">{fmtClpCompact(totals.totalFacturado)}</div>
          <div className="ord-kpi-sub">acumulado</div>
        </div>
        <div className="ord-kpi">
          <div className="ord-kpi-label">Cumplimiento</div>
          <div className="ord-kpi-value">{Math.round(totals.cumplim * 100)}%</div>
          <div className="ord-kpi-sub">facturado sobre comprado</div>
        </div>
      </section>

      {/* ALERTA EJECUTIVA */}
      {totalVencidas > 0 && (
        <Link href="/supermercados/alertas" className="ord-alert" prefetch>
          <div className="ord-alert-bar" />
          <div className="ord-alert-content">
            <div className="ord-alert-headline">{totalVencidas} órdenes vencidas representan {fmtClpCompact(totalVencidasMonto)} en pendientes</div>
            <div className="ord-alert-sub">Revisar antes del cierre de mes</div>
          </div>
          <div className="ord-alert-cta">Ver alertas</div>
        </Link>
      )}

      {/* CADENAS */}
      {chainCards.length > 0 && (
        <section className="ord-chains">
          <div className="ord-section-head">
            <h2>Por cadena</h2>
            <span className="ord-section-hint">Haga clic para filtrar</span>
          </div>
          <div className="ord-chains-grid">
            {chainCards.map((c) => {
              const pct = Math.round(c.fillRate * 100);
              const isActive = chainFilter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`ord-chain ${isActive ? "is-active" : ""}`}
                  onClick={() => setChainFilter(isActive ? null : c.id)}
                >
                  <div className="ord-chain-name">{c.name}</div>
                  <div className="ord-chain-main">
                    <span className="ord-chain-count">{c.ocCount}</span>
                    <span className="ord-chain-count-label">{c.ocCount === 1 ? "orden" : "órdenes"}</span>
                  </div>
                  <div className="ord-chain-amount">{fmtClpCompact(c.totalOc)}</div>
                  <div className="ord-chain-progress">
                    <div className="ord-chain-progress-track">
                      <div className="ord-chain-progress-fill" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                    <span className="ord-chain-progress-pct">{pct}%</span>
                  </div>
                  {c.vencidas > 0 && (
                    <div className="ord-chain-vencidas">
                      <span className="ord-chain-dot" /> {c.vencidas} vencida{c.vencidas !== 1 ? "s" : ""}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* TOOLBAR */}
      <div className="ord-toolbar">
        <div className="ord-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar por número de orden o cadena"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Limpiar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        <label className="ord-checkbox">
          <input type="checkbox" checked={onlyVencidas} onChange={(e) => setOnlyVencidas(e.target.checked)} />
          <span>Solo vencidas</span>
        </label>
        {chainFilter && (
          <button type="button" className="ord-filter-pill" onClick={() => setChainFilter(null)}>
            {chainCards.find((c) => c.id === chainFilter)?.name ?? "Cadena"}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
        <div className="ord-count">{filteredOrders.length} {filteredOrders.length === 1 ? "resultado" : "resultados"}</div>
      </div>

      {/* LISTA */}
      <div className="ord-list">
        {groupedByChain.length === 0 ? (
          <div className="ord-empty">
            <div className="ord-empty-title">Sin resultados</div>
            <p>
              {orders.length === 0
                ? `No hay órdenes cargadas en ${capitalize(monthLabel)}.`
                : "Ningún resultado matchea los filtros."}
            </p>
            {orders.length === 0 && (
              <Link href="/admin/cargadores/oc-supermercados" className="ord-cta">Cargar OC</Link>
            )}
          </div>
        ) : (
          groupedByChain.map(({ chain, rows }) => {
            const rowsTotal = rows.reduce((s, r) => s + r.total_amount, 0);
            return (
              <section key={chain.id} className="ord-group">
                <header className="ord-group-head">
                  <h3>{chain.name}</h3>
                  <div className="ord-group-meta">
                    <span>{rows.length} {rows.length === 1 ? "orden" : "órdenes"}</span>
                    <span className="ord-group-sep">·</span>
                    <span>{fmtClpCompact(rowsTotal)}</span>
                  </div>
                </header>
                <div className="ord-table-wrap">
                  <table className="ord-table">
                    <thead>
                      <tr>
                        <th>N° Orden</th>
                        <th>Emisión</th>
                        <th>Vencimiento</th>
                        <th className="num">Líneas</th>
                        <th className="num">Monto</th>
                        <th className="num">Facturado</th>
                        <th className="num">Cumplimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o) => {
                        const cumpl = o.total_amount > 0 ? Math.round((o.facturado / o.total_amount) * 100) : 0;
                        return (
                          <tr key={o.id} className={o.is_vencida ? "is-vencida" : ""}>
                            <td>
                              <Link href={`/supermercados/oc/${o.id}`} className="ord-oc-link" prefetch>
                                {o.is_vencida && <span className="ord-vencida-dot" aria-label="Vencida" />}
                                <span className="mono">{o.order_number}</span>
                              </Link>
                            </td>
                            <td className="mono dim">{fmtDate(o.order_date)}</td>
                            <td className={`mono ${o.is_vencida ? "danger" : "dim"}`}>{fmtDate(o.cancellation_date)}</td>
                            <td className="num mono">{o.items_count}</td>
                            <td className="num mono">{fmtClp(o.total_amount)}</td>
                            <td className="num mono dim">{o.facturado > 0 ? fmtClp(o.facturado) : "—"}</td>
                            <td className="num">
                              <span className={`ord-cumpl ${cumpl >= 80 ? "ok" : cumpl >= 50 ? "wn" : "dg"}`}>{cumpl}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
