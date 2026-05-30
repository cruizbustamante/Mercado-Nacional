"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarFacturada } from "./actions";

const prefacturaUrl = (r: { id: string; nv_number: string; client: { name: string } | null }) =>
  `/prefactura?nv=${encodeURIComponent(r.id)}&nvnum=${encodeURIComponent(r.nv_number)}&cliente=${encodeURIComponent(r.client?.name ?? "")}`;

/* ── Types ── */

export interface FacturaItem {
  line_number: number;
  product_sku: string;
  product_name: string;
  quantity_boxes: number;
  quantity_units: number;
  price_net_final: number;
  line_net: number;
  line_ila: number;
  line_total: number;
}

export interface FacturaRow {
  id: string;
  nv_number: string;
  nv_date: string;
  status: string;
  requires_vb_financiero: boolean;
  vb_financiero_status: string | null;
  vb_ok: boolean;
  lista: boolean;
  bloqueada_vb: boolean;
  invoice_number: string | null;
  invoiced_at: string | null;
  invoice_job_status: string | null;
  invoice_error: string | null;
  invoice_pdf_url: string | null;
  total_net: number;
  total_iva: number;
  total_ila: number;
  total_logistics: number;
  total_amount: number;
  total_boxes: number;
  total_units: number;
  delivery_address: string | null;
  client: { name: string; rut_body: number | null; rut_dv: string | null; commune: string | null; city: string | null } | null;
  salesperson: { full_name: string; short_name: string | null; initials: string | null } | null;
  payment_term: { name: string; days: number } | null;
  channel: { name: string; display_name: string } | null;
  items: FacturaItem[];
}

interface Props {
  rows: FacturaRow[];
  canEmit: boolean;
}

/* ── Helpers ── */

const fmtClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat("es-CL");
const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};
const fmtRut = (body: number | null, dv: string | null) =>
  body != null && dv ? `${new Intl.NumberFormat("es-CL").format(body)}-${dv}` : "—";

type Tab = "por_facturar" | "facturadas" | "incidencias";

const BADGE: Record<string, React.CSSProperties> = {
  lista: { background: "var(--warning-soft)", color: "var(--warning)", border: "1px solid rgba(156,106,30,0.18)" },
  vb: { background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" },
  facturada: { background: "var(--success-soft)", color: "var(--success)", border: "1px solid rgba(45,95,63,0.18)" },
  error: { background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid rgba(139,45,31,0.18)" },
};

function estadoBadge(r: FacturaRow): { key: string; label: string; title?: string } {
  if (r.invoice_number) return { key: "facturada", label: "Facturada" };
  if (r.invoice_job_status === "ERROR") return { key: "error", label: "Error", title: r.invoice_error ?? undefined };
  if (r.bloqueada_vb) return { key: "vb", label: "V°B° pendiente" };
  if (r.lista) return { key: "lista", label: "Lista" };
  return { key: "vb", label: r.status };
}

const PER_PAGE = 50;

/* ── Component ── */

export function FacturacionModule({ rows, canEmit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [tab, setTab] = useState<Tab>("por_facturar");
  const [search, setSearch] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Modal "Marcar facturada"
  const [markRow, setMarkRow] = useState<FacturaRow | null>(null);
  const [folio, setFolio] = useState("");
  const [markErr, setMarkErr] = useState<string | null>(null);

  const channels = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.channel) m.set(r.channel.name, r.channel.display_name);
    return Array.from(m, ([name, display_name]) => ({ name, display_name }));
  }, [rows]);

  const kpis = useMemo(() => {
    const listas = rows.filter((r) => r.lista);
    const bloqueadas = rows.filter((r) => r.bloqueada_vb);
    const facturadas = rows.filter((r) => r.invoice_number);
    const incidencias = rows.filter((r) => r.invoice_job_status === "ERROR");
    return {
      listasN: listas.length,
      listasMonto: listas.reduce((s, r) => s + r.total_amount, 0),
      bloqueadasN: bloqueadas.length,
      facturadasN: facturadas.length,
      facturadoMonto: facturadas.reduce((s, r) => s + r.total_amount, 0),
      incidenciasN: incidencias.length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "por_facturar") list = list.filter((r) => r.lista || r.bloqueada_vb);
    else if (tab === "facturadas") list = list.filter((r) => r.invoice_number);
    else list = list.filter((r) => r.invoice_job_status === "ERROR");

    if (channelId) list = list.filter((r) => r.channel?.name === channelId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) => r.nv_number.toLowerCase().includes(q) || (r.client?.name ?? "").toLowerCase().includes(q) || (r.invoice_number ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, channelId, search]);

  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PER_PAGE) - 1));
  const paged = filtered.slice(currentPage * PER_PAGE, (currentPage + 1) * PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  const selectableInView = paged.filter((r) => r.lista);
  const allSelectableSelected = selectableInView.length > 0 && selectableInView.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) selectableInView.forEach((r) => next.delete(r.id));
      else selectableInView.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRows = rows.filter((r) => selected.has(r.id) && r.lista);

  /* Abre el visor de prefactura (pantalla de carga + PDF) en pestaña nueva */
  function verPrefactura(r: FacturaRow) {
    window.open(prefacturaUrl(r), "_blank");
  }
  function verPrefacturasSeleccionadas() {
    selectedRows.forEach((r) => window.open(prefacturaUrl(r), "_blank"));
  }

  function confirmarMarcar() {
    if (!markRow) return;
    setMarkErr(null);
    startTransition(async () => {
      const res = await marcarFacturada(markRow.id, folio);
      if (res.success) {
        setMarkRow(null);
        setFolio("");
        router.refresh();
      } else {
        setMarkErr(res.error ?? "Error");
      }
    });
  }

  return (
    <>
      {/* DOC HEAD */}
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Facturación</div>
            <h1 className="doc-title">Emisión de Facturas</h1>
            <p className="doc-sub">
              {kpis.listasN > 0
                ? `${fmtNum.format(kpis.listasN)} NV listas para facturar · ${fmtClp.format(kpis.listasMonto)}`
                : "Sin notas de venta listas para facturar"}
            </p>
          </div>
          {canEmit && selectedRows.length > 0 && (
            <button className="btn btn-primary" style={{ color: "white" }} onClick={verPrefacturasSeleccionadas}>
              Ver prefacturas ({selectedRows.length})
            </button>
          )}
        </div>

        <div className="stats-strip" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          <div className="stat-cell">
            <div className="stat-key">Listas</div>
            <div className={`stat-val ${kpis.listasN > 0 ? "warn" : ""}`}>{fmtNum.format(kpis.listasN)}</div>
            <div className="stat-sub">para facturar</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Por facturar $</div>
            <div className="stat-val">{fmtCompact(kpis.listasMonto)}</div>
            <div className="stat-sub">{fmtClp.format(kpis.listasMonto)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Bloqueadas V°B°</div>
            <div className={`stat-val ${kpis.bloqueadasN > 0 ? "warn" : ""}`}>{fmtNum.format(kpis.bloqueadasN)}</div>
            <div className="stat-sub">esperan V°B°</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Facturadas</div>
            <div className="stat-val ok">{fmtNum.format(kpis.facturadasN)}</div>
            <div className="stat-sub">con folio</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Facturado $</div>
            <div className="stat-val">{fmtCompact(kpis.facturadoMonto)}</div>
            <div className="stat-sub">{fmtClp.format(kpis.facturadoMonto)}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Incidencias</div>
            <div className={`stat-val ${kpis.incidenciasN > 0 ? "neg" : ""}`}>{fmtNum.format(kpis.incidenciasN)}</div>
            <div className="stat-sub">{kpis.incidenciasN > 0 ? "revisar" : "ninguna"}</div>
          </div>
        </div>
      </section>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input className="search-input" placeholder="Buscar por N° NV, cliente o folio..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <select className="field-select" style={{ height: 40, flex: "1 1 160px", minWidth: 0 }} value={channelId ?? ""} onChange={(e) => { setChannelId(e.target.value || null); setPage(0); }}>
            <option value="">Todos los canales</option>
            {channels.map((c) => (<option key={c.name} value={c.name}>{c.display_name}</option>))}
          </select>
        </div>

        <div className="toolbar-row" style={{ marginTop: 8 }}>
          <div className="filter-chips">
            <button className={`chip ${tab === "por_facturar" ? "active" : ""}`} onClick={() => { setTab("por_facturar"); setPage(0); }}>
              Por facturar <span className="count">{kpis.listasN + kpis.bloqueadasN}</span>
            </button>
            <button className={`chip ${tab === "facturadas" ? "active" : ""}`} onClick={() => { setTab("facturadas"); setPage(0); }}>
              Facturadas <span className="count">{kpis.facturadasN}</span>
            </button>
            <button className={`chip ${tab === "incidencias" ? "active" : ""}`} onClick={() => { setTab("incidencias"); setPage(0); }}>
              Incidencias <span className="count">{kpis.incidenciasN}</span>
            </button>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <main className="content">
        {paged.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r)", padding: "48px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--text-3)" }}>No hay notas de venta para esta vista.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    {canEmit && tab === "por_facturar" && (
                      <th style={{ width: 34 }}>
                        <input type="checkbox" checked={allSelectableSelected} onChange={toggleAll} disabled={selectableInView.length === 0} />
                      </th>
                    )}
                    <th>NV</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>RUT</th>
                    <th>Canal</th>
                    <th className="num">Cajas</th>
                    <th className="num">Neto</th>
                    <th className="num">ILA</th>
                    <th className="num">Total</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const b = estadoBadge(r);
                    const isOpen = expanded === r.id;
                    return (
                      <FragmentRow
                        key={r.id}
                        r={r}
                        badge={b}
                        isOpen={isOpen}
                        canEmit={canEmit}
                        showCheck={canEmit && tab === "por_facturar"}
                        checked={selected.has(r.id)}
                        onToggle={() => toggleOne(r.id)}
                        onExpand={() => setExpanded(isOpen ? null : r.id)}
                        onPrefactura={() => verPrefactura(r)}
                        onMarcar={() => { setMarkRow(r); setFolio(""); setMarkErr(null); }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div className="page-info">
                Mostrando <strong>{currentPage * PER_PAGE + 1}</strong>–<strong>{Math.min((currentPage + 1) * PER_PAGE, filtered.length)}</strong> de <strong>{fmtNum.format(filtered.length)}</strong>
              </div>
              <div className="page-btns">
                <button className={`page-btn ${currentPage === 0 ? "pg-disabled" : ""}`} onClick={() => setPage(Math.max(0, currentPage - 1))}>←</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) pageNum = i;
                  else if (currentPage < 4) pageNum = i;
                  else if (currentPage > totalPages - 5) pageNum = totalPages - 7 + i;
                  else pageNum = currentPage - 3 + i;
                  return (
                    <button key={pageNum} className={`page-btn ${pageNum === currentPage ? "pg-active" : ""}`} onClick={() => setPage(pageNum)}>
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button className={`page-btn ${currentPage >= totalPages - 1 ? "pg-disabled" : ""}`} onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}>→</button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* MODAL "Marcar facturada" */}
      {markRow && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(20,16,14,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
          onClick={() => { if (!pending) setMarkRow(null); }}
        >
          <div style={{ background: "var(--surface)", borderRadius: "var(--r, 12px)", border: "1px solid var(--border)", width: "min(440px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div className="doc-eyebrow">Marcar como facturada</div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: "2px 0 0" }}>NV {markRow.nv_number}</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "4px 0 0" }}>
                {markRow.client?.name} · {fmtClp.format(markRow.total_amount)}. Ingresa el <strong>N° de folio</strong> de la factura emitida en facturacion.cl.
              </p>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <label style={{ fontSize: 12.5, color: "var(--text-2)", display: "block", marginBottom: 6 }}>N° Folio</label>
              <input
                className="field-input"
                style={{ width: "100%", height: 44, fontFamily: "var(--f-mono)" }}
                inputMode="numeric"
                placeholder="Ej. 38912"
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                autoFocus
              />
              {markErr && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--danger)" }}>{markErr}</div>}
            </div>
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-ghost" style={{ minHeight: 42 }} onClick={() => setMarkRow(null)} disabled={pending}>Cancelar</button>
              <button className="btn btn-primary" style={{ color: "white", minHeight: 42 }} onClick={confirmarMarcar} disabled={pending || !folio.trim()}>
                {pending ? "Guardando…" : "Marcar facturada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Row + detalle expandible ── */

function FragmentRow({
  r, badge, isOpen, canEmit, showCheck, checked, onToggle, onExpand, onPrefactura, onMarcar,
}: {
  r: FacturaRow;
  badge: { key: string; label: string; title?: string };
  isOpen: boolean;
  canEmit: boolean;
  showCheck: boolean;
  checked: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onPrefactura: () => void;
  onMarcar: () => void;
}) {
  const colSpan = showCheck ? 12 : 11;
  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={onExpand}>
        {showCheck && (
          <td onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={checked} onChange={onToggle} disabled={!r.lista} style={{ width: 18, height: 18 }} />
          </td>
        )}
        <td data-label="NV" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>{r.nv_number}</td>
        <td data-label="Fecha" style={{ color: "var(--text-2)", fontSize: 12.5, whiteSpace: "nowrap" }}>{r.nv_date}</td>
        <td data-label="Cliente" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.client?.name ?? "—"}</td>
        <td data-label="RUT" style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtRut(r.client?.rut_body ?? null, r.client?.rut_dv ?? null)}</td>
        <td data-label="Canal">{r.channel ? <span className="cat-chip" style={{ fontSize: 11 }}>{r.channel.display_name}</span> : <span style={{ color: "var(--text-4)" }}>—</span>}</td>
        <td className="num" data-label="Cajas" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>{fmtNum.format(r.total_boxes)}</td>
        <td className="num" data-label="Neto"><span className="price">{fmtClp.format(r.total_net)}</span></td>
        <td className="num" data-label="ILA" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, color: r.total_ila > 0 ? "var(--text)" : "var(--text-4)" }}>{r.total_ila > 0 ? fmtClp.format(r.total_ila) : "—"}</td>
        <td className="num" data-label="Total"><span className="price price-neto">{fmtClp.format(r.total_amount)}</span></td>
        <td data-label="Estado"><span className="badge" style={BADGE[badge.key]} title={badge.title}>{badge.label}</span></td>
        <td data-label="Acción" onClick={(e) => e.stopPropagation()}>
          {r.invoice_number ? (
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>Folio {r.invoice_number}</span>
          ) : canEmit && r.lista ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btn btn-ghost"
                style={{
                  minHeight: 38,
                  fontSize: 12.5,
                  ...(r.invoice_job_status === "PREFACTURA"
                    ? { borderColor: "var(--success)", color: "var(--success)" }
                    : {}),
                }}
                onClick={onPrefactura}
                title={r.invoice_job_status === "PREFACTURA" ? "Prefactura ya generada — puedes volver a generarla" : undefined}
              >
                {r.invoice_job_status === "PREFACTURA" ? "✓ Prefactura ↗" : "Prefactura ↗"}
              </button>
              <button className="btn btn-ghost" style={{ minHeight: 38, fontSize: 12.5 }} onClick={onMarcar}>Marcar fact.</button>
            </div>
          ) : (
            <span style={{ color: "var(--text-4)", fontSize: 12 }}>—</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={colSpan} style={{ background: "var(--surface-2)", padding: 0 }}>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, fontSize: 12.5, color: "var(--text-2)", alignItems: "center" }}>
                <div><span style={{ color: "var(--text-3)" }}>Vendedor:</span> {r.salesperson?.short_name ?? r.salesperson?.full_name ?? "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Cond. pago:</span> {r.payment_term?.name ?? "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Despacho:</span> {r.delivery_address ?? "—"}{r.client?.commune ? ` · ${r.client.commune}` : ""}</div>
                <a href={`/nota-venta/${r.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ minHeight: 38, fontSize: 12, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  Ver / imprimir NV ↗
                </a>
              </div>
              {r.invoice_error && (
                <div style={{ marginBottom: 10, fontSize: 12.5, color: "var(--danger)", background: "var(--danger-soft)", border: "1px solid rgba(139,45,31,0.18)", borderRadius: 8, padding: "8px 10px" }}>{r.invoice_error}</div>
              )}
              <table className="t" style={{ background: "var(--surface)" }}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th><th>Producto</th>
                    <th className="num">Unid.</th><th className="num">P. unit neto</th>
                    <th className="num">Neto línea</th><th className="num">ILA</th><th className="num">Total línea</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((it) => (
                    <tr key={it.line_number}>
                      <td className="num" data-label="#" style={{ fontFamily: "var(--f-mono)" }}>{String(it.line_number).padStart(2, "0")}</td>
                      <td data-label="Producto"><div style={{ fontWeight: 600 }}>{it.product_name}</div><div style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--text-3)" }}>SKU {it.product_sku}</div></td>
                      <td className="num" data-label="Unid." style={{ fontFamily: "var(--f-mono)" }}>{fmtNum.format(it.quantity_units)}</td>
                      <td className="num" data-label="P. unit neto" style={{ fontFamily: "var(--f-mono)" }}>{fmtClp.format(it.price_net_final)}</td>
                      <td className="num" data-label="Neto línea" style={{ fontFamily: "var(--f-mono)" }}>{fmtClp.format(it.line_net)}</td>
                      <td className="num" data-label="ILA" style={{ fontFamily: "var(--f-mono)", color: it.line_ila > 0 ? "var(--text)" : "var(--text-4)" }}>{it.line_ila > 0 ? fmtClp.format(it.line_ila) : "—"}</td>
                      <td className="num" data-label="Total línea" style={{ fontFamily: "var(--f-mono)", fontWeight: 600 }}>{fmtClp.format(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
