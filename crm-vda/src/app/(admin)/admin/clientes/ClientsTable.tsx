"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveClient, deleteClient } from "./actions";
import { formatRut } from "@/lib/rut";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export interface ClientRow {
  id: string;
  rut_body: number;
  rut_dv: string;
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  payment_term_id: string | null;
  salesperson_id: string | null;
  channel_id: string | null;
  credit_line_clp: number;
  insurer_name: string | null;
  insurer_credit_line_clp: number;
  payment_term_name: string | null;
  salesperson_name: string | null;
}

export interface Option { id: string; label: string }

export function ClientsTable({
  initial, paymentTerms, salespeople, channels, stats,
}: {
  initial: ClientRow[];
  paymentTerms: Option[];
  salespeople: Option[];
  channels: Option[];
  stats: { total: number; with_insurer: number; without_salesperson: number; cities: number };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [salespFilter, setSalespFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);

  const salesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of initial) {
      const k = c.salesperson_name ?? "Sin vendedor";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [initial]);

  const filtered = initial.filter((c) => {
    if (salespFilter && (c.salesperson_name ?? "Sin vendedor") !== salespFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      String(c.rut_body).includes(q) ||
      (c.commune ?? "").toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q) ||
      (c.salesperson_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Datos maestros</div>
            <h1 className="doc-title">Clientes</h1>
            <p className="doc-sub">Base B2B con condiciones de pago, vendedor y líneas de crédito (interna + aseguradora).</p>
          </div>
        </div>

        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-key">Total clientes</div>
            <div className="stat-val">{stats.total}</div>
            <div className="stat-sub">activos</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Con cobertura seguros</div>
            <div className="stat-val">{stats.with_insurer}</div>
            <div className="stat-sub">línea otorgada &gt; 0</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Ciudades</div>
            <div className="stat-val">{stats.cities}</div>
            <div className="stat-sub">distribución geográfica</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Sin vendedor</div>
            <div className="stat-val">{stats.without_salesperson}</div>
            <div className={`stat-sub ${stats.without_salesperson > 0 ? "warn" : "ok"}`}>
              {stats.without_salesperson > 0 ? "requieren asignación" : "todos asignados"}
            </div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-box">
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
            <input
              className="search-input"
              placeholder="Busca por nombre, RUT, comuna o vendedor…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="search-kbd">/</span>
          </div>

          <div className="filter-chips">
            <button type="button" className={`chip ${salespFilter === null ? "active" : ""}`} onClick={() => setSalespFilter(null)}>
              Todos <span className="count">{stats.total}</span>
            </button>
            {salesWithCount.slice(0, 6).map(([s, count]) => (
              <button
                key={s}
                type="button"
                className={`chip ${salespFilter === s ? "active" : ""}`}
                onClick={() => setSalespFilter(s === salespFilter ? null : s)}
              >
                {s} <span className="count">{count}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo cliente
            </button>
          </div>
        </div>
      </div>

      <main className="content">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>RUT</th>
                <th>Razón Social</th>
                <th>Comuna · Ciudad</th>
                <th>Vendedor</th>
                <th>Cond. Pago</th>
                <th className="num">L. Crédito</th>
                <th className="num">L. Seguro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)}>
                  <td data-label="RUT"><span className="sku-cell">{formatRut(c.rut_body, c.rut_dv)}</span></td>
                  <td data-label="Razón Social"><div className="prod-name">{c.name}</div></td>
                  <td data-label="Comuna · Ciudad">
                    <span className="cat-chip">{c.commune ?? "—"}{c.city ? ` · ${c.city}` : ""}</span>
                  </td>
                  <td data-label="Vendedor">
                    {c.salesperson_name ? (
                      <span className="brand-cell">{c.salesperson_name}</span>
                    ) : <span className="badge badge-warn">sin asignar</span>}
                  </td>
                  <td data-label="Cond. Pago"><span className="brand-cell">{c.payment_term_name ?? "—"}</span></td>
                  <td className="num" data-label="L. Crédito"><span className="price">{fmt.format(c.credit_line_clp)}</span></td>
                  <td className="num" data-label="L. Seguro"><span className={`price ${c.insurer_credit_line_clp > 0 ? "price-neto" : ""}`}>{fmt.format(c.insurer_credit_line_clp)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <div className="page-info">
            Mostrando <strong>{filtered.length}</strong> de <strong>{stats.total}</strong>
          </div>
        </div>
      </main>

      {editing && (
        <ClientDialog
          client={editing === "new" ? null : editing}
          paymentTerms={paymentTerms}
          salespeople={salespeople}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function ClientDialog({
  client, paymentTerms, salespeople, channels, onClose, onSaved,
}: {
  client: ClientRow | null;
  paymentTerms: Option[];
  salespeople: Option[];
  channels: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await saveClient({ ok: true, error: null }, fd);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  }

  async function handleDelete() {
    if (!client || !confirm("¿Eliminar este cliente? Se puede restaurar después.")) return;
    const fd = new FormData();
    fd.set("id", client.id);
    startTransition(async () => {
      await deleteClient(fd);
      onSaved();
    });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog" style={{ maxWidth: 820 }}>
      <form onSubmit={handleSubmit}>
        {client && <input type="hidden" name="id" value={client.id} />}

        <header className="dlg-head">
          <div className="dlg-head-text">
            <div className="dlg-eyebrow">{client ? "Editando cliente" : "Nuevo cliente"}</div>
            <div className="dlg-title">{client?.name ?? "Crear cliente"}</div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose}>
            <svg className="i-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div className="dlg-body">
          <section className="dlg-section">
            <div className="dlg-section-title">Identificación</div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">RUT <span className="req">*</span></label>
                <input className="field-input mono" name="rut" defaultValue={client ? `${client.rut_body}-${client.rut_dv}` : ""} placeholder="12.345.678-9" required />
              </div>
              <div className="field col-2">
                <label className="field-label">Razón Social <span className="req">*</span></label>
                <input className="field-input" name="name" defaultValue={client?.name} required />
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Ubicación</div>
            <div className="grid-3">
              <div className="field col-3">
                <label className="field-label">Dirección</label>
                <input className="field-input" name="address" defaultValue={client?.address ?? ""} />
              </div>
              <div className="field">
                <label className="field-label">Comuna</label>
                <input className="field-input" name="commune" defaultValue={client?.commune ?? ""} />
              </div>
              <div className="field">
                <label className="field-label">Ciudad</label>
                <input className="field-input" name="city" defaultValue={client?.city ?? ""} />
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Contacto</div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Teléfono</label>
                <input className="field-input" name="phone" defaultValue={client?.phone ?? ""} />
              </div>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="field-input" name="email" type="email" defaultValue={client?.email ?? ""} />
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Comercial</div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">Cond. Pago</label>
                <select className="field-select" name="payment_term_id" defaultValue={client?.payment_term_id ?? ""}>
                  <option value="">— Sin asignar —</option>
                  {paymentTerms.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Vendedor</label>
                <select className="field-select" name="salesperson_id" defaultValue={client?.salesperson_id ?? ""}>
                  <option value="">— Sin asignar —</option>
                  {salespeople.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Canal</label>
                <select className="field-select" name="channel_id" defaultValue={client?.channel_id ?? ""}>
                  <option value="">— Sin asignar —</option>
                  {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Crédito</div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">L. Crédito interna (CLP)</label>
                <input className="field-input mono" type="number" name="credit_line_clp" defaultValue={client?.credit_line_clp ?? 0} />
              </div>
              <div className="field">
                <label className="field-label">Aseguradora</label>
                <input className="field-input" name="insurer_name" defaultValue={client?.insurer_name ?? ""} placeholder="Ej: Aseguradora Nacional" />
              </div>
              <div className="field">
                <label className="field-label">L. Crédito seguro (CLP)</label>
                <input className="field-input mono" type="number" name="insurer_credit_line_clp" defaultValue={client?.insurer_credit_line_clp ?? 0} />
              </div>
            </div>
          </section>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <footer className="dlg-foot">
          <div>
            {client && (
              <button type="button" onClick={handleDelete} disabled={pending} className="btn btn-ghost" style={{ color: "var(--danger)", borderColor: "rgba(139,45,31,0.3)" }}>
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Guardando…" : client ? "Guardar cambios" : "Crear cliente"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
