"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { OcDetail, OcDetailLine } from "../../_lib/queries";
import { saveOcLineUpdates, createSupermarketNv, type LineUpdate, type SupermarketNvInput } from "./actions";
import {
  chainSendsGross,
  computeLine,
  DEFAULT_LOGISTICS_PER_UNIT,
  DEFAULT_ILA_RATE,
  DEFAULT_IVA_RATE,
} from "./compute-invoice";

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


export interface InvoicePreview {
  invoiceNumber: string;
  invoiceDate: string;
  lines: Array<{
    lineId: string;
    productName: string;
    sku: string | null;
    boxes: number;
    unitsPerPack: number;
    unitPrice: number;        // neto por caja (desbrutado si era Walmart)
    netProduct: number;
    logisticsCostPerUnit: number;
    logisticsTotal: number;
    ila: number;
    iva: number;
  }>;
  totalNetProduct: number;
  totalLogistics: number;
  totalIla: number;
  totalIva: number;
  grandTotal: number;
}

export function OcLinesEditor({ oc, logisticsCosts = {} }: { oc: OcDetail; logisticsCosts?: Record<string, number> }) {
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
  const [previewData, setPreviewData] = useState<InvoicePreview[] | null>(null);

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
          boxes: String(line.quantity_boxes),
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

  /* ============ BUILD UPDATES ============ */
  const buildUpdates = useCallback((): LineUpdate[] => {
    return dirtyLineIds.map((id) => {
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
  }, [dirtyLineIds, drafts]);

  /* ============ PREVIEW ============ */
  const handleSave = () => {
    const updates = buildUpdates();
    if (updates.length === 0) return;

    const invoiceGroups = new Map<string, { date: string; lineIds: string[] }>();
    let hasOnlyLost = true;

    for (const u of updates) {
      if (u.invoiceNumber && (u.boxesInvoiced ?? 0) > 0) {
        hasOnlyLost = false;
        const key = u.invoiceNumber;
        const group = invoiceGroups.get(key) ?? { date: u.invoiceDate ?? "", lineIds: [] };
        if (u.invoiceDate && !group.date) group.date = u.invoiceDate;
        group.lineIds.push(u.lineId);
        invoiceGroups.set(key, group);
      }
    }

    if (hasOnlyLost) {
      doSave(updates);
      return;
    }

    const isGrossSource = chainSendsGross(oc.chain?.name);

    const previews: InvoicePreview[] = [];
    for (const [invoiceNumber, group] of invoiceGroups) {
      const lines = group.lineIds.map((lid) => {
        const line = oc.items.find((l) => l.id === lid)!;
        const d = drafts[lid];
        const boxes = parseInt(d.boxes || "0", 10) || 0;
        const unitsPerPack = line.units_per_pack ?? 1;
        const brandId = line.product?.brand_id ?? null;
        const logCost = brandId && logisticsCosts[brandId] != null
          ? logisticsCosts[brandId]
          : DEFAULT_LOGISTICS_PER_UNIT;
        const ilaRate = Number(line.product?.ila_rate ?? DEFAULT_ILA_RATE);
        const ivaRate = Number(line.product?.iva_rate ?? DEFAULT_IVA_RATE);

        const computed = computeLine({
          boxes,
          unitsPerPack,
          ocUnitPrice: line.unit_price,
          logisticsCostPerUnit: logCost,
          ilaRate,
          ivaRate,
          isGrossSource,
        });

        return {
          lineId: lid,
          productName: line.product?.name ?? line.product_name_oc ?? "—",
          sku: line.product?.sku ?? null,
          boxes,
          unitsPerPack,
          unitPrice: computed.unitPriceNet,
          netProduct: computed.netProduct,
          logisticsCostPerUnit: logCost,
          logisticsTotal: computed.logisticsTotal,
          ila: computed.ila,
          iva: computed.iva,
        };
      });

      // Sumar ILA por línea (porque varía por SKU); IVA también por línea por consistencia.
      const totalNetProduct = lines.reduce((s, l) => s + l.netProduct, 0);
      const totalLogistics = lines.reduce((s, l) => s + l.logisticsTotal, 0);
      const totalIla = lines.reduce((s, l) => s + l.ila, 0);
      const totalIva = lines.reduce((s, l) => s + l.iva, 0);
      const grandTotal = totalNetProduct + totalLogistics + totalIla + totalIva;

      previews.push({
        invoiceNumber,
        invoiceDate: group.date,
        lines,
        totalNetProduct,
        totalLogistics,
        totalIla,
        totalIva,
        grandTotal,
      });
    }

    setPreviewData(previews);
  };

  /* ============ CONFIRM SAVE ============ */
  const doSave = useCallback((updates: LineUpdate[], previews?: InvoicePreview[] | null) => {
    setSavedMsg(null);
    setPreviewData(null);
    startTransition(async () => {
      const result = await saveOcLineUpdates(oc.id, updates);
      if (!result.ok) {
        setSavedMsg(`Error: ${result.errors.join(" · ")}`);
        return;
      }

      // Create NVs for each invoice group (only new invoices with mapped products)
      const nvResults: string[] = [];
      if (previews && oc.chain) {
        for (const inv of previews) {
          const mappedLines = inv.lines.filter((l) => {
            const ocLine = oc.items.find((it) => it.id === l.lineId);
            return ocLine?.product?.id;
          });
          if (mappedLines.length === 0) continue;

          const nvInput: SupermarketNvInput = {
            ocId: oc.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            chainId: oc.chain.id,
            lines: mappedLines.map((l) => {
              const ocLine = oc.items.find((it) => it.id === l.lineId)!;
              return {
                productId: ocLine.product!.id,
                productSku: ocLine.product!.sku,
                productName: ocLine.product!.name,
                brandName: null,
                categoryName: null,
                boxes: l.boxes,
                unitsPerBox: l.unitsPerPack,
                unitPrice: l.unitPrice,
                netProduct: l.netProduct,
                logisticsCostPerUnit: l.logisticsCostPerUnit,
                logisticsTotal: l.logisticsTotal,
              };
            }),
            totalNetProduct: inv.totalNetProduct,
            totalLogistics: inv.totalLogistics,
            totalIla: inv.totalIla,
            totalIva: inv.totalIva,
            grandTotal: inv.grandTotal,
          };

          const nvResult = await createSupermarketNv(nvInput);
          if (nvResult.ok && nvResult.nvNumber) {
            nvResults.push(nvResult.nvNumber);
          } else if (nvResult.error) {
            nvResults.push(`Error NV: ${nvResult.error}`);
          }
        }
      }

      const nvMsg = nvResults.length > 0 ? ` · NV: ${nvResults.join(", ")}` : "";
      setSavedMsg(`Guardado: ${result.updatedLines} líneas · ${result.invoicesAffected} factura(s)${nvMsg}`);
      setSelected(new Set());
      setBulkInvoice("");
      setBulkDate("");
      router.refresh();
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of dirtyLineIds) next[id] = { ...next[id], dirty: false };
        return next;
      });
    });
  }, [oc.id, oc.chain, oc.items, dirtyLineIds, router]);

  const handleConfirmSave = () => doSave(buildUpdates(), previewData);

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
        const amount = boxes * line.unit_price;
        facturado += amount;
        cajasFacturadas += boxes;
      }
      if (d.lostReason) {
        lostAmount += Math.max(0, line.line_amount - (boxes * line.unit_price));
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
                    <td className="num mono" data-label="Cj OC">{line.quantity_boxes}</td>
                    <td className="num mono" data-label="Precio">{fmtClp(line.unit_price)}</td>
                    <td className="num" data-label="Cj fact.">
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
                    <td data-label="N° factura">
                      <input
                        type="text"
                        className={`cell-input cell-input-text ${isAssigned ? "is-assigned" : ""} ${isLost ? "is-disabled" : ""}`}
                        value={d.invoice}
                        onChange={(e) => updateDraft(line.id, { invoice: e.target.value, lostReason: "" })}
                        disabled={isLost}
                        placeholder="F-…"
                      />
                    </td>
                    <td data-label="Fecha">
                      <input
                        type="date"
                        className={`cell-input cell-input-date ${isLost ? "is-disabled" : ""}`}
                        value={d.date}
                        onChange={(e) => updateDraft(line.id, { date: e.target.value })}
                        disabled={isLost}
                      />
                    </td>
                    <td data-label="Estado">
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

      {/* === PREVIEW MODAL === */}
      {previewData && (
        <div className="invoice-preview-backdrop" onClick={() => setPreviewData(null)}>
          <div className="invoice-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="invoice-preview-header">
              <div className="preview-header-left">
                <div className="preview-doc-badge">NV</div>
                <div>
                  <h2>Previsualización Nota de Venta</h2>
                  <p className="preview-subtitle">
                    {oc.chain?.name ?? "Supermercado"} · OC <span className="mono">{oc.order_number}</span>
                  </p>
                </div>
              </div>
              <button type="button" className="modal-close" onClick={() => setPreviewData(null)}>×</button>
            </div>

            <div className="preview-context-strip">
              <div className="preview-ctx-cell">
                <span className="preview-ctx-key">Cadena</span>
                <span className="preview-ctx-val">{oc.chain?.name ?? "—"}</span>
              </div>
              <div className="preview-ctx-cell">
                <span className="preview-ctx-key">Orden de Compra</span>
                <span className="preview-ctx-val mono">{oc.order_number}</span>
              </div>
              <div className="preview-ctx-cell">
                <span className="preview-ctx-key">NV a generar</span>
                <span className="preview-ctx-val mono">SM-XXXXXX</span>
              </div>
              <div className="preview-ctx-cell">
                <span className="preview-ctx-key">Facturas</span>
                <span className="preview-ctx-val">{previewData.length}</span>
              </div>
            </div>

            <div className="invoice-preview-body">
              {previewData.map((inv, idx) => (
                <div key={inv.invoiceNumber} className="invoice-preview-block">
                  <div className="invoice-preview-title">
                    <div className="preview-inv-badge">{idx + 1}</div>
                    <div>
                      <span className="preview-inv-label">Factura</span>
                      <span className="mono" style={{ fontWeight: 600, fontSize: 15 }}>{inv.invoiceNumber}</span>
                    </div>
                    {inv.invoiceDate && <span className="preview-inv-date">{inv.invoiceDate}</span>}
                  </div>

                  <table className="invoice-preview-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="num">Cajas</th>
                        <th className="num">Uds</th>
                        <th className="num">Neto prod.</th>
                        <th className="num">Log. /ud</th>
                        <th className="num">Logística</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.lines.map((l) => (
                        <tr key={l.lineId}>
                          <td>
                            <span>{l.productName}</span>
                            {l.sku && <span className="pill" style={{ marginLeft: 6, fontSize: 10 }}>{l.sku}</span>}
                          </td>
                          <td className="num mono">{l.boxes}</td>
                          <td className="num mono">{l.boxes * l.unitsPerPack}</td>
                          <td className="num mono">{fmtClp(l.netProduct)}</td>
                          <td className="num mono" style={{ color: "var(--text-3)" }}>{fmtClp(l.logisticsCostPerUnit)}</td>
                          <td className="num mono">{fmtClp(l.logisticsTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="invoice-preview-totals">
                    <div className="preview-total-row">
                      <span>Neto productos</span>
                      <span className="mono">{fmtClp(inv.totalNetProduct)}</span>
                    </div>
                    <div className="preview-total-row">
                      <span>Logística</span>
                      <span className="mono">{fmtClp(inv.totalLogistics)}</span>
                    </div>
                    <div className="preview-total-row sub">
                      <span>ILA 20,5% <span className="tax-note">(s/neto prod.)</span></span>
                      <span className="mono">{fmtClp(inv.totalIla)}</span>
                    </div>
                    <div className="preview-total-row sub">
                      <span>IVA 19% <span className="tax-note">(s/neto + logística)</span></span>
                      <span className="mono">{fmtClp(inv.totalIva)}</span>
                    </div>
                    <div className="preview-total-row preview-grand-total">
                      <span>Total factura</span>
                      <span className="mono">{fmtClp(inv.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="preview-summary-strip">
              <div className="preview-summary-cell">
                <span className="preview-summary-key">Total neto</span>
                <span className="preview-summary-val mono">{fmtClp(previewData.reduce((s, i) => s + i.totalNetProduct, 0))}</span>
              </div>
              <div className="preview-summary-cell">
                <span className="preview-summary-key">Logística</span>
                <span className="preview-summary-val mono">{fmtClp(previewData.reduce((s, i) => s + i.totalLogistics, 0))}</span>
              </div>
              <div className="preview-summary-cell">
                <span className="preview-summary-key">Impuestos</span>
                <span className="preview-summary-val mono">{fmtClp(previewData.reduce((s, i) => s + i.totalIla + i.totalIva, 0))}</span>
              </div>
              <div className="preview-summary-cell highlight">
                <span className="preview-summary-key">Gran total</span>
                <span className="preview-summary-val mono">{fmtClp(previewData.reduce((s, i) => s + i.grandTotal, 0))}</span>
              </div>
            </div>

            <div className="invoice-preview-footer">
              <div className="preview-footer-note">
                Al confirmar se registrará una Nota de Venta (SM-) en el maestro y se asignarán las facturas a esta OC.
              </div>
              <div className="preview-footer-actions">
                <button type="button" className="btn-sm btn-ghost-sm" onClick={() => setPreviewData(null)} disabled={pending}>
                  Volver a editar
                </button>
                <button type="button" className="btn-sm btn-primary-sm" onClick={handleConfirmSave} disabled={pending}>
                  {pending ? "Guardando…" : "Confirmar y crear NV"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
