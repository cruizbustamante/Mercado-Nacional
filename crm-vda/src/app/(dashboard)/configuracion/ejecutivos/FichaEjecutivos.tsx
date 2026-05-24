"use client";

import { useActionState, useRef, useState, useEffect, forwardRef } from "react";
import type { Profile, SalesChannel } from "@/lib/types/database";
import { saveEjecutivo, deactivateEjecutivo } from "../actions";

interface RoleRow { id: string; name: string; display_name: string }
type ProfileRow = Profile & { role: RoleRow };

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
const ChevronDown = () => (
  <svg className="dd-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);
const CircleCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const ChevLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
);
const ChevRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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
      <div className="ficha-dd-menu" style={{ minWidth: 200 }}>
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
  profiles: ProfileRow[];
  roles: RoleRow[];
  channels: SalesChannel[];
  spChannelMap: Record<string, string[]>;
}

export function FichaEjecutivos({ profiles, roles, channels, spChannelMap }: Props) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const filtered = profiles.filter((p) => {
    if (statusFilter === "active" && !p.is_active) return false;
    if (statusFilter === "inactive" && p.is_active) return false;
    if (!q) return true;
    const lq = q.toLowerCase();
    return p.full_name.toLowerCase().includes(lq) || p.email.toLowerCase().includes(lq) || (p.role?.display_name ?? "").toLowerCase().includes(lq);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, statusFilter]);

  const activeCount = profiles.filter((p) => p.is_active).length;

  function openModal(p: ProfileRow | null) { setSelected(p); setIsNew(!p); dialogRef.current?.showModal(); }
  function closeModal() { dialogRef.current?.close(); setSelected(null); setIsNew(false); }

  return (
    <div className="ficha-content">
      <header className="ficha-head">
        <div>
          <div className="ficha-eyebrow">Configuración · Equipo</div>
          <h1 className="ficha-title">Ejecutivos</h1>
          <p className="ficha-sub"><strong>{activeCount}</strong> ejecutivos activos · {profiles.length} registrados</p>
        </div>
        <div className="ficha-actions">
          <button className="btn btn-primary" onClick={() => openModal(null)}><PlusIcon /> Nuevo ejecutivo</button>
        </div>
      </header>

      <div className="ficha-filter-bar">
        <div className="ficha-search-wrap">
          <SearchIcon />
          <input className="ficha-search" placeholder="Buscar por nombre, email, rol…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Dropdown label="Estado" icon={<CircleCheckIcon />} value={statusFilter}
          options={[{ value: "active", label: "Activos", count: activeCount }, { value: "inactive", label: "Inactivos", count: profiles.length - activeCount }]}
          onSelect={setStatusFilter} />
      </div>

      <section className="table-card">
        <div className="table-card-head"><div className="table-card-title">Listado de ejecutivos</div></div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
          <thead style={{ background: "var(--bg)" }}>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ width: 40, textAlign: "left", padding: "10px 12px", paddingLeft: 16, fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)" }}></th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Nombre</th>
              <th style={{ width: 220, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Email</th>
              <th style={{ width: 120, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Rol</th>
              <th style={{ width: 200, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Canales</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 0 }}>
                <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)" }}>
                  <div style={{ fontSize: 18, fontFamily: "var(--f-display)", color: "var(--text-2)", marginBottom: 6 }}>Sin resultados</div>
                </div>
              </td></tr>
            ) : paged.map((p) => (
              <tr key={p.id} onClick={() => openModal(p)} style={{ borderBottom: "1px solid var(--surface-2)", cursor: "pointer" }}>
                <td style={{ textAlign: "center", padding: "12px 12px", paddingLeft: 16, verticalAlign: "middle" }}>
                  <span className={`status-dot-indicator ${p.is_active ? "active" : "inactive"}`} />
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${p.color ?? "var(--text)"} 0%, #4A453D 100%)`, color: "white", display: "grid", placeItems: "center", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                      {p.initials ?? ""}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{p.full_name}</span>
                      {p.short_name && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{p.short_name}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{p.email}</span>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <span className="ficha-tag">{p.role?.display_name ?? "—"}</span>
                </td>
                <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(spChannelMap[p.id] ?? []).map((chId) => { const ch = channels.find((x) => x.id === chId); return ch ? <span key={chId} className="ficha-tag">{ch.display_name}</span> : null; })}
                    {!(spChannelMap[p.id]?.length) && <span className="muted">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-card-foot">
          <div className="table-card-info">Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} ejecutivos</div>
          {totalPages > 1 && (
            <div className="page-btns">
              <button className={`page-btn ${safePage === 1 ? "pg-disabled" : ""}`} onClick={() => setPage(safePage - 1)}><ChevLeft /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`page-btn ${n === safePage ? "pg-active" : ""}`} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button className={`page-btn ${safePage === totalPages ? "pg-disabled" : ""}`} onClick={() => setPage(safePage + 1)}><ChevRight /></button>
            </div>
          )}
        </div>
      </section>

      <EjecutivoDialog ref={dialogRef} profile={selected} isNew={isNew} roles={roles} channels={channels} spChannelMap={spChannelMap} onClose={closeModal} />
    </div>
  );
}

/* ── Modal ─────────────────────────────── */
const EjecutivoDialog = forwardRef<HTMLDialogElement, {
  profile: ProfileRow | null; isNew: boolean; roles: RoleRow[];
  channels: SalesChannel[]; spChannelMap: Record<string, string[]>; onClose: () => void;
}>(function EjecutivoDialog({ profile, isNew, roles, channels, spChannelMap, onClose }, ref) {
  const [state, action, pending] = useActionState(saveEjecutivo, { ok: false, error: null });
  const pChs = profile ? (spChannelMap[profile.id] ?? []) : [];
  const [isActive, setIsActive] = useState(profile?.is_active ?? true);
  useEffect(() => { setIsActive(profile?.is_active ?? true); }, [profile]);
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);
  const p = profile;

  return (
    <dialog ref={ref} className="warm-dialog ficha-dialog" style={{ maxWidth: 560 }} onClose={onClose}>
      <form action={action}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <input type="hidden" name="is_active" value={isActive ? "true" : "false"} />

        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left">
              <span className="ficha-dlg-tag">Ficha de ejecutivo</span>
              {p && <span className={`ficha-dlg-status ${p.is_active ? "active" : "inactive"}`}>{p.is_active ? "Activo" : "Inactivo"}</span>}
            </div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">{isNew ? "Nuevo Ejecutivo" : p?.full_name ?? ""}</h2>
          {p && <div className="ficha-dlg-subtitle"><span>{p.role?.display_name ?? "Sin rol"}</span><span className="dot" /><span>{p.email}</span></div>}
        </div>

        <div className="ficha-dlg-body">
          {state.error && <div className="field-error" style={{ marginBottom: 16 }}>{state.error}</div>}

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">i.</span>
              <h3 className="ficha-section-title">Datos personales</h3>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field span-2">
                <label className="ficha-label">Nombre completo</label>
                <input name="full_name" className="ficha-input" defaultValue={p?.full_name ?? ""} required />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Nombre corto <span className="optional">opcional</span></label>
                <input name="short_name" className="ficha-input" placeholder="Ej: Carlos R." defaultValue={p?.short_name ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Email</label>
                <input name="email" type="email" className="ficha-input" defaultValue={p?.email ?? ""} required />
              </div>
            </div>
          </section>

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">ii.</span>
              <h3 className="ficha-section-title">Rol y estado</h3>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field">
                <label className="ficha-label">Rol</label>
                <select name="role_id" className="ficha-select" defaultValue={p?.role_id ?? ""} required>
                  <option value="">Seleccionar rol</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                </select>
              </div>
              <div className="ficha-field">
                <div className="ficha-switch-card" style={{ marginTop: 20 }}>
                  <div className="ficha-switch-info">
                    <span className="ficha-switch-title">Activo</span>
                  </div>
                  <div className={`ficha-switch ${isActive ? "" : "off"}`} onClick={() => setIsActive(!isActive)} />
                </div>
              </div>
            </div>
          </section>

          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">iii.</span>
              <h3 className="ficha-section-title">Canales asignados</h3>
            </div>
            <div className="ficha-check-list">
              {channels.map((ch) => (
                <label key={ch.id} className="ficha-check-item">
                  <input type="checkbox" name="channels" value={ch.id} defaultChecked={pChs.includes(ch.id)} />
                  {ch.display_name}
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="ficha-dlg-foot">
          {p ? (
            <form action={deactivateEjecutivo} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="ficha-btn-danger" onClick={(e) => { if (!confirm("¿Desactivar este ejecutivo?")) e.preventDefault(); else onClose(); }}>
                Desactivar
              </button>
            </form>
          ) : <div />}
          <div className="ficha-dlg-foot-right">
            <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ficha-btn-save" disabled={pending}>
              {pending ? "Guardando…" : <><CheckIcon /> {isNew ? "Crear ejecutivo" : "Guardar cambios"}</>}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
});
