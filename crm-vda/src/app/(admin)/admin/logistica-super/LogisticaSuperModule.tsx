"use client";

import { useState, useEffect, useRef, useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveLogisticRule, deleteLogisticRule } from "./actions";

interface Rule {
  id: string;
  brand_id: string | null;
  brand_name: string | null;
  chain_id: string | null;
  chain_name: string | null;
  cost_per_unit: number;
  is_default: boolean;
}

interface Option {
  id: string;
  name: string;
}

interface Props {
  rules: Rule[];
  brands: Option[];
  chains: Option[];
}

const fmtCLP = (n: number) =>
  "$" + n.toLocaleString("es-CL");

export function LogisticaSuperModule({ rules, brands, chains }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (rule: Rule) => {
    setDeleteError(null);
    const result = await deleteLogisticRule(rule.id);
    if (!result.ok) {
      setDeleteError(result.error);
    } else {
      setDeleting(null);
      router.refresh();
    }
  };

  return (
    <>
      <div className="block">
        <div className="block-head">
          <div className="block-title">
            <span className="block-title-num">
              <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </span>
            <span className="block-title-text">
              Reglas de costo logístico
              <span className="block-sub">{rules.length} regla{rules.length !== 1 ? "s" : ""} configuradas</span>
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva regla
          </button>
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table className="t-ficha">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Tipo</th>
                  <th>Marca</th>
                  <th>Cadena</th>
                  <th className="num" style={{ width: 130 }}>Costo / un</th>
                  <th style={{ width: 100 }}>Prioridad</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const priority = rule.is_default
                    ? 0
                    : (rule.brand_id ? 2 : 0) + (rule.chain_id ? 1 : 0);
                  const priorityLabel = rule.is_default
                    ? "Base"
                    : priority === 3
                      ? "Alta"
                      : priority === 2
                        ? "Media"
                        : "Baja";
                  const priorityColor = rule.is_default
                    ? "var(--text-3)"
                    : priority === 3
                      ? "var(--success)"
                      : priority === 2
                        ? "var(--info)"
                        : "var(--warning)";

                  return (
                    <tr key={rule.id}>
                      <td>
                        {rule.is_default ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 8px", borderRadius: 3,
                            background: "var(--accent-soft)", color: "var(--accent)",
                            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                          }}>
                            DEFAULT
                          </span>
                        ) : (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 8px", borderRadius: 3,
                            background: "var(--surface-2)", color: "var(--text-2)",
                            fontSize: 11, fontWeight: 500,
                          }}>
                            Regla
                          </span>
                        )}
                      </td>
                      <td>
                        {rule.brand_name ? (
                          <span className="brand-italic">{rule.brand_name}</span>
                        ) : (
                          <span style={{ color: "var(--text-4)", fontStyle: "italic" }}>Todas</span>
                        )}
                      </td>
                      <td>
                        {rule.chain_name ? (
                          <span style={{ fontWeight: 500, color: "var(--text)" }}>{rule.chain_name}</span>
                        ) : (
                          <span style={{ color: "var(--text-4)", fontStyle: "italic" }}>Todas</span>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600, fontSize: 14 }}>
                        {fmtCLP(rule.cost_per_unit)}
                      </td>
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 500, color: priorityColor,
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: priorityColor, display: "inline-block",
                          }} />
                          {priorityLabel}
                        </span>
                      </td>
                      <td>
                        <div className="ficha-row-actions" style={{ opacity: 1 }}>
                          <button
                            className="ficha-row-action"
                            title="Editar"
                            onClick={() => setEditing(rule)}
                          >
                            <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                          </button>
                          {!rule.is_default && (
                            <button
                              className="ficha-row-action"
                              title="Eliminar"
                              style={{ color: "var(--danger)" }}
                              onClick={() => { setDeleteError(null); setDeleting(rule); }}
                            >
                              <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>
                      No hay reglas configuradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-card-foot">
            <div className="table-card-info">
              La regla con mayor especificidad gana: marca+cadena &gt; marca &gt; cadena &gt; default
            </div>
          </div>
        </div>
      </div>

      {/* Edit / New Dialog */}
      {editing && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          brands={brands}
          chains={chains}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleting && (
        <DeleteDialog
          rule={deleting}
          error={deleteError}
          onConfirm={() => handleDelete(deleting)}
          onClose={() => { setDeleting(null); setDeleteError(null); }}
        />
      )}
    </>
  );
}

/* ── Rule Dialog ──────────────────────────────────── */

function RuleDialog({
  rule, brands, chains, onClose, onSaved,
}: {
  rule: Rule | null;
  brands: Option[];
  chains: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isNew = !rule;

  const [state, formAction, isPending] = useActionState(saveLogisticRule, { ok: false, error: null });

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state.ok, onSaved]);

  return (
    <dialog ref={dialogRef} className="warm-dialog">
      <form action={formAction}>
        {rule && <input type="hidden" name="id" value={rule.id} />}

        <div className="dlg-head">
          <div className="dlg-head-text">
            <div className="dlg-eyebrow">Logística Supermercados</div>
            <div className="dlg-title">{isNew ? "Nueva regla" : "Editar regla"}</div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose}>
            <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="dlg-body">
          {state.error && (
            <div style={{
              padding: "10px 14px", marginBottom: 16, borderRadius: 5,
              background: "var(--danger-soft)", color: "var(--danger)",
              fontSize: 13, fontWeight: 500,
            }}>
              {state.error}
            </div>
          )}

          <div className="grid-2">
            <div className="field">
              <label className="field-label">Marca</label>
              <select
                name="brand_id"
                className="field-input"
                defaultValue={rule?.brand_id ?? ""}
                disabled={rule?.is_default}
              >
                <option value="">Todas las marcas</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <span className="field-hint">Dejar vacío para aplicar a todas</span>
            </div>

            <div className="field">
              <label className="field-label">Cadena</label>
              <select
                name="chain_id"
                className="field-input"
                defaultValue={rule?.chain_id ?? ""}
                disabled={rule?.is_default}
              >
                <option value="">Todas las cadenas</option>
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="field-hint">Dejar vacío para aplicar a todas</span>
            </div>

            <div className="field col-2">
              <label className="field-label">Costo logístico por unidad (CLP neto)</label>
              <input
                type="number"
                name="cost_per_unit"
                className="field-input"
                defaultValue={rule?.cost_per_unit ?? 360}
                min={0}
                step={1}
                required
              />
              <span className="field-hint">Valor entero en pesos chilenos sin IVA</span>
            </div>
          </div>

          {rule?.is_default && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 5,
              background: "var(--info-soft)", color: "var(--info)",
              fontSize: 12, lineHeight: 1.5,
            }}>
              Esta es la regla por defecto. Se aplica cuando no hay una regla más específica.
              No se puede cambiar marca/cadena.
            </div>
          )}
        </div>

        <div className="dlg-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? "Guardando..." : isNew ? "Crear regla" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/* ── Delete Confirmation Dialog ────────────────────── */

function DeleteDialog({
  rule, error, onConfirm, onClose,
}: {
  rule: Rule;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="warm-dialog" style={{ maxWidth: 440 }}>
      <div className="dlg-head">
        <div className="dlg-head-text">
          <div className="dlg-eyebrow" style={{ color: "var(--danger)" }}>Confirmar eliminación</div>
          <div className="dlg-title">Eliminar regla logística</div>
        </div>
        <button type="button" className="dlg-close" onClick={onClose}>
          <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="dlg-body">
        {error && (
          <div style={{
            padding: "10px 14px", marginBottom: 16, borderRadius: 5,
            background: "var(--danger-soft)", color: "var(--danger)",
            fontSize: 13, fontWeight: 500,
          }}>
            {error}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-2)", lineHeight: 1.6 }}>
          Se eliminará la regla para{" "}
          <strong>{rule.brand_name ?? "todas las marcas"}</strong> /
          {" "}<strong>{rule.chain_name ?? "todas las cadenas"}</strong>
          {" "}({fmtCLP(rule.cost_per_unit)}/un).
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-3)" }}>
          Los productos afectados volverán a usar la regla por defecto o la siguiente más específica.
        </p>
      </div>

      <div className="dlg-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={loading}
          onClick={() => { setLoading(true); onConfirm(); }}
        >
          {loading ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </dialog>
  );
}
