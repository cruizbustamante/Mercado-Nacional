"use client";

import { useActionState, useRef, useState, useEffect, forwardRef } from "react";
import type { SalesChannel } from "@/lib/types/database";
import { saveChannel, deactivateChannel } from "../actions";

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

interface Props { channels: SalesChannel[] }

export function FichaCanales({ channels }: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<SalesChannel | null>(null);
  const [isNew, setIsNew] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const filtered = channels.filter((ch) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return ch.display_name.toLowerCase().includes(lq) || ch.name.toLowerCase().includes(lq) || ch.nv_prefix.toLowerCase().includes(lq);
  });

  const activeCount = channels.filter((ch) => ch.is_active).length;

  function openModal(ch: SalesChannel | null) { setSelected(ch); setIsNew(!ch); dialogRef.current?.showModal(); }
  function closeModal() { dialogRef.current?.close(); setSelected(null); setIsNew(false); }

  return (
    <div className="ficha-content">
      <header className="ficha-head">
        <div>
          <div className="ficha-eyebrow">Configuración · Canales</div>
          <h1 className="ficha-title">Canales de Venta</h1>
          <p className="ficha-sub"><strong>{activeCount}</strong> canales activos · {channels.length} registrados</p>
        </div>
        <div className="ficha-actions">
          <button className="btn btn-primary" onClick={() => openModal(null)}><PlusIcon /> Nuevo canal</button>
        </div>
      </header>

      <div className="ficha-filter-bar">
        <div className="ficha-search-wrap">
          <SearchIcon />
          <input className="ficha-search" placeholder="Buscar canal…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <section className="table-card">
        <div className="table-card-head"><div className="table-card-title">Listado de canales</div></div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
          <thead style={{ background: "var(--bg)" }}>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ width: 40, textAlign: "left", padding: "10px 12px", paddingLeft: 16, fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)" }}></th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Nombre</th>
              <th style={{ width: 160, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Slug</th>
              <th style={{ width: 110, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Prefijo NV</th>
              <th style={{ width: 150, textAlign: "right", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--f-mono)" }}>Último correlativo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 0 }}>
                <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)" }}>
                  <div style={{ fontSize: 18, fontFamily: "var(--f-display)", color: "var(--text-2)", marginBottom: 6 }}>Sin resultados</div>
                </div>
              </td></tr>
            ) : filtered.map((ch) => (
              <tr key={ch.id} onClick={() => openModal(ch)} style={{ borderBottom: "1px solid var(--surface-2)", cursor: "pointer" }}>
                <td style={{ textAlign: "center", padding: "12px 12px", paddingLeft: 16, verticalAlign: "middle" }}>
                  <span className={`status-dot-indicator ${ch.is_active ? "active" : "inactive"}`} />
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }}>{ch.display_name}</span>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{ch.name}</span>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span className="ficha-tag">{ch.nv_prefix}</span>
                </td>
                <td style={{ textAlign: "right", padding: "12px 12px", verticalAlign: "middle", fontFamily: "var(--f-mono)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{ch.nv_last_correlative}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-card-foot">
          <div className="table-card-info">Mostrando {filtered.length} de {channels.length} canales</div>
        </div>
      </section>

      <CanalDialog ref={dialogRef} channel={selected} isNew={isNew} onClose={closeModal} />
    </div>
  );
}

/* ── Modal ─────────────────────────────── */
const CanalDialog = forwardRef<HTMLDialogElement, {
  channel: SalesChannel | null; isNew: boolean; onClose: () => void;
}>(function CanalDialog({ channel, isNew, onClose }, ref) {
  const [state, action, pending] = useActionState(saveChannel, { ok: false, error: null });
  const [isActive, setIsActive] = useState(channel?.is_active ?? true);
  useEffect(() => { setIsActive(channel?.is_active ?? true); }, [channel]);
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  const ch = channel;

  return (
    <dialog ref={ref} className="warm-dialog ficha-dialog" style={{ maxWidth: 480 }} onClose={onClose}>
      <form action={action}>
        {ch && <input type="hidden" name="id" value={ch.id} />}
        <input type="hidden" name="is_active" value={isActive ? "true" : "false"} />

        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left">
              <span className="ficha-dlg-tag">Ficha de canal</span>
              {ch && <span className="ficha-dlg-sku">{ch.nv_prefix}</span>}
              {ch && <span className={`ficha-dlg-status ${ch.is_active ? "active" : "inactive"}`}>{ch.is_active ? "Activo" : "Inactivo"}</span>}
            </div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">{isNew ? "Nuevo Canal" : ch?.display_name ?? ""}</h2>
          {ch && <div className="ficha-dlg-subtitle"><span>Slug: {ch.name}</span><span className="dot" /><span>Correlativo: {ch.nv_last_correlative}</span></div>}
        </div>

        <div className="ficha-dlg-body">
          {state.error && <div className="field-error" style={{ marginBottom: 16 }}>{state.error}</div>}

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">i.</span>
              <h3 className="ficha-section-title">Identificación</h3>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field span-2">
                <label className="ficha-label">Nombre a mostrar</label>
                <input name="display_name" className="ficha-input" defaultValue={ch?.display_name ?? ""} required />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Slug (interno)</label>
                <input name="name" className="ficha-input mono" defaultValue={ch?.name ?? ""} placeholder="ej: horeca" required />
                <span className="ficha-field-helper">Identificador único, sin espacios.</span>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Prefijo NV</label>
                <input name="nv_prefix" className="ficha-input mono" defaultValue={ch?.nv_prefix ?? ""} placeholder="HC" maxLength={4} required style={{ textTransform: "uppercase" }} />
                <span className="ficha-field-helper">2-4 letras, ej: HC, SM, DT.</span>
              </div>
            </div>
          </section>

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">ii.</span>
              <h3 className="ficha-section-title">Estado</h3>
            </div>
            <div className="ficha-switch-card">
              <div className="ficha-switch-info">
                <span className="ficha-switch-title">Canal activo</span>
                <span className="ficha-switch-desc">Disponible para emisión de notas de venta.</span>
              </div>
              <div className={`ficha-switch ${isActive ? "" : "off"}`} onClick={() => setIsActive(!isActive)} />
            </div>
          </section>
        </div>

        <div className="ficha-dlg-foot">
          {ch ? (
            <form action={deactivateChannel} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={ch.id} />
              <button type="submit" className="ficha-btn-danger" onClick={(e) => { if (!confirm("¿Desactivar este canal?")) e.preventDefault(); else onClose(); }}>
                Desactivar
              </button>
            </form>
          ) : <div />}
          <div className="ficha-dlg-foot-right">
            <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ficha-btn-save" disabled={pending}>
              {pending ? "Guardando…" : <><CheckIcon /> {isNew ? "Crear canal" : "Guardar cambios"}</>}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
});
