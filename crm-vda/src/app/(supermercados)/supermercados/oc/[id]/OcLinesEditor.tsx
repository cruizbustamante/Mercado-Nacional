"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { OcDetail, OcDetailLine } from "../../_lib/queries";
import { setLostSaleReasons, createSupermarketNv, type SupermarketNvInput } from "./actions";
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

const NV_STATUS_LABEL: Record<string, string> = {
  APROBADO: "Pendiente facturación",
  FACTURADO: "Facturada",
  DESPACHADO: "Despachada",
  PENDIENTE: "Pendiente V°B°",
  RECHAZADO: "Rechazada",
};
const NV_STATUS_TONE: Record<string, string> = {
  APROBADO: "warn",
  FACTURADO: "ok",
  DESPACHADO: "ok",
  PENDIENTE: "muted",
  RECHAZADO: "danger",
};

interface DraftLine {
  boxes: string;       // cajas a facturar AHORA (selección para generar NV)
  lostReason: string;  // "" = no marcada
  lostDirty: boolean;  // cambió la marca de venta perdida (requiere guardar)
}

/** Cajas disponibles para facturar ahora = pedidas − ya facturadas − en NV pendiente. */
function remainingBoxes(line: OcDetailLine): number {
  return Math.max(0, line.quantity_boxes - line.invoicedBoxes - line.pendingNvBoxes);
}

function lineToDraft(line: OcDetailLine): DraftLine {
  return { boxes: "", lostReason: line.lost_sale_reason ?? "", lostDirty: false };
}

export interface InvoicePreview {
  lines: Array<{
    lineId: string;
    productName: string;
    sku: string | null;
    boxes: number;
    unitsPerPack: number;
    unitPrice: number;          // neto por caja
    unitPricePerUnit: number;   // neto por unidad de venta
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
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<InvoicePreview | null>(null);

  const lostDirtyIds = useMemo(
    () => Object.entries(drafts).filter(([, d]) => d.lostDirty).map(([id]) => id),
    [drafts]
  );

  const updateBoxes = useCallback((lineId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...prev[lineId], boxes: value, lostReason: "" } }));
  }, []);
  const updateLost = useCallback((lineId: string, reason: string) => {
    setDrafts((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], lostReason: reason, lostDirty: true, boxes: reason ? "" : prev[lineId].boxes },
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
  const applyFullFill = () => {
    if (selected.size === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        const line = oc.items.find((l) => l.id === id);
        if (!line) continue;
        const rem = remainingBoxes(line);
        next[id] = { ...next[id], boxes: rem > 0 ? String(rem) : "", lostReason: "" };
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
      for (const id of selected) next[id] = { ...next[id], lostReason: reason, lostDirty: true, boxes: "" };
      return next;
    });
  };

  /* ============ GENERAR NV (preview) ============ */
  const handleGenerate = () => {
    const isGrossSource = chainSendsGross(oc.chain?.name);
    const lines: InvoicePreview["lines"] = [];

    for (const line of oc.items) {
      const d = drafts[line.id];
      const boxes = parseInt(d.boxes || "0", 10) || 0;
      if (boxes <= 0) continue;
      if (!line.product?.id) continue; // sin SKU mapeado → no se puede facturar

      const unitsPerPack = line.units_per_pack ?? 1;
      const brandId = line.product?.brand_id ?? null;
      const logCost = brandId && logisticsCosts[brandId] != null ? logisticsCosts[brandId] : DEFAULT_LOGISTICS_PER_UNIT;
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

      lines.push({
        lineId: line.id,
        productName: line.product?.name ?? line.product_name_oc ?? "—",
        sku: line.product?.sku ?? null,
        boxes,
        unitsPerPack,
        unitPrice: computed.unitPriceNet,
        unitPricePerUnit: computed.unitPriceNetPerUnit,
        netProduct: computed.netProduct,
        logisticsCostPerUnit: logCost,
        logisticsTotal: computed.logisticsTotal,
        ila: computed.ila,
        iva: computed.iva,
      });
    }

    if (lines.length === 0) {
      setSavedMsg("Error: marca las cajas a facturar en al menos una línea con SKU mapeado");
      return;
    }

    const totalNetProduct = lines.reduce((s, l) => s + l.netProduct, 0);
    const totalLogistics = lines.reduce((s, l) => s + l.logisticsTotal, 0);
    const totalIla = lines.reduce((s, l) => s + l.ila, 0);
    const totalIva = lines.reduce((s, l) => s + l.iva, 0);
    setPreviewData({
      lines,
      totalNetProduct,
      totalLogistics,
      totalIla,
      totalIva,
      grandTotal: totalNetProduct + totalLogistics + totalIla + totalIva,
    });
  };

  const handleConfirmGenerate = () => {
    if (!previewData || !oc.chain) return;
    setSavedMsg(null);
    const preview = previewData;
    setPreviewData(null);
    startTransition(async () => {
      const nvInput: SupermarketNvInput = {
        ocId: oc.id,
        invoiceDate: new Date().toISOString().split("T")[0],
        chainId: oc.chain!.id,
        lines: preview.lines.map((l) => ({
          ocLineId: l.lineId,
          productId: oc.items.find((it) => it.id === l.lineId)!.product!.id,
          productSku: l.sku ?? "",
          productName: l.productName,
          brandName: null,
          categoryName: null,
          boxes: l.boxes,
          unitsPerBox: l.unitsPerPack,
          // NETO por UNIDAD (botella): así price_net_base × cantidad_unidades = neto
          // de la línea y la factura SII cuadra (ej. 1.514 × 48 = 72.672).
          unitPrice: l.unitPricePerUnit,
          netProduct: l.netProduct,
          logisticsCostPerUnit: l.logisticsCostPerUnit,
          logisticsTotal: l.logisticsTotal,
        })),
        totalNetProduct: preview.totalNetProduct,
        totalLogistics: preview.totalLogistics,
        totalIla: preview.totalIla,
        totalIva: preview.totalIva,
        grandTotal: preview.grandTotal,
      };

      const res = await createSupermarketNv(nvInput);
      if (res.ok && res.nvNumber) {
        setSavedMsg(`NV ${res.nvNumber} generada (pendiente de facturación). Factúrala en el módulo Facturación.`);
        setSelected(new Set());
        router.refresh();
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(next)) next[id] = { ...next[id], boxes: "" };
          return next;
        });
      } else {
        setSavedMsg(`Error: ${res.error ?? "no se pudo generar la NV"}`);
      }
    });
  };

  /* ============ GUARDAR VENTA PERDIDA ============ */
  const saveLostSale = () => {
    if (lostDirtyIds.length === 0) return;
    setSavedMsg(null);
    startTransition(async () => {
      const res = await setLostSaleReasons(
        oc.id,
        lostDirtyIds.map((id) => ({ lineId: id, reason: drafts[id].lostReason || null }))
      );
      if (res.ok) {
        setSavedMsg(`Guardado: ${res.updated} línea(s) de venta perdida`);
        router.refresh();
        setDrafts((prev) => {
          const next = { ...prev };
          for (const id of lostDirtyIds) next[id] = { ...next[id], lostDirty: false };
          return next;
        });
      } else {
        setSavedMsg(`Error: ${res.error ?? "no se pudo guardar"}`);
      }
    });
  };

  const discardLost = () => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const l of oc.items) {
        next[l.id] = { ...next[l.id], lostReason: l.lost_sale_reason ?? "", lostDirty: false };
      }
      return next;
    });
    setSavedMsg(null);
  };

  /* ============ PROYECCIÓN ============ */
  const projected = useMemo(() => {
    let facturadoReal = 0, enNvPendiente = 0, aGenerar = 0, lostAmount = 0;
    let cajasAGenerar = 0;
    for (const line of oc.items) {
      facturadoReal += line.invoicedAmount;
      enNvPendiente += line.pendingNvBoxes * line.unit_price;
      const d = drafts[line.id];
      const boxes = parseInt(d.boxes || "0", 10) || 0;
      if (boxes > 0) { aGenerar += boxes * line.unit_price; cajasAGenerar += boxes; }
      if (d.lostReason) {
        lostAmount += Math.max(0, line.line_amount - line.invoicedAmount - line.pendingNvBoxes * line.unit_price);
      }
    }
    const cumplim = oc.total_amount > 0 ? Math.round((facturadoReal / oc.total_amount) * 100) : 0;
    const porCubrir = Math.max(0, oc.total_amount - facturadoReal - enNvPendiente - aGenerar - lostAmount);
    return { facturadoReal, enNvPendiente, aGenerar, cajasAGenerar, lostAmount, cumplim, porCubrir };
  }, [drafts, oc.items, oc.total_amount]);

  const totalCajas = oc.items.reduce((s, it) => s + it.quantity_boxes, 0);
  const cumplimTone = projected.cumplim >= 80 ? "ok" : projected.cumplim >= 50 ? "warn" : "danger";
  const hasBoxesToGenerate = oc.items.some((l) => (parseInt(drafts[l.id]?.boxes || "0", 10) || 0) > 0);

  return (
    <div className="oc-editor-shell">
      {/* === MAIN COLUMN === */}
      <div className="oc-editor-main">
        {/* Bulk bar */}
        <div className={`bulk-bar ${selected.size > 0 ? "is-active" : ""}`}>
          <div className="bulk-info">
            {selected.size > 0
              ? <><b>{selected.size}</b> de {oc.items.length} línea(s) seleccionadas</>
              : <>Marca las cajas a facturar y genera la NV · o selecciona líneas para acciones masivas</>}
          </div>
          <button type="button" className="btn-sm btn-ghost-sm" onClick={applyFullFill} disabled={selected.size === 0}>
            Facturar 100% restante
          </button>
          <button type="button" className="btn-sm btn-danger-sm" onClick={applyLostBulk} disabled={selected.size === 0}>
            Venta perdida
          </button>
          {selected.size > 0 && (
            <button type="button" className="btn-sm btn-link" onClick={clearSelection}>Limpiar</button>
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
                <th className="num" style={{ width: 70 }}>Fact.</th>
                <th className="num" style={{ width: 80 }}>En NV</th>
                <th className="num" style={{ width: 90 }}>Cj a facturar</th>
                <th style={{ width: 150 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {oc.items.map((line) => {
                const d = drafts[line.id];
                const rem = remainingBoxes(line);
                const boxes = parseInt(d.boxes || "0", 10) || 0;
                const isLost = !!d.lostReason;
                const fullyCovered = rem === 0 && line.quantity_boxes > 0;

                const rowClass = isLost ? "row-lost"
                  : line.invoicedBoxes >= line.quantity_boxes && line.quantity_boxes > 0 ? "row-ok"
                  : (line.invoicedBoxes > 0 || line.pendingNvBoxes > 0) ? "row-partial"
                  : !line.product ? "row-orphan"
                  : "";

                return (
                  <tr key={line.id} className={rowClass}>
                    <td>
                      <input type="checkbox" className="cb" checked={selected.has(line.id)} onChange={() => toggleSelect(line.id)} />
                    </td>
                    <td className="mono" style={{ color: "var(--text-3)" }}>{String(line.line_number).padStart(2, "0")}</td>
                    <td>
                      <div className="prod-name">{line.product?.name ?? line.product_name_oc ?? "—"}</div>
                      <div className="line-extra">
                        {line.upc_code && <span className="mono">{line.upc_code}</span>}
                        {line.product
                          ? <span className="pill">{line.product.sku}</span>
                          : <span className="badge badge-warn" style={{ fontSize: 10 }}>sin mapear</span>}
                        {line.invoiceNumbers.length > 0 && (
                          <span className="pill" title="Folios" style={{ fontSize: 10 }}>F: {line.invoiceNumbers.join(", ")}</span>
                        )}
                      </div>
                    </td>
                    <td className="num mono" data-label="Cj OC">{line.quantity_boxes}</td>
                    <td className="num mono" data-label="Precio">{fmtClp(line.unit_price)}</td>
                    <td className="num mono" data-label="Fact." style={{ color: line.invoicedBoxes > 0 ? "var(--success)" : "var(--text-3)" }}>
                      {line.invoicedBoxes || "—"}
                    </td>
                    <td className="num mono" data-label="En NV" style={{ color: line.pendingNvBoxes > 0 ? "var(--warning)" : "var(--text-3)" }}>
                      {line.pendingNvBoxes
                        ? <span title={line.pendingNvNumbers.join(", ")}>{line.pendingNvBoxes}</span>
                        : "—"}
                    </td>
                    <td className="num" data-label="Cj a facturar">
                      <input
                        type="text"
                        inputMode="numeric"
                        className={`cell-input cell-input-num ${isLost ? "is-disabled" : ""}`}
                        value={d.boxes}
                        onChange={(e) => {
                          const raw = parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0;
                          updateBoxes(line.id, raw > 0 ? String(Math.min(raw, rem)) : "");
                        }}
                        disabled={isLost || !line.product || rem === 0}
                        placeholder={fullyCovered ? "✓" : `≤${rem}`}
                        title={`Disponible para facturar: ${rem} cajas`}
                      />
                    </td>
                    <td data-label="Estado">
                      {isLost ? (
                        <div className="status-edit-cell">
                          <select className="lost-select" value={d.lostReason} onChange={(e) => updateLost(line.id, e.target.value)}>
                            {LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <button type="button" className="lost-clear" title="Quitar venta perdida" onClick={() => updateLost(line.id, "")}>×</button>
                        </div>
                      ) : (
                        <div className="status-edit-cell">
                          <span className={`status-tag ${
                            line.invoicedBoxes >= line.quantity_boxes && line.quantity_boxes > 0 ? "ok"
                            : line.invoicedBoxes > 0 ? "warn"
                            : line.pendingNvBoxes > 0 ? "warn"
                            : boxes > 0 ? "info" : "muted"
                          }`} style={{ fontSize: 10 }}>
                            {line.invoicedBoxes >= line.quantity_boxes && line.quantity_boxes > 0 ? "Facturada"
                              : line.invoicedBoxes > 0 ? "Parcial"
                              : line.pendingNvBoxes > 0 ? "En NV"
                              : boxes > 0 ? "A facturar"
                              : "Por facturar"}
                          </span>
                          <button
                            type="button"
                            className="lost-mark"
                            title="Marcar como venta perdida"
                            onClick={() => updateLost(line.id, "sin_stock")}
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

        {/* Acción principal: generar NV */}
        <div className="save-bar" style={{ justifyContent: "space-between" }}>
          <span className="save-bar-msg">
            {projected.cajasAGenerar > 0
              ? <><b>{projected.cajasAGenerar}</b> caja(s) · {fmtClp(projected.aGenerar)} a facturar en una nueva NV</>
              : <>Marca las cajas a facturar para generar la NV</>}
          </span>
          <button type="button" className="btn-sm btn-primary-sm" onClick={handleGenerate} disabled={pending || !hasBoxesToGenerate}>
            {pending ? "Procesando…" : "Generar NV para facturar"}
          </button>
        </div>

        {/* Save bar venta perdida (solo si hay cambios) */}
        {lostDirtyIds.length > 0 && (
          <div className="save-bar">
            <span className="save-bar-msg"><b>{lostDirtyIds.length}</b> cambio(s) de venta perdida sin guardar</span>
            <button type="button" className="btn-sm btn-link" onClick={discardLost} disabled={pending}>Descartar</button>
            <button type="button" className="btn-sm btn-danger-sm" onClick={saveLostSale} disabled={pending}>
              {pending ? "Guardando…" : "Guardar venta perdida"}
            </button>
          </div>
        )}

        {savedMsg && (
          <div className={`save-toast ${savedMsg.startsWith("Error") ? "is-error" : "is-ok"}`}>{savedMsg}</div>
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
                  <h2>Nueva Nota de Venta</h2>
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
                <span className="preview-ctx-key">Estado inicial</span>
                <span className="preview-ctx-val">Aprobada · por facturar</span>
              </div>
            </div>

            <div className="invoice-preview-body">
              <div className="invoice-preview-block">
                <table className="invoice-preview-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="num">Cajas</th>
                      <th className="num">Uds</th>
                      <th className="num">P. unit neto</th>
                      <th className="num">Neto prod.</th>
                      <th className="num">Log. /ud</th>
                      <th className="num">Logística</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.lines.map((l) => (
                      <tr key={l.lineId}>
                        <td>
                          <span>{l.productName}</span>
                          {l.sku && <span className="pill" style={{ marginLeft: 6, fontSize: 10 }}>{l.sku}</span>}
                        </td>
                        <td className="num mono">{l.boxes}</td>
                        <td className="num mono">{l.boxes * l.unitsPerPack}</td>
                        <td className="num mono">{fmtClp(l.unitPricePerUnit)}</td>
                        <td className="num mono">{fmtClp(l.netProduct)}</td>
                        <td className="num mono" style={{ color: "var(--text-3)" }}>{fmtClp(l.logisticsCostPerUnit)}</td>
                        <td className="num mono">{fmtClp(l.logisticsTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="invoice-preview-totals">
                  <div className="preview-total-row"><span>Neto productos</span><span className="mono">{fmtClp(previewData.totalNetProduct)}</span></div>
                  <div className="preview-total-row"><span>Logística</span><span className="mono">{fmtClp(previewData.totalLogistics)}</span></div>
                  <div className="preview-total-row sub"><span>ILA 20,5% <span className="tax-note">(s/neto prod.)</span></span><span className="mono">{fmtClp(previewData.totalIla)}</span></div>
                  <div className="preview-total-row sub"><span>IVA 19% <span className="tax-note">(s/neto + logística)</span></span><span className="mono">{fmtClp(previewData.totalIva)}</span></div>
                  <div className="preview-total-row preview-grand-total"><span>Total NV</span><span className="mono">{fmtClp(previewData.grandTotal)}</span></div>
                </div>
              </div>
            </div>

            <div className="invoice-preview-footer">
              <div className="preview-footer-note">
                Se generará una Nota de Venta (SM-) <b>Aprobada</b>, lista para facturar en el módulo Facturación.
                El folio y las cantidades volverán a esta OC al facturarla.
              </div>
              <div className="preview-footer-actions">
                <button type="button" className="btn-sm btn-ghost-sm" onClick={() => setPreviewData(null)} disabled={pending}>
                  Volver a editar
                </button>
                <button type="button" className="btn-sm btn-primary-sm" onClick={handleConfirmGenerate} disabled={pending}>
                  {pending ? "Generando…" : "Confirmar y generar NV"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === SIDEBAR === */}
      <aside className="oc-editor-sidebar">
        <div className="sidebar-card">
          <div className="sidebar-eyebrow">Cumplimiento</div>
          <div className="sidebar-fillrate">
            <span className="sidebar-fillrate-key">Fill rate</span>
            <span className={`sidebar-fillrate-val ${cumplimTone}`}>{projected.cumplim}%</span>
          </div>
          <div className="sidebar-fillrate-bar">
            <div className={`fr-fill ${cumplimTone}`} style={{ width: `${Math.min(100, projected.cumplim)}%` }} />
          </div>
          <div className="sidebar-lines">
            <div className="sline"><span>Total OC</span><span className="mono">{fmtClp(oc.total_amount)}</span></div>
            <div className="sline"><span>Facturado</span><span className="mono ok">{fmtClp(projected.facturadoReal)}</span></div>
            <div className="sline"><span>En NV pendiente</span><span className="mono warn">{fmtClp(projected.enNvPendiente)}</span></div>
            <div className="sline"><span>A generar ahora</span><span className="mono">{fmtClp(projected.aGenerar)}</span></div>
            <div className="sline"><span>Venta perdida</span><span className="mono danger">{fmtClp(projected.lostAmount)}</span></div>
            <div className="sline"><span>Por cubrir</span><span className="mono warn">{fmtClp(projected.porCubrir)}</span></div>
            <div className="sline"><span>Cajas a generar</span><span className="mono">{projected.cajasAGenerar} / {totalCajas}</span></div>
          </div>
        </div>

        <div className="sidebar-card">
          <div className="sidebar-card-head">
            <span className="sidebar-eyebrow">Notas de venta</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{oc.salesNotes.length}</span>
          </div>
          {oc.salesNotes.length === 0 ? (
            <p className="sidebar-empty">Sin NV generadas todavía. Marca las cajas a facturar y pulsa “Generar NV para facturar”.</p>
          ) : (
            <ul className="invoice-list">
              {oc.salesNotes.map((nv) => (
                <li key={nv.id} className="invoice-item">
                  <div className="invoice-num mono">{nv.nv_number}</div>
                  <div className="invoice-meta">
                    <span className={`status-tag ${NV_STATUS_TONE[nv.status] ?? "muted"}`} style={{ fontSize: 10 }}>
                      {NV_STATUS_LABEL[nv.status] ?? nv.status}
                    </span>
                    {nv.invoice_number && <><span>·</span><span className="mono">F {nv.invoice_number}</span></>}
                  </div>
                  <div className="invoice-amount mono">{fmtClpCompact(nv.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-card sidebar-help">
          <div className="sidebar-eyebrow">Cómo funciona</div>
          <ul className="sidebar-help-list">
            <li>Marca las <b>cajas a facturar</b> y pulsa <b>Generar NV</b></li>
            <li>La NV nace <b>Aprobada</b> y se factura en el módulo <b>Facturación</b></li>
            <li>El <b>folio</b> y las cajas vuelven solos al facturar (columnas Fact. / Estado)</li>
            <li>Puedes facturar la OC en <b>varias NV</b> (parciales)</li>
            <li>Razones de venta perdida: <i>sin_stock</i>, <i>no_entro_cd</i>, <i>fuera_plazo</i>, <i>error_mapeo</i>, <i>otro</i></li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
