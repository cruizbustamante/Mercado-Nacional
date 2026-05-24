"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { OcDetail, OcDetailLine } from "../../_lib/queries";
import { saveOcLineUpdates, type LineUpdate } from "./actions";

const fmtClp = (n: number) => `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;
const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return fmtClp(n);
};

const LOST_REASONS: Array<{ value: string; label: string }> = [
  { value: "sin_stock",    label: "Sin stock" },
  { value: "no_entro_cd",  label: "No entró al CD" },
  { value: "fuera_plazo",  label: "Fuera de plazo" },
  { value: "error_mapeo",  label: "Error de mapeo" },
  { value: "otro",         label: "Otro" },
];

interface DraftLine {
  boxes: string;            // string para input control
  invoice: string;
  date: string;
  lostReason: string;       // "" = no marcada
  dirty: boolean;
}

function lineToDraft(line: OcDetailLine): DraftLine {
  return {
    boxes: line.assignment?.boxes_invoiced != null ? String(line.assignment.boxes_invoiced) : "",
    invoice: line.assignment?.invoice_number ?? "",
    date: line.assignment?.invoice_date ?? "",
    lostReason: line.lost_sale_reason ?? "",
    dirty: false,
  };
}

export function OcLinesEditor({ oc }: { oc: OcDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [drafts, setDrafts] = useState<Record<string, DraftLine>>(() => {
    const o: Record<string, DraftLine> = {};
    for (const l of oc.items) o[l.id] = lineToDraft(l);
    return o;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkInvoice, setBulkInvoice] = useState("");
  const [bulkDate, setBulkDate] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const dirtyLineIds = useMemo(
    () => Object.entries(drafts).filter(([, d]) => d.dirty).map(([id]) => id),
    [drafts]
  );

  const updateDraft = useCallback((lineId: string, patch: Partial<DraftLine>) => {
    setDrafts((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...patch, dirty: true },
    }));
  }, []);

  const toggleSelect = (lineId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(oc.items.map((l) => l.id)));
  const clearSelection = () => setSelected(new Set());

  /* ============ BULK ACTIONS ============ */
  const applyBulkInvoice = () => {
    if (!bulkInvoice.trim() || selected.size === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        const line = oc.items.find((l) => l.id === id);
        if (!line) continue;
        next[id] = {
          ...next[id],
          invoice: bulkInvoice.trim(),
          date: bulkDate || next[id].date,
          boxes: next[id].boxes || String(line.quantity_boxes),
          lostReason: "",
          dirty: true,
        };
      }
      return next;
    });
  };

  const applyFullFill = () => {
    if (selected.size === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        const line = oc.items.find((l) => l.id === id);
        if (!line) continue;
        next[id] = {
          ...next[id],
          boxes: String(line.quantity_boxes),
          lostReason: "",
          dirty: true,
        };
      }
      return next;
    });
  };

  const applyLostBulk = () => {
    if (selected.size === 0) return;
    const reason = prompt("Razón de venta perdida (sin_stock / no_entro_cd / fuera_plazo / error_mapeo / otro):", "sin_stock");
    if (!reason) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        next[id] = { ...next[id], lostReason: reason, boxes: "", invoice: "", dirty: true };
      }
      return next;
    });
  };

  /* ============ SAVE ============ */
  const handleSave = () => {
    const updates: LineUpdate[] = dirtyLineIds.map((id) => {
      const d = drafts[id];
      const boxes = d.boxes ? parseInt(d.boxes, 10) || 0 : 0;
      return {
        lineId: id,
        boxesInvoiced: boxes > 0 ? boxes : null,
        invoiceNumber: d.invoice.trim() || null,
        invoiceDate: d.date || null,
        lostSaleReason: d.lostReason || null,
      };
    });
    if (updates.length === 0) return;
    setSavedMsg(null);
    startTransition(async () => {
      const result = await saveOcLineUpdates(oc.id, updates);
      if (result.ok) {
        setSavedMsg(`Guardado: ${result.updatedLines} líneas · ${result.invoicesAffected} factura(s) afectadas`);
        setSelected(new Set());
        setBulkInvoice("");
        setBulkDate("");
        // El revalidatePath del action recarga los datos
        router.refresh();
        // Marcar drafts como no-dirty (se rehidratará con la nueva data del refresh)
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of dirtyLineIds) next[id] = { ...next[id], dirty: false };
          return next;
        });
      } else {
        setSavedMsg(`Error: ${result.errors.join(" · ")}`);
      }
    });
  };

  const discardChanges = () => {
    const fresh: Record<string, DraftLine> = {};
    for (const l of oc.items) fresh[l.id] = lineToDraft(l);
    setDrafts(fresh);
    setSavedMsg(null);
  };

  /* ============ TOTALES PROYECTADOS ============ */
  const projected = useMemo(() => {
    let facturado = 0;
    let cajasFacturadas = 0;
    let lostAmount = 0;
    for (const line of oc.items) {
      const d = drafts[line.id];
      const boxes = parseInt(d.boxes || "0", 10) || 0;
      if (boxes > 0 && d.invoice.trim()) {
        const amount = boxes * (line.units_per_pack ?? 1) * line.unit_price;
        facturado += amount;
        cajasFacturadas += boxes;
      }
      if (d.lostReason) {
        lostAmount += Math.max(0, line.line_amount - (boxes * (line.units_per_pack ?? 1) * line.unit_price));
      }
    }
    return {
      facturado,
      cajasFacturadas,
      lostAmount,
      cumplim: oc.total_amount > 0 ? Math.round((facturado / oc.total_amount) * 100) : 0,
      pendiente: Math.max(0, oc.total_amount - facturado - lostAmount),
    };
  }, [drafts, oc.items, oc.total_amount]);

  const totalCajas = oc.items.reduce((s, it) => s + it.quantity_boxes, 0);
  const cumplimTone = projected.cumplim >= 80 ? "ok" : projected.cumplim >= 50 ? "warn" : "danger";

  return (
    <div className="oc-editor-shell">
      {/* === MAIN COLUMN: tabla líneas === */}
      <div className="oc-editor-main">
        {/* Bulk bar (siempre presente, deshabilita cuando no hay selección) */}
        <div className={`bulk-bar ${selected.size > 0 ? "is-active" : ""}`}>
          <div className="bulk-info">
            {selected.size > 0
              ? <><b>{selected.size}</b> de {oc.items.length} línea(s) seleccionadas</>
              : <>Selecciona líneas para acciones masivas · o edita inline en la tabla</>}
          </div>
          <input
            type="text"
            className="bulk-input"
            placeholder="N° factura"
            value={bulkInvoice}
            onChange={(e) => setBulkInvoice(e.target.value)}
            disabled={selected.size === 0}
          />
          <input
            type="date"
            className="bulk-input"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
            disabled={selected.size === 0}
          />
          <button type="button" className="btn-sm btn-primary-sm" onClick={applyBulkInvoice} disabled={selected.size === 0 || !bulkInvoice.trim()}>
            Aplicar factura
          </button>
          <button type="button" className="btn-sm btn-ghost-sm" onClick={applyFullFill} disabled={selected.size === 0}>
            Marcar 100%
          </button>
          <button type="button" className="btn-sm btn-danger-sm" onClick={applyLostBulk} disabled={selected.size === 0}>
            Venta perdida
          </button>
          {selected.size > 0 && (
            <button type="button" className="btn-sm btn-link" onClick={clearSelection}>
              Limpiar
            </button>
          )}
        </div>

        <div className="oc-editor-table-wrap">
          <table className="oc-editor-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input
                    type="checkbox"
                    className="cb"
                    checked={selected.size === oc.items.length && oc.items.length > 0}
                    ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < oc.items.length; }}
                    onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
                  />
                </th>
                <th style={{ width: 32 }}>#</th>
                <th>Producto</th>
                <th className="num" style={{ width: 56 }}>Cj OC</th>
                <th className="num" style={{ width: 90 }}>Precio</th>
                <th className="num" style={{ width: 80 }}>Cj fact.</th>
                <th style={{ width: 120 }}>N° factura</th>
                <th style={{ width: 130 }}>Fecha factura</th>
                <th style={{ width: 100 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {oc.items.map((line) => {
                const d = drafts[line.id];
                const boxes = parseInt(d.boxes || "0", 10) || 0;
                const fr = line.quantity_boxes > 0 ? boxes / line.quantity_boxes : 0;
                const isLost = !!d.lostReason;
                const isFull = boxes > 0 && boxes >= line.quantity_boxes;
                const isPartial = boxes > 0 && !isFull;
                const isAssigned = boxes > 0 && d.invoice.trim().length > 0;

                const rowClass = isLost ? "row-lost"
                  : isFull && d.invoice ? "row-ok"
                  : isPartial && d.invoice ? "row-partial"
                  : !line.product ? "row-orphan"
                  : "";

                return (
                  <tr key={line.id} className={rowClass}>
                    <td>
                      <input
                        type="checkbox"
                        className="cb"
                        checked={selected.has(line.id)}
                        onChange={() => toggleSelect(line.id)}
                      />
                    </td>
                    <td className="mono" style={{ color: "var(--text-3)" }}>
                      {String(line.line_number).padStart(2, "0")}
                    </td>
                    <td>
                      <div className="prod-name">{line.product?.name ?? line.product_name_oc ?? "—"}</div>
                      <div className="line-extra">
                        {line.upc_code && <span className="mono">{line.upc_code}</span>}
                        {line.product
                          ? <span className="pill">{line.product.sku}</span>
                          : <span className="badge badge-warn" style={{ fontSize: 10 }}>sin mapear</span>}
                      </div>
                    </td>
                    <td className="num mono">{line.quantity_boxes}</td>
                    <td className="num mono">{fmtClp(line.unit_price)}</td>
                    <td className="num">
                      <input
                        type="text"
                        inputMode="numeric"
                        className={`cell-input cell-input-num ${isLost ? "is-disabled" : ""}`}
                        value={d.boxes}
                        onChange={(e) => updateDraft(line.id, { boxes: e.target.value.replace(/[^\d]/g, ""), lostReason: "" })}
                        disabled={isLost}
                        placeholder="0"
                        max={line.quantity_boxes}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={`cell-input cell-input-text ${isAssigned ? "is-assigned" : ""} ${isLost ? "is-disabled" : ""}`}
                        value={d.invoice}
                        onChange={(e) => updateDraft(line.id, { invoice: e.target.value, lostReason: "" })}
                        disabled={isLost}
                        placeholder="F-…"
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={`cell-input cell-input-date ${isLost ? "is-disabled" : ""}`}
                        value={d.date}
                        onChange={(e) => updateDraft(line.id, { date: e.target.value })}
                        disabled={isLost}
                      />
                    </td>
                    <td>
                      {isLost ? (
                        <div className="status-edit-cell">
                          <select
                            className="lost-select"
                            value={d.lostReason}
                            onChange={(e) => updateDraft(line.id, { lostReason: e.target.value })}
                          >
                            {LOST_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="lost-clear"
                            title="Quitar venta perdida"
                            onClick={() => updateDraft(line.id, { lostReason: "" })}
                          >×</button>
                        </div>
                      ) : (
                        <div className="status-edit-cell">
                          <div className="fr-inline" style={{ minWidth: 0 }}>
                            <div className="fr-bar" style={{ flex: 1 }}>
                              <div className={`fr-fill ${fr >= 0.99 ? "ok" : fr >= 0.6 ? "warn" : fr > 0 ? "danger" : ""}`} style={{ width: `${Math.min(100, fr * 100)}%` }} />
                            </div>
                            <span className={`fr-pct ${fr >= 0.99 ? "ok" : fr >= 0.6 ? "warn" : fr > 0 ? "danger" : ""}`}>
                              {Math.round(fr * 100)}%
                            </span>
                          </div>
                          <button
                            type="button"
                            className="lost-mark"
                            title="Marcar como venta perdida"
                            onClick={() => updateDraft(line.id, { lostReason: "sin_stock", boxes: "", invoice: "" })}
                          >⊘</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer fijo con cambios sin guardar */}
        {dirtyLineIds.length > 0 && (
          <div className="save-bar">
            <span className="save-bar-msg">
              <b>{dirtyLineIds.length}</b> línea(s) con cambios sin guardar
            </span>
            <button type="button" className="btn-sm btn-link" onClick={discardChanges} disabled={pending}>
              Descartar
            </button>
            <button type="button" className="btn-sm btn-primary-sm" onClick={handleSave} disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        )}
        {savedMsg && (
          <div className={`save-toast ${savedMsg.startsWith("Error") ? "is-error" : "is-ok"}`}>
            {savedMsg}
          </div>
        )}
      </div>

      {/* === SIDEBAR: conciliación === */}
      <aside className="oc-editor-sidebar">
        <div className="sidebar-card">
          <div className="sidebar-eyebrow">Proyección con cambios</div>
          <div className="sidebar-fillrate">
            <span className="sidebar-fillrate-key">Fill rate</span>
            <span className={`sidebar-fillrate-val ${cumplimTone}`}>{projected.cumplim}%</span>
          </div>
          <div className="sidebar-fillrate-bar">
            <div className={`fr-fill ${cumplimTone}`} style={{ width: `${Math.min(100, projected.cumplim)}%` }} />
          </div>
          <div className="sidebar-lines">
            <div className="sline"><span>Total OC</span><span className="mono">{fmtClp(oc.total_amount)}</span></div>
            <div className="sline"><span>Facturado proy.</span><span className="mono ok">{fmtClp(projected.facturado)}</span></div>
            <div className="sline"><span>Pendiente</span><span className="mono warn">{fmtClp(projected.pendiente)}</span></div>
            <div className="sline"><span>Venta perdida</span><span className="mono danger">{fmtClp(projected.lostAmount)}</span></div>
            <div className="sline"><span>Cajas</span><span className="mono">{projected.cajasFacturadas} / {totalCajas}</span></div>
          </div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-head">
            <span className="sidebar-eyebrow">Facturas asignadas</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{oc.invoices.length}</span>
          </div>
          {oc.invoices.length === 0 ? (
            <p className="sidebar-empty">Sin facturas asignadas todavía. Editá la columna “N° factura” en la tabla o usá la barra masiva.</p>
          ) : (
            <ul className="invoice-list">
              {oc.invoices.map((inv) => (
                <li key={inv.id} className="invoice-item">
                  <div className="invoice-num mono">{inv.invoice_number}</div>
                  <div className="invoice-meta">
                    <span>{inv.invoice_date ?? "sin fecha"}</span>
                    <span>·</span>
                    <span>{inv.line_count} línea{inv.line_count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="invoice-amount mono">{fmtClpCompact(inv.total_amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-card sidebar-help">
          <div className="sidebar-eyebrow">Atajos</div>
          <ul className="sidebar-help-list">
            <li><kbd>Tab</kbd> avanza al siguiente campo</li>
            <li>Mismo N° factura en varias líneas → seleccioná y usá <b>Aplicar factura</b></li>
            <li>Pegá las cajas exactas o usá <b>Marcar 100%</b></li>
            <li>Razones de venta perdida: <i>sin_stock</i>, <i>no_entro_cd</i>, <i>fuera_plazo</i>, <i>error_mapeo</i>, <i>otro</i></li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
