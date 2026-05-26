"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

/* ── Types ── */

export interface NvListItem {
  id: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  quantity_boxes: number;
  quantity_units: number;
  line_net: number;
  line_total: number;
}

export interface NvListRow {
  id: string;
  nv_number: string;
  nv_date: string;
  status: string;
  total_net: number;
  total_amount: number;
  total_boxes: number;
  total_units: number;
  invoice_number: string | null;
  client: { name: string; rut_body: number | null; rut_dv: string | null } | null;
  salesperson: { full_name: string; short_name: string | null; initials: string | null } | null;
  warehouse: { name: string } | null;
  payment_term: { name: string; days: number } | null;
  channel: { name: string; display_name: string } | null;
  items: NvListItem[];
  /** pre-computed on server: (net - cost) / net * 100, or null if cost missing */
  margin_pct: number | null;
  /** pre-computed on server: net - cost */
  margin_clp: number | null;
}

export interface ChannelOption {
  id: string;
  name: string;
  display_name: string;
}

interface Props {
  rows: NvListRow[];
  channels: ChannelOption[];
  /** Year options available from data */
  availableYears: number[];
  /** Initial filter state from URL */
  initialYear: number;
  initialMonth: number | null; // null = all months
  initialStatus: string | null;
  initialChannel: string | null;
  initialSearch: string;
  initialFacturado: string | null; // "si" | "no" | null
}

/* ── Helpers ── */

const fmtClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("es-CL");
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  PENDIENTE: { background: "var(--warning-soft)", color: "var(--warning)", border: "1px solid rgba(156,106,30,0.18)" },
  APROBADO: { background: "var(--success-soft)", color: "var(--success)", border: "1px solid rgba(45,95,63,0.18)" },
  RECHAZADO: { background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid rgba(139,45,31,0.18)" },
  FACTURADO: { background: "var(--info-soft)", color: "var(--info)", border: "1px solid rgba(44,74,107,0.15)" },
  DESPACHADO: { background: "rgba(0,128,128,0.08)", color: "teal", border: "1px solid rgba(0,128,128,0.15)" },
};

const STATUSES = ["PENDIENTE", "APROBADO", "FACTURADO", "DESPACHADO", "RECHAZADO"] as const;
const MONTHS = [
  { val: 1, label: "Enero" }, { val: 2, label: "Febrero" }, { val: 3, label: "Marzo" },
  { val: 4, label: "Abril" }, { val: 5, label: "Mayo" }, { val: 6, label: "Junio" },
  { val: 7, label: "Julio" }, { val: 8, label: "Agosto" }, { val: 9, label: "Septiembre" },
  { val: 10, label: "Octubre" }, { val: 11, label: "Noviembre" }, { val: 12, label: "Diciembre" },
];

const PER_PAGE = 50;

function marginTone(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 20) return "var(--success)";
  if (pct >= 10) return "var(--warning)";
  return "var(--danger)";
}

/* ── Component ── */

export function NvListModule({
  rows,
  channels,
  availableYears,
  initialYear,
  initialMonth,
  initialStatus,
  initialChannel,
  initialSearch,
  initialFacturado,
}: Props) {
  const router = useRouter();

  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState<number | null>(initialMonth);
  const [channelId, setChannelId] = useState<string | null>(initialChannel);
  const [facturado, setFacturado] = useState<string | null>(initialFacturado);
  const [page, setPage] = useState(0);

  /* Filter rows */
  const filtered = useMemo(() => {
    let list = rows;

    // Year
    list = list.filter((r) => {
      const y = parseInt(r.nv_date.slice(0, 4), 10);
      return y === year;
    });

    // Month
    if (month !== null) {
      list = list.filter((r) => {
        const m = parseInt(r.nv_date.slice(5, 7), 10);
        return m === month;
      });
    }

    // Status
    if (status) {
      list = list.filter((r) => r.status === status);
    }

    // Channel
    if (channelId) {
      list = list.filter((r) => {
        // match by channel name (id is not in NV data)
        const ch = channels.find((c) => c.id === channelId);
        return ch && r.channel?.name === ch.name;
      });
    }

    // Facturado
    if (facturado === "si") {
      list = list.filter((r) => r.invoice_number !== null);
    } else if (facturado === "no") {
      list = list.filter((r) => r.invoice_number === null);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.nv_number.toLowerCase().includes(q) ||
          (r.client?.name ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [rows, year, month, status, channelId, facturado, search, channels]);

  /* Reset page on filter change */
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PER_PAGE) - 1));
  const paged = filtered.slice(currentPage * PER_PAGE, (currentPage + 1) * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  /* KPIs */
  const kpis = useMemo(() => {
    const count = filtered.length;
    const totalNet = filtered.reduce((s, r) => s + r.total_net, 0);
    const totalBruto = filtered.reduce((s, r) => s + r.total_amount, 0);
    const withMargin = filtered.filter((r) => r.margin_pct !== null);
    const avgMargin = withMargin.length > 0
      ? withMargin.reduce((s, r) => s + (r.margin_clp ?? 0), 0) / withMargin.length
      : null;
    const pendientes = filtered.filter((r) => r.status === "PENDIENTE").length;
    const facturadas = filtered.filter((r) => r.status === "FACTURADO" || r.invoice_number !== null).length;
    return { count, totalNet, totalBruto, avgMargin, pendientes, facturadas };
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of STATUSES) m[s] = 0;
    for (const r of filtered) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [filtered]);

  return (
    <>
      {/* DOC HEAD */}
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Listado</div>
            <h1 className="doc-title">Notas de Venta</h1>
            <p className="doc-sub">
              {filtered.length > 0
                ? `${fmtNum.format(filtered.length)} NV · ${month !== null ? MONTHS[month - 1].label : "Año completo"} ${year}`
                : "Sin notas de venta para los filtros seleccionados"}
            </p>
          </div>
          <button
            className="btn btn-primary"
            style={{ color: "white" }}
            onClick={() => router.push("/nota-venta/nueva")}
          >
            + Nueva NV
          </button>
        </div>

        {/* KPI Strip */}
        <div className="stats-strip" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
          <div className="stat-cell">
            <div className="stat-key">Total NV</div>
            <div className="stat-val">{fmtNum.format(kpis.count)}</div>
            <div className="stat-sub">en filtro</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Monto neto</div>
            <div className="stat-val">{fmtCompact(kpis.totalNet)}</div>
            <div className="stat-sub">{fmtClp.format(kpis.totalNet)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Monto bruto</div>
            <div className="stat-val">{fmtCompact(kpis.totalBruto)}</div>
            <div className="stat-sub">{fmtClp.format(kpis.totalBruto)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Margen $ prom.</div>
            <div className="stat-val">
              {kpis.avgMargin !== null ? fmtCompact(Math.round(kpis.avgMargin)) : "—"}
            </div>
            <div className="stat-sub">por NV</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Pendientes</div>
            <div className={`stat-val ${kpis.pendientes > 0 ? "warn" : ""}`}>
              {kpis.pendientes}
            </div>
            <div className="stat-sub warn">{kpis.pendientes > 0 ? "requieren acción" : "ninguna"}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Facturadas</div>
            <div className="stat-val ok">{kpis.facturadas}</div>
            <div className="stat-sub">con factura</div>
          </div>
        </div>
      </section>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="toolbar-row">
          {/* Search */}
          <div className="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              className="search-input"
              placeholder="Buscar por N° NV o cliente..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>

          {/* Year */}
          <select
            className="field-select"
            style={{ width: 100, height: 38 }}
            value={year}
            onChange={(e) => { setYear(parseInt(e.target.value, 10)); setPage(0); }}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Month */}
          <select
            className="field-select"
            style={{ width: 140, height: 38 }}
            value={month ?? ""}
            onChange={(e) => { setMonth(e.target.value ? parseInt(e.target.value, 10) : null); setPage(0); }}
          >
            <option value="">Todos los meses</option>
            {MONTHS.map((m) => (
              <option key={m.val} value={m.val}>{m.label}</option>
            ))}
          </select>

          {/* Channel */}
          <select
            className="field-select"
            style={{ width: 160, height: 38 }}
            value={channelId ?? ""}
            onChange={(e) => { setChannelId(e.target.value || null); setPage(0); }}
          >
            <option value="">Todos los canales</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>

          {/* Facturado */}
          <select
            className="field-select"
            style={{ width: 150, height: 38 }}
            value={facturado ?? ""}
            onChange={(e) => { setFacturado(e.target.value || null); setPage(0); }}
          >
            <option value="">Factura: todos</option>
            <option value="si">Con factura</option>
            <option value="no">Sin factura</option>
          </select>
        </div>

        {/* Status chips */}
        <div className="toolbar-row" style={{ marginTop: 8 }}>
          <div className="filter-chips">
            <button
              className={`chip ${status === null ? "active" : ""}`}
              onClick={() => { setStatus(null); setPage(0); }}
            >
              Todos <span className="count">{filtered.length}</span>
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`chip ${status === s ? "active" : ""}`}
                onClick={() => { setStatus(status === s ? null : s); setPage(0); }}
              >
                {s} <span className="count">{statusCounts[s] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <main className="content">
        {paged.length === 0 ? (
          <div style={{
            background: "var(--surface)", border: "2px dashed var(--border)",
            borderRadius: "var(--r)", padding: "48px 20px", textAlign: "center",
          }}>
            <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 16 }}>
              No se encontraron notas de venta para los filtros seleccionados.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>NV</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Canal</th>
                    <th>Vendedor</th>
                    <th>Estado</th>
                    <th className="num">Cajas</th>
                    <th className="num">Neto</th>
                    <th className="num">Total</th>
                    <th className="num">Margen %</th>
                    <th>N° Factura</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/nota-venta/${r.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      <td
                        data-label="NV"
                        style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}
                      >
                        {r.nv_number}
                      </td>
                      <td data-label="Fecha" style={{ color: "var(--text-2)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {r.nv_date}
                      </td>
                      <td data-label="Cliente" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.client?.name ?? "—"}
                      </td>
                      <td data-label="Canal">
                        {r.channel ? (
                          <span className="cat-chip" style={{ fontSize: 11 }}>
                            {r.channel.display_name}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-4)" }}>—</span>
                        )}
                      </td>
                      <td data-label="Vendedor" style={{ color: "var(--text-2)", fontSize: 12.5 }}>
                        {r.salesperson?.initials ?? r.salesperson?.short_name ?? "—"}
                      </td>
                      <td data-label="Estado">
                        <span className="badge" style={STATUS_STYLE[r.status] ?? { background: "var(--surface-2)" }}>
                          {r.status}
                        </span>
                      </td>
                      <td className="num" data-label="Cajas" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                        {fmtNum.format(r.total_boxes)}
                      </td>
                      <td className="num" data-label="Neto">
                        <span className="price">{fmtClp.format(r.total_net)}</span>
                      </td>
                      <td className="num" data-label="Total">
                        <span className="price price-neto">{fmtClp.format(r.total_amount)}</span>
                      </td>
                      <td className="num" data-label="Margen %" style={{
                        fontFamily: "var(--f-mono)", fontSize: 12.5,
                        color: marginTone(r.margin_pct),
                      }}>
                        {r.margin_pct !== null ? `${r.margin_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td data-label="N° Factura" style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: r.invoice_number ? "var(--text)" : "var(--text-4)" }}>
                        {r.invoice_number ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <div className="page-info">
                Mostrando <strong>{currentPage * PER_PAGE + 1}</strong>–<strong>{Math.min((currentPage + 1) * PER_PAGE, filtered.length)}</strong> de <strong>{fmtNum.format(filtered.length)}</strong>
              </div>
              <div className="page-btns">
                <button
                  className={`page-btn ${currentPage === 0 ? "pg-disabled" : ""}`}
                  onClick={() => setPage(Math.max(0, currentPage - 1))}
                >
                  ←
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (currentPage < 4) {
                    pageNum = i;
                  } else if (currentPage > totalPages - 5) {
                    pageNum = totalPages - 7 + i;
                  } else {
                    pageNum = currentPage - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={`page-btn ${pageNum === currentPage ? "pg-active" : ""}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  className={`page-btn ${currentPage >= totalPages - 1 ? "pg-disabled" : ""}`}
                  onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                >
                  →
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
