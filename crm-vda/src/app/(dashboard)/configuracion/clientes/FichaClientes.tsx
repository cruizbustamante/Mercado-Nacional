"use client";

import { useActionState, useRef, useState, useEffect, forwardRef } from "react";
import type { Client, SalesChannel, PaymentTerm, Profile } from "@/lib/types/database";
import { saveClient, deleteClient } from "../actions";

const fmtRut = (body: number | null, dv: string | null) => {
  if (!body || !dv) return "—";
  return body.toLocaleString("es-CL").replace(/,/g, ".") + "-" + dv;
};
const fmtClp = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const PAGE_SIZE = 15;

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
);
const XIcon = ({ size = 12 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const ChevLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
);
const ChevRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
);
const ChevronDown = () => (
  <svg className="dd-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);
const ChannelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
);

function Dropdown({ label, icon, value, options, onSelect }: {
  label: string; icon: React.ReactNode; value: string;
  options: { value: string; label: string; count?: number }[]; onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h); return () => document.removeEventListener("click", h);
  }, []);
  return (
    <div ref={ref} className={`ficha-dropdown ${open ? "open" : ""}`}>
      <button type="button" className={`ficha-dd-trigger ${value ? "has-value" : ""}`} onClick={() => setOpen(!open)}>
        <span className="dd-label">{icon}<span>{value || label}</span></span><ChevronDown />
      </button>
      <div className="ficha-dd-menu">
        <div className="ficha-dd-list">
          <div className={`ficha-dd-item dd-all ${!value ? "selected" : ""}`} onClick={() => { onSelect(""); setOpen(false); }}>Todos</div>
          {options.map((o) => (
            <div key={o.value} className={`ficha-dd-item ${value === o.value ? "selected" : ""}`} onClick={() => { onSelect(o.value); setOpen(false); }}>
              {o.label}{o.count != null && <span className="dd-count">{o.count}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Props {
  clients: Client[];
  channels: SalesChannel[];
  paymentTerms: PaymentTerm[];
  salespeople: Profile[];
  clientChannelMap: Record<string, string[]>;
}

export function FichaClientes({ clients, channels, paymentTerms, salespeople, clientChannelMap }: Props) {
  const [q, setQ] = useState("");
  const [chFilter, setChFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Client | null>(null);
  const [isNew, setIsNew] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const filtered = clients.filter((c) => {
    if (chFilter) {
      const chs = clientChannelMap[c.id] ?? [];
      if (!chs.some((ch) => channels.find((x) => x.id === ch)?.display_name === chFilter)) return false;
    }
    if (!q) return true;
    const lq = q.toLowerCase();
    return c.name.toLowerCase().includes(lq) || fmtRut(c.rut_body, c.rut_dv).includes(lq) || (c.commune ?? "").toLowerCase().includes(lq) || (c.city ?? "").toLowerCase().includes(lq);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, chFilter]);

  const chOptions = channels.map((ch) => {
    const count = Object.values(clientChannelMap).filter((ids) => ids.includes(ch.id)).length;
    return { value: ch.display_name, label: ch.display_name, count };
  });

  const withCredit = clients.filter((c) => c.credit_line_clp > 0).length;

  function openModal(c: Client | null) { setSelected(c); setIsNew(!c); dialogRef.current?.showModal(); }
  function closeModal() { dialogRef.current?.close(); setSelected(null); setIsNew(false); }

  const pageNums: number[] = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pageNums.push(i); }
  else {
    pageNums.push(1);
    if (safePage > 3) pageNums.push(-1);
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pageNums.push(i);
    if (safePage < totalPages - 2) pageNums.push(-2);
    pageNums.push(totalPages);
  }

  return (
    <div className="ficha-content">
      <header className="ficha-head">
        <div>
          <div className="ficha-eyebrow">Configuración · Comercial</div>
          <h1 className="ficha-title">Clientes</h1>
          <p className="ficha-sub"><strong>{clients.length}</strong> clientes registrados · {withCredit} con línea de crédito</p>
        </div>
        <div className="ficha-actions">
          <button className="btn btn-primary" onClick={() => openModal(null)}><PlusIcon /> Nuevo cliente</button>
        </div>
      </header>

      <div className="ficha-filter-bar">
        <div className="ficha-search-wrap">
          <SearchIcon />
          <input className="ficha-search" placeholder="Buscar por nombre, RUT, comuna…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Dropdown label="Canal" icon={<ChannelIcon />} value={chFilter} options={chOptions} onSelect={setChFilter} />
      </div>

      {chFilter && (
        <div className="ficha-active-filters">
          <span className="ficha-filters-label">Filtrando por</span>
          <span className="ficha-pill">Canal: <strong>{chFilter}</strong>
            <button className="ficha-pill-x" onClick={() => setChFilter("")}><XIcon /></button>
          </span>
          <button className="ficha-clear-all" onClick={() => setChFilter("")}>Limpiar</button>
        </div>
      )}

      <section className="table-card">
        <div className="table-card-head"><div className="table-card-title">Listado de clientes</div></div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
          <thead style={{ background: "var(--bg)" }}>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ width: 100, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>RUT</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Razón Social</th>
              <th style={{ width: 150, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Comuna / Ciudad</th>
              <th style={{ width: 120, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Ejecutivo</th>
              <th style={{ width: 100, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Cond. Pago</th>
              <th style={{ width: 140, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Canales</th>
              <th style={{ width: 110, textAlign: "right", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--f-mono)" }}>Línea Crédito</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 0 }}>
                <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)" }}>
                  <div style={{ fontSize: 18, fontFamily: "var(--f-display)", color: "var(--text-2)", marginBottom: 6 }}>Sin resultados</div>
                </div>
              </td></tr>
            ) : paged.map((c) => (
              <tr key={c.id} onClick={() => openModal(c)} style={{ borderBottom: "1px solid var(--surface-2)", cursor: "pointer" }}>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtRut(c.rut_body, c.rut_dv)}</span>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>{titleCase(c.name)}</span>
                  {c.email && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</div>}
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{titleCase([c.commune, c.city].filter(Boolean).join(", ") || "—")}</span>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  {c.salesperson ? <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{(c.salesperson as unknown as Profile).short_name || (c.salesperson as unknown as Profile).full_name}</span> : <span className="muted">—</span>}
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  {c.payment_term ? <span className="ficha-tag">{(c.payment_term as unknown as PaymentTerm).name}</span> : <span className="muted">—</span>}
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(clientChannelMap[c.id] ?? []).map((chId) => { const ch = channels.find((x) => x.id === chId); return ch ? <span key={chId} className="ficha-tag">{ch.display_name}</span> : null; })}
                    {!(clientChannelMap[c.id]?.length) && <span className="muted">—</span>}
                  </div>
                </td>
                <td style={{ textAlign: "right", padding: "12px 12px", verticalAlign: "middle", fontFamily: "var(--f-mono)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{c.credit_line_clp > 0 ? fmtClp(c.credit_line_clp) : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-card-foot">
          <div className="table-card-info">Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} clientes</div>
          {totalPages > 1 && (
            <div className="page-btns">
              <button className={`page-btn ${safePage === 1 ? "pg-disabled" : ""}`} onClick={() => setPage(safePage - 1)}><ChevLeft /></button>
              {pageNums.map((n, i) => n < 0 ? <span key={`e${i}`} style={{ color: "var(--text-4)", padding: "0 4px" }}>…</span> : <button key={n} className={`page-btn ${n === safePage ? "pg-active" : ""}`} onClick={() => setPage(n)}>{n}</button>)}
              <button className={`page-btn ${safePage === totalPages ? "pg-disabled" : ""}`} onClick={() => setPage(safePage + 1)}><ChevRight /></button>
            </div>
          )}
        </div>
      </section>

      <ClientDialog ref={dialogRef} client={selected} isNew={isNew} channels={channels} paymentTerms={paymentTerms} salespeople={salespeople} clientChannelMap={clientChannelMap} onClose={closeModal} />
    </div>
  );
}

/* ── Modal ─────────────────────────────── */
const ClientDialog = forwardRef<HTMLDialogElement, {
  client: Client | null; isNew: boolean; channels: SalesChannel[]; paymentTerms: PaymentTerm[];
  salespeople: Profile[]; clientChannelMap: Record<string, string[]>; onClose: () => void;
}>(function ClientDialog({ client, isNew, channels, paymentTerms, salespeople, clientChannelMap, onClose }, ref) {
  const [state, action, pending] = useActionState(saveClient, { ok: false, error: null });
  const clientChs = client ? (clientChannelMap[client.id] ?? []) : [];
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  const c = client;

  return (
    <dialog ref={ref} className="warm-dialog ficha-dialog" style={{ maxWidth: 680 }} onClose={onClose}>
      <form action={action}>
        {c && <input type="hidden" name="id" value={c.id} />}
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left">
              <span className="ficha-dlg-tag">Ficha de cliente</span>
              {c && <span className="ficha-dlg-sku">{fmtRut(c.rut_body, c.rut_dv)}</span>}
            </div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">{isNew ? "Nuevo Cliente" : c?.name ?? ""}</h2>
          {c && (
            <div className="ficha-dlg-subtitle">
              <span>{[c.commune, c.city].filter(Boolean).join(", ") || "Sin ubicación"}</span>
              {c.salesperson && <><span className="dot" /><span>{(c.salesperson as unknown as Profile).full_name}</span></>}
            </div>
          )}
        </div>

        <div className="ficha-dlg-body">
          {state.error && <div className="field-error" style={{ marginBottom: 16 }}>{state.error}</div>}

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">i.</span>
              <h3 className="ficha-section-title">Datos principales</h3>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field span-2">
                <label className="ficha-label">Razón Social</label>
                <input name="name" className="ficha-input" defaultValue={c?.name ?? ""} required />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">RUT</label>
                <input name="rut" className="ficha-input mono" placeholder="12.345.678-9" defaultValue={c?.rut_body && c?.rut_dv ? fmtRut(c.rut_body, c.rut_dv) : ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Teléfono</label>
                <input name="phone" className="ficha-input" defaultValue={c?.phone ?? ""} />
              </div>
              <div className="ficha-field span-2">
                <label className="ficha-label">Email</label>
                <input name="email" type="email" className="ficha-input" defaultValue={c?.email ?? ""} />
              </div>
            </div>
          </section>

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">ii.</span>
              <h3 className="ficha-section-title">Dirección</h3>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field span-2">
                <label className="ficha-label">Dirección</label>
                <input name="address" className="ficha-input" defaultValue={c?.address ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Comuna</label>
                <input name="commune" className="ficha-input" defaultValue={c?.commune ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Ciudad</label>
                <input name="city" className="ficha-input" defaultValue={c?.city ?? ""} />
              </div>
            </div>
          </section>

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">iii.</span>
              <h3 className="ficha-section-title">Comercial</h3>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field">
                <label className="ficha-label">Ejecutivo</label>
                <select name="salesperson_id" className="ficha-select" defaultValue={c?.salesperson_id ?? ""}>
                  <option value="">Sin asignar</option>
                  {salespeople.map((sp) => <option key={sp.id} value={sp.id}>{sp.full_name}</option>)}
                </select>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Condición de pago</label>
                <select name="payment_term_id" className="ficha-select" defaultValue={c?.payment_term_id ?? ""}>
                  <option value="">Sin definir</option>
                  {paymentTerms.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                </select>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Línea de crédito</label>
                <div className="ficha-input-prefix">
                  <input name="credit_line_clp" type="number" className="ficha-input" defaultValue={c?.credit_line_clp ?? 0} min={0} />
                </div>
              </div>
            </div>
          </section>

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">iv.</span>
              <h3 className="ficha-section-title">Canales de Venta</h3>
              <span className="ficha-section-hint">puede tener varios</span>
            </div>
            <div className="ficha-check-list">
              {channels.map((ch) => (
                <label key={ch.id} className="ficha-check-item">
                  <input type="checkbox" name="channels" value={ch.id} defaultChecked={clientChs.includes(ch.id)} />
                  {ch.display_name}
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="ficha-dlg-foot">
          {c ? (
            <form action={deleteClient} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="ficha-btn-danger" onClick={(e) => { if (!confirm("¿Eliminar este cliente?")) e.preventDefault(); else onClose(); }}>
                <TrashIcon /> Eliminar cliente
              </button>
            </form>
          ) : <div />}
          <div className="ficha-dlg-foot-right">
            <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ficha-btn-save" disabled={pending}>
              {pending ? "Guardando…" : <><CheckIcon /> {isNew ? "Crear cliente" : "Guardar cambios"}</>}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
});
