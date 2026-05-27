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
  fillRate: number; // 0..1
}

interface Props {
  orders: OrdenRow[];
  chainCards: ChainCard[];
  mesParam: string;
  monthLabel: string;
  prevMesParam: string;
  nextMesParam: string;
  prevLabel: string;
  nextLabel: string;
  totalVencidas: number;
  totalVencidasMonto: number;
}

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

function chainAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud") || n.includes("jumbo") || n.includes("santa isabel")) return "cen";
  if (n.includes("smu") || n.includes("unimarc")) return "smu";
  if (n.includes("tottus") || n.includes("falabella")) return "tot";
  if (n.includes("walmart") || n.includes("lider") || n.includes("líder") || n.includes("acuenta")) return "wal";
  if (n.includes("rendic")) return "ren";
  return "gen";
}

export function OrdenesView({
  orders, chainCards, mesParam, monthLabel,
  prevMesParam, nextMesParam, prevLabel, nextLabel,
  totalVencidas, totalVencidasMonto,
}: Props) {
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const [onlyVencidas, setOnlyVencidas] = useState(false);
  const [expandedChain, setExpandedChain] = useState<string | null>(() => chainCards[0]?.id ?? null);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (chainFilter && o.chain_id !== chainFilter) return false;
      if (onlyVencidas && !o.is_vencida) return false;
      if (q && !o.order_number.toLowerCase().includes(q) && !o.chain_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, search, chainFilter, onlyVencidas]);

  // Group filtered by chain for display
  const groupedByChain = useMemo(() => {
    const map = new Map<string, { chain: ChainCard; rows: OrdenRow[] }>();
    for (const card of chainCards) {
      map.set(card.id, { chain: card, rows: [] });
    }
    for (const o of filteredOrders) {
      const g = map.get(o.chain_id);
      if (g) g.rows.push(o);
    }
    // Keep order of chainCards (sorted by ocCount desc)
    return Array.from(map.values()).filter((g) => g.rows.length > 0);
  }, [filteredOrders, chainCards]);

  return (
    <>
      {/* HEADER compacto */}
      <section className="ordenes-topbar">
        <div>
          <div className="eyebrow">Listado</div>
          <h1>Órdenes de Compra</h1>
        </div>
        <div className="month-switcher">
          <Link href={`/supermercados/ordenes?mes=${prevMesParam}`} className="ms-btn" title={prevLabel} prefetch>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </Link>
          <span className="ms-label">{monthLabel}</span>
          <Link href={`/supermercados/ordenes?mes=${nextMesParam}`} className="ms-btn" title={nextLabel} prefetch>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </Link>
          <Link href="/admin/cargadores/oc-supermercados" className="ms-cta" prefetch>+ Cargar OC</Link>
        </div>
      </section>

      {/* BANNER ALERTA */}
      {totalVencidas > 0 && (
        <Link href="/supermercados/alertas" className="ordenes-alert" prefetch>
          <span className="icon-circle">!</span>
          <span className="msg">
            <b>{totalVencidas} OC vencida{totalVencidas !== 1 ? "s" : ""}</b>{" "}
            suman <b>{fmtClpCompact(totalVencidasMonto)}</b> en pendiente — atención urgente
          </span>
          <span className="link">Ver alertas →</span>
        </Link>
      )}

      {/* CARDS POR CADENA */}
      {chainCards.length > 0 && (
        <section className="chain-cards">
          {chainCards.map((c) => {
            const pct = Math.round(c.fillRate * 100);
            const isActive = chainFilter === c.id;
            const accent = chainAccent(c.name);
            const tone = c.fillRate >= 0.85 ? "ok" : c.fillRate >= 0.7 ? "wn" : "dg";
            const circumference = 2 * Math.PI * 14;
            const strokeLen = (pct / 100) * circumference;
            const gapLen = circumference - strokeLen;
            const strokeColor = tone === "ok" ? "#2C6E3B" : tone === "wn" ? "#B86E15" : "#B83838";
            const bgStroke = tone === "ok" ? "#E6EFE3" : tone === "wn" ? "#FAEDD8" : "#FBE7E5";

            return (
              <button
                key={c.id}
                type="button"
                className={`chain-card ${isActive ? "is-active" : ""}`}
                onClick={() => setChainFilter(isActive ? null : c.id)}
              >
                <div className="cc-top">
                  <div className={`cc-badge ${accent}`}>{c.name.slice(0, 3).toUpperCase()}</div>
                  {c.vencidas > 0 && <div className="cc-alert">⚠ {c.vencidas}</div>}
                </div>
                <div className="cc-name">{c.name}</div>
                <div className="cc-stats">
                  <div className="cc-count">
                    <b>{c.ocCount}</b>
                    <span>OC</span>
                  </div>
                  <div className="cc-donut">
                    <svg viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="14" fill="none" stroke={bgStroke} strokeWidth="3" />
                      <circle cx="16" cy="16" r="14" fill="none" stroke={strokeColor} strokeWidth="3"
                        strokeDasharray={`${strokeLen.toFixed(1)} ${gapLen.toFixed(1)}`}
                        transform="rotate(-90 16 16)" />
                    </svg>
                    <span className={`cc-pct ${tone}`}>{pct}%</span>
                  </div>
                </div>
                <div className="cc-amount">{fmtClpCompact(c.totalOc)}</div>
              </button>
            );
          })}
        </section>
      )}

      {/* TOOLBAR: buscador + filtros */}
      <div className="ordenes-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar OC o cadena…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          {search && (
            <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Limpiar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        <label className="filter-toggle">
          <input type="checkbox" checked={onlyVencidas} onChange={(e) => setOnlyVencidas(e.target.checked)} />
          <span>Solo vencidas</span>
        </label>
        {chainFilter && (
          <button type="button" className="filter-clear" onClick={() => setChainFilter(null)}>
            Quitar filtro cadena ×
          </button>
        )}
        <div className="result-count">
          {filteredOrders.length} OC {filteredOrders.length !== orders.length ? `de ${orders.length}` : ""}
        </div>
      </div>

      {/* LISTA AGRUPADA POR CADENA */}
      <div className="ordenes-list">
        {groupedByChain.length === 0 ? (
          <div className="sm-empty">
            <div className="sm-empty-title">Sin resultados</div>
            <p className="sm-empty-desc">
              {orders.length === 0
                ? `No hay OC cargadas en ${monthLabel}.`
                : "Ningún resultado matchea los filtros actuales."}
            </p>
            {orders.length === 0 && (
              <div className="sm-empty-actions">
                <Link href="/admin/cargadores/oc-supermercados" className="btn btn-primary">+ Cargar OC</Link>
              </div>
            )}
          </div>
        ) : (
          groupedByChain.map(({ chain, rows }) => {
            const isExpanded = expandedChain === chain.id || groupedByChain.length === 1;
            const accent = chainAccent(chain.name);
            const rowsTotal = rows.reduce((s, r) => s + r.total_amount, 0);
            return (
              <div key={chain.id} className={`chain-group ${isExpanded ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="chain-group-head"
                  onClick={() => setExpandedChain(isExpanded ? null : chain.id)}
                >
                  <span className="cg-caret">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 18l6-6-6-6"/></svg>
                  </span>
                  <span className={`cg-badge ${accent}`}>{chain.name.slice(0, 3).toUpperCase()}</span>
                  <span className="cg-name">{chain.name}</span>
                  <span className="cg-meta">{rows.length} OC · {fmtClpCompact(rowsTotal)}</span>
                </button>
                {isExpanded && (
                  <div className="chain-group-body">
                    <table className="oc-table">
                      <thead>
                        <tr>
                          <th>N° Orden</th>
                          <th>Fecha</th>
                          <th>Vence</th>
                          <th className="num">Líneas</th>
                          <th className="num">Monto</th>
                          <th className="num">Facturado</th>
                          <th className="num">Cumpl.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((o) => {
                          const cumpl = o.total_amount > 0 ? Math.round((o.facturado / o.total_amount) * 100) : 0;
                          return (
                            <tr key={o.id} className={o.is_vencida ? "is-vencida" : ""}>
                              <td>
                                <Link href={`/supermercados/oc/${o.id}`} className="oc-link" prefetch>
                                  {o.is_vencida && <span className="dot dot-danger" title="Vencida" />}
                                  <span className="mono">{o.order_number}</span>
                                </Link>
                              </td>
                              <td className="mono dim">{fmtDate(o.order_date)}</td>
                              <td className={`mono ${o.is_vencida ? "danger" : "dim"}`}>{fmtDate(o.cancellation_date)}</td>
                              <td className="num mono">{o.items_count}</td>
                              <td className="num mono">{fmtClpCompact(o.total_amount)}</td>
                              <td className="num mono dim">{o.facturado > 0 ? fmtClpCompact(o.facturado) : "—"}</td>
                              <td className="num">
                                <span className={`cumpl-pill ${cumpl >= 80 ? "ok" : cumpl >= 50 ? "wn" : "dg"}`}>
                                  {cumpl}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* mes/key for prefetch hint compat */}
      <input type="hidden" value={mesParam} readOnly />
    </>
  );
}
