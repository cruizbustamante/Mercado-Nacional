"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { formatRut } from "@/lib/rut";

export interface NvClient {
  id: string;
  rut_body: number;
  rut_dv: string;
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  credit_line_clp: number;
  insurer_credit_line_clp: number;
  payment_term: { id: string; name: string } | null;
}

export interface NvProduct {
  id: string;
  sku: string;
  name: string;
  units_per_box: number;
  base_price_net: number;
  base_price_gross: number;
  min_price_net: number;
  iva_rate: number;
  ila_rate: number;
  category: { name: string } | null;
  brand: { name: string } | null;
}

export interface NvWarehouse { id: string; code: string; name: string }
export interface NvPaymentTerm { id: string; name: string; days: number }

export interface NvConfig {
  logisticsNetPerUnit: number;
  logisticsIvaRate: number;
  vbToleranceClp: number;
}

interface NvLine {
  product?: NvProduct;
  search: string;
  cajas: string; // string para manejar input vacío
  precio_bruto: string; // string idem
}

const fmtN = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const fmtClp = (n: number) => `$${fmtN.format(n)}`;

interface LineCalc {
  unidades: number;
  precio_bruto: number;
  precio_neto: number;
  total_factor: number; // 1 + iva + ila
  neto_producto: number;
  iva_producto: number;
  ila_producto: number;
  log_neto: number;
  log_iva: number;
  total: number;
  requires_vb: boolean;
  descuento_pesos: number; // contra base_price_gross
}

function calcLine(l: NvLine, cfg: NvConfig): LineCalc | null {
  if (!l.product) return null;
  const cajas = parseInt(l.cajas || "0", 10) || 0;
  const precio_bruto = parseInt(l.precio_bruto || "0", 10) || 0;
  const upb = l.product.units_per_box;
  const unidades = cajas * upb;
  // Réplica EXACTA del cálculo del Apps Script (code.js _prepararDatosNV):
  // El precio bruto unitario incluye TODO: neto + logístico + IVA(neto+log) + ILA(neto)
  // bruto = neto·(1+iva+ila) + log·(1+iva)  →  neto = (bruto − log·(1+iva)) / (1+iva+ila)
  const factor = 1 + l.product.iva_rate + l.product.ila_rate;
  const log_unit_with_iva = cfg.logisticsNetPerUnit * (1 + cfg.logisticsIvaRate);
  const precio_neto = factor > 0
    ? Math.max(0, Math.round((precio_bruto - log_unit_with_iva) / factor))
    : 0;
  const neto_producto = unidades * precio_neto;
  const log_neto = Math.round(unidades * cfg.logisticsNetPerUnit);
  const log_iva = Math.round(log_neto * cfg.logisticsIvaRate);
  // IVA = 19% sobre (neto producto + logístico neto) — como el AS suma logIVA al iva del producto
  const iva_producto = Math.round((neto_producto + log_neto) * l.product.iva_rate);
  // ILA se aplica SOLO sobre el neto del producto (no sobre logístico)
  const ila_producto = Math.round(neto_producto * l.product.ila_rate);
  const total = neto_producto + log_neto + iva_producto + ila_producto;
  const requires_vb = precio_neto < (l.product.min_price_net - cfg.vbToleranceClp);
  const descuento_pesos = unidades * Math.max(0, l.product.base_price_gross - precio_bruto);
  return {
    unidades, precio_bruto, precio_neto, total_factor: factor,
    neto_producto, iva_producto, ila_producto,
    log_neto, log_iva, total, requires_vb, descuento_pesos,
  };
}

function newLine(): NvLine {
  return { search: "", cajas: "", precio_bruto: "" };
}

export function NvForm({
  emisor, today, clients, products, warehouses, paymentTerms, config,
}: {
  emisor: { id: string; full_name: string; short_name: string };
  today: string;
  clients: NvClient[];
  products: NvProduct[];
  warehouses: NvWarehouse[];
  paymentTerms: NvPaymentTerm[];
  config: NvConfig;
}) {
  const [clientId, setClientId] = useState<string>("");
  const client = useMemo(() => clients.find((c) => c.id === clientId), [clientId, clients]);
  const [paymentTermId, setPaymentTermId] = useState<string>(client?.payment_term?.id ?? "");
  const [warehouseId, setWarehouseId] = useState<string>(warehouses[0]?.id ?? "");
  const [deliveryAddr, setDeliveryAddr] = useState<string>(client?.address ?? "");
  const [observations, setObservations] = useState<string>("");
  const [lines, setLines] = useState<NvLine[]>([newLine()]);
  const [editingIdx, setEditingIdx] = useState<number | null>(0);

  // Auto-actualizar dirección al cambiar cliente
  useEffect(() => {
    if (client) setDeliveryAddr(client.address ?? "");
  }, [client]);

  function updateLine(idx: number, patch: Partial<NvLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function setProduct(idx: number, p: NvProduct) {
    updateLine(idx, {
      product: p,
      search: `${p.sku} · ${p.name}`,
      cajas: lines[idx].cajas || "1",
      precio_bruto: String(p.base_price_gross),
    });
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
    setEditingIdx(lines.length);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  const calculated = lines.map((l) => calcLine(l, config));

  const totals = useMemo(() => {
    let neto_productos = 0, iva = 0, ila = 0, log_neto = 0, log_iva = 0;
    let cajas = 0, unidades = 0, descuento = 0;
    let requires_vb = false;
    for (let i = 0; i < lines.length; i++) {
      const c = calculated[i];
      if (!c) continue;
      neto_productos += c.neto_producto;
      iva += c.iva_producto; // ya incluye IVA de (neto + logístico) según calcLine
      ila += c.ila_producto;
      log_neto += c.log_neto;
      log_iva += c.log_iva;
      cajas += parseInt(lines[i].cajas || "0", 10) || 0;
      unidades += c.unidades;
      descuento += c.descuento_pesos;
      if (c.requires_vb) requires_vb = true;
    }
    const total = neto_productos + log_neto + iva + ila;
    return { neto_productos, iva, ila, log_neto, log_iva, cajas, unidades, descuento, total, requires_vb };
  }, [calculated, lines]);

  const usedCredit = totals.total;
  const creditLine = client?.credit_line_clp ?? 0;
  const insurerLine = client?.insurer_credit_line_clp ?? 0;
  const effectiveLine = Math.max(creditLine, insurerLine);
  const creditPct = effectiveLine > 0 ? Math.min(100, Math.round((usedCredit / effectiveLine) * 100)) : 0;
  const available = Math.max(0, effectiveLine - usedCredit);

  const canEmit = !!client && lines.some((l) => l.product && (parseInt(l.cajas || "0", 10) || 0) > 0);

  return (
    <>
      <header className="app-header">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="brand-mark">MN</div>
          <span className="brand-name">Mercado Nacional</span>
          <span className="brand-sub">· Gestión Comercial</span>
        </Link>
        <div className="divider-v"></div>
        <nav className="crumbs">
          <Link href="/">Inicio</Link>
          <span className="sep">/</span>
          <Link href="/nota-venta">Notas de Venta</Link>
          <span className="sep">/</span>
          <span className="here">Nueva</span>
        </nav>
        <div className="header-spacer"></div>
        <div className="kbd-hint"><kbd>?</kbd> Atajos</div>
      </header>

      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Documento comercial</div>
            <div className="doc-title-row">
              <h1 className="doc-title">Nota de Venta</h1>
              <span className="badge badge-pending"><span className="dot"></span> Borrador</span>
            </div>
            <div className="doc-meta-row">
              <div className="doc-meta-item">
                <span className="doc-meta-key">Emitida por</span>
                <span className="doc-meta-val">{emisor.full_name}</span>
              </div>
              <div className="doc-meta-item">
                <span className="doc-meta-key">Fecha emisión</span>
                <span className="doc-meta-val mono">{today}</span>
              </div>
              <div className="doc-meta-item">
                <span className="doc-meta-key">Bodega origen</span>
                <span className="doc-meta-val">{warehouses.find((w) => w.id === warehouseId)?.name ?? "—"}</span>
              </div>
              <div className="doc-meta-item">
                <span className="doc-meta-key">Cliente</span>
                <span className="doc-meta-val">{client?.name ?? "—"}</span>
              </div>
            </div>
          </div>
          <div className="nv-stamp">
            <div className="doc-eyebrow">Folio</div>
            <div className="nv-number"><span className="pref">NV-</span>—</div>
          </div>
        </div>

        <div className="workflow">
          <div className="wf-step current"><div className="wf-dot">1</div><span className="wf-label">Creación</span></div>
          <div className="wf-step"><div className="wf-dot">2</div><span className="wf-label">V°B° {totals.requires_vb ? "Requerido" : "No requerido"}</span></div>
          <div className="wf-step"><div className="wf-dot">3</div><span className="wf-label">Emisión</span></div>
          <div className="wf-step"><div className="wf-dot">4</div><span className="wf-label">Despacho</span></div>
          <div className="wf-step"><div className="wf-dot">5</div><span className="wf-label">Facturación</span></div>
          <div className="wf-step"><div className="wf-dot">6</div><span className="wf-label">Cobranza</span></div>
        </div>
      </section>

      <div className="shell">
        <main className="main">

          {/* CLIENTE */}
          <section className="section">
            <div className="section-head">
              <h2 className="section-title"><span className="section-num">1</span>Cliente</h2>
            </div>

            <div className="client-split">
              <div className="client-form">
                <div className="grid-3">
                  <div className="field col-2">
                    <label className="field-label">Cliente <span className="req">*</span></label>
                    <ClientSearch
                      clients={clients}
                      selected={client ?? null}
                      onPick={(c) => {
                        setClientId(c.id);
                        if (c.payment_term?.id) setPaymentTermId(c.payment_term.id);
                      }}
                      onClear={() => { setClientId(""); setPaymentTermId(""); }}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">RUT</label>
                    <input className="field-input mono locked" value={client ? formatRut(client.rut_body, client.rut_dv) : ""} readOnly placeholder="—" />
                  </div>

                  <div className="field col-2">
                    <label className="field-label">Dirección de facturación</label>
                    <input className="field-input" value={client?.address ?? ""} readOnly />
                  </div>
                  <div className="field">
                    <label className="field-label">Comuna · Ciudad</label>
                    <input className="field-input" value={[client?.commune, client?.city].filter(Boolean).join(" · ")} readOnly />
                  </div>

                  <div className="field col-3">
                    <label className="field-label">Forma de pago <span className="req">*</span></label>
                    <select className="field-select" value={paymentTermId} onChange={(e) => setPaymentTermId(e.target.value)}>
                      <option value="">— Sin asignar —</option>
                      {paymentTerms.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="client-intel">
                <div className="intel-head">
                  <span className="intel-title">Inteligencia comercial</span>
                  <span className="intel-cat">Cliente</span>
                </div>
                <div className="intel-body">
                  <div className="intel-row">
                    <span className="key">Línea crédito interna</span>
                    <span className="val">{fmtClp(creditLine)}</span>
                  </div>
                  <div className="intel-row">
                    <span className="key">Línea crédito aseguradora</span>
                    <span className="val">{fmtClp(insurerLine)}</span>
                  </div>
                  <div className="intel-row">
                    <span className="key">Forma de pago</span>
                    <span className="val">{client?.payment_term?.name ?? "—"}</span>
                  </div>

                  {effectiveLine > 0 && (
                    <div className="credit-bar">
                      <div className="credit-bar-head">
                        <span className="key">Uso de crédito</span>
                        <span className="val">{fmtClp(usedCredit)} / {fmtClp(effectiveLine)}</span>
                      </div>
                      <div className="credit-track"><div className="credit-fill" style={{ width: `${creditPct}%` }}></div></div>
                      <div className="credit-bar-foot">
                        <span>Disponible: <strong style={{ color: "var(--success)" }}>{fmtClp(available)}</strong></span>
                        <span>{creditPct}% utilizado</span>
                      </div>
                    </div>
                  )}
                </div>

                {totals.requires_vb && (
                  <div className="intel-alerts">
                    <div className="intel-alert warn">
                      <span><strong>Requiere V°B° Financiero</strong> · al menos una línea está bajo el precio mínimo.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* DESPACHO */}
          <section className="section">
            <div className="section-head">
              <h2 className="section-title"><span className="section-num">2</span>Despacho</h2>
              <span className="section-hint">Origen, destino y ventana horaria</span>
            </div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">Despachar desde <span className="req">*</span></label>
                <select className="field-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="field col-2">
                <label className="field-label">Dirección de entrega</label>
                <input className="field-input" value={deliveryAddr} onChange={(e) => setDeliveryAddr(e.target.value)} />
              </div>

              <div className="field">
                <label className="field-label">
                  Vendedor <span className="req">*</span>
                  <span className="tag-auto">Auto</span>
                </label>
                <input className="field-input locked" value={emisor.short_name} readOnly />
              </div>

              <div className="field">
                <label className="field-label">Fecha despacho</label>
                <input className="field-input mono" type="date" defaultValue={today} />
              </div>

              <div className="field">
                <label className="field-label">Ventana horaria</label>
                <input className="field-input" placeholder="ej. 08:00 — 18:00" />
              </div>

              <div className="field col-3">
                <label className="field-label">Observaciones operativas</label>
                <textarea className="field-textarea" rows={2} placeholder="Restricciones de acceso, ventana descarga, instrucciones especiales…" value={observations} onChange={(e) => setObservations(e.target.value)} />
              </div>
            </div>
          </section>

          {/* PRODUCTOS */}
          <section className="section">
            <div className="section-head">
              <h2 className="section-title"><span className="section-num">3</span>Productos</h2>
              <span className="section-hint">Solo edita <b>cajas</b> y <b>precio bruto</b>. El neto, IVA, ILA y logístico se calculan.</span>
            </div>

            <div className="load-strip">
              <div className="load-cell"><span className="load-key">Cajas</span><span className="load-val">{totals.cajas} <span className="unit">cj</span></span></div>
              <div className="load-cell"><span className="load-key">Unidades</span><span className="load-val">{totals.unidades} <span className="unit">u</span></span></div>
              <div className="load-cell"><span className="load-key">Líneas</span><span className="load-val">{lines.filter((l) => l.product).length}</span></div>
              <div className="load-cell"><span className="load-key">V°B° Financiero</span><span className={`load-val ${totals.requires_vb ? "warn" : ""}`}>{totals.requires_vb ? "Requerido" : "No"}</span></div>
            </div>

            <div className="products-bar">
              <div className="products-bar-left">
                <span className="stat">Líneas <strong>{lines.length}</strong></span>
                <span className="muted">·</span>
                <span className="stat">SKU únicos <strong>{new Set(lines.map((l) => l.product?.sku).filter(Boolean)).size}</strong></span>
              </div>
              <div className="products-bar-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={addLine}>+ Agregar línea</button>
              </div>
            </div>

            <div className="products-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Producto</th>
                    <th className="num" style={{ width: 70 }}>Cj</th>
                    <th className="num" style={{ width: 50 }}>U/Cj</th>
                    <th className="num" style={{ width: 70 }}>U.</th>
                    <th className="num" style={{ width: 100 }}>P. Bruto</th>
                    <th className="num" style={{ width: 100 }}>P. Neto</th>
                    <th className="num" style={{ width: 100 }}>IVA</th>
                    <th className="num" style={{ width: 100 }}>ILA</th>
                    <th className="num" style={{ width: 100 }}>Logíst.</th>
                    <th className="num" style={{ width: 120 }}>Total</th>
                    <th className="num" style={{ width: 50 }}>V°B°</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const c = calculated[i];
                    const isEditing = editingIdx === i;
                    return (
                      <tr key={i} className={isEditing ? "editing" : undefined} onClick={() => setEditingIdx(i)}>
                        <td className="line-num">{String(i + 1).padStart(2, "0")}</td>
                        <td>
                          {l.product ? (
                            <div className="prod-cell">
                              <span className="prod-name">{l.product.name}</span>
                              <span className="prod-sku">
                                <span className="pill">SKU {l.product.sku}</span>
                                <span>
                                  {l.product.category?.name ?? ""}
                                  {l.product.brand?.name ? ` · ${l.product.brand.name}` : ""}
                                  {l.product.ila_rate > 0 && ` · ILA ${(l.product.ila_rate * 100).toFixed(1)}%`}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <ProductSearch
                              value={l.search}
                              products={products}
                              onPick={(p) => setProduct(i, p)}
                              onTextChange={(v) => updateLine(i, { search: v })}
                            />
                          )}
                        </td>
                        <td className="num">
                          {l.product ? (
                            <input
                              className="cell-input"
                              type="text"
                              inputMode="numeric"
                              value={l.cajas}
                              onClick={(e) => { e.stopPropagation(); setEditingIdx(i); }}
                              onChange={(e) => updateLine(i, { cajas: e.target.value.replace(/\D/g, "") })}
                            />
                          ) : <span className="cell-value muted">—</span>}
                        </td>
                        <td className="num"><span className="cell-value muted">{l.product?.units_per_box ?? "—"}</span></td>
                        <td className="num"><span className="cell-value">{c?.unidades ?? 0}</span></td>
                        <td className="num">
                          {l.product ? (
                            <input
                              className="cell-input"
                              type="text"
                              inputMode="numeric"
                              value={l.precio_bruto}
                              onClick={(e) => { e.stopPropagation(); setEditingIdx(i); }}
                              onChange={(e) => updateLine(i, { precio_bruto: e.target.value.replace(/\D/g, "") })}
                            />
                          ) : <span className="cell-value muted">—</span>}
                        </td>
                        <td className="num"><span className="cell-value">{c ? fmtClp(c.precio_neto) : "—"}</span></td>
                        <td className="num"><span className="cell-value muted">{c ? fmtClp(c.iva_producto) : "—"}</span></td>
                        <td className="num"><span className="cell-value muted">{c ? fmtClp(c.ila_producto) : "—"}</span></td>
                        <td className="num"><span className="cell-value muted">{c ? fmtClp(c.log_neto + c.log_iva) : "—"}</span></td>
                        <td className="num"><span className="cell-value strong">{fmtClp(c?.total ?? 0)}</span></td>
                        <td className="num">{c?.requires_vb ? <span className="badge badge-pending">SÍ</span> : <span className="cell-value muted">—</span>}</td>
                        <td>
                          <button type="button" className="btn-icon danger" title="Eliminar línea" onClick={(e) => { e.stopPropagation(); removeLine(i); }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* NOTAS */}
          <section className="section">
            <div className="section-head">
              <h2 className="section-title"><span className="section-num">4</span>Notas internas</h2>
              <span className="section-hint">Visible solo internamente</span>
            </div>
            <div className="note-area">
              <label className="field-label">Notas para el equipo</label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Información para el equipo, no se enviará al cliente…"
              />
              <div className="note-foot">Privado · solo equipo MN</div>
            </div>
          </section>
        </main>

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="summary-head">
            <div className="summary-eyebrow">Resumen</div>
            <div className="summary-title">Cálculo de la NV</div>
          </div>

          <div className="summary-card">
            <div className="sline">
              <span className="sline-key">Neto productos</span>
              <span className="sline-val">{fmtClp(totals.neto_productos)}</span>
            </div>
            {totals.descuento > 0 && (
              <div className="sline">
                <span className="sline-key">Descuento aplicado</span>
                <span className="sline-val" style={{ color: "var(--info)" }}>−{fmtClp(totals.descuento)}</span>
              </div>
            )}
            <div className="sline">
              <span className="sline-key">Logístico ({fmtN.format(config.logisticsNetPerUnit)}/u)</span>
              <span className="sline-val">{fmtClp(totals.log_neto)}</span>
            </div>
            <div className="sline">
              <span className="sline-key">IVA <span className="muted">(19%)</span></span>
              <span className="sline-val">{fmtClp(totals.iva)}</span>
            </div>
            <div className="sline">
              <span className="sline-key">ILA <span className="muted">(variable)</span></span>
              <span className={`sline-val ${totals.ila === 0 ? "zero" : ""}`}>{fmtClp(totals.ila)}</span>
            </div>
          </div>

          <div className="total-stamp">
            <span className="total-label">Total a facturar</span>
            <div className="total-value"><span className="currency">CLP</span>{fmtN.format(totals.total)}</div>
            <span className="total-sub">{totals.cajas} cj · {totals.unidades} u</span>
          </div>

          <div className="approvals">
            <div className="approvals-title"><span>Aprobaciones requeridas</span><span className="count">{totals.requires_vb ? "0 / 1" : "0 / 0"}</span></div>
            <div className="approval-item">
              <div className={`approval-ico ${totals.requires_vb ? "pending" : "done"}`}>{totals.requires_vb ? "!" : "✓"}</div>
              <div className="approval-body">
                <span className="approval-name">V°B° Financiero</span>
                <span className={`approval-meta ${totals.requires_vb ? "pending" : ""}`}>
                  {totals.requires_vb ? "Pendiente · línea bajo mínimo" : "No requerido"}
                </span>
              </div>
            </div>
          </div>

          <div className="summary-actions">
            <button type="button" className="btn btn-emit btn-lg" disabled={!canEmit}>
              {totals.requires_vb ? "Solicitar V°B° y emitir" : "Emitir NV"}
            </button>
            <button type="button" className="btn btn-ghost">Guardar borrador</button>
            <Link href="/nota-venta" className="btn btn-ghost" style={{ textDecoration: "none" }}>Cancelar</Link>
          </div>

          <div className="smeta">
            <span>Borrador no persistido</span>
            <span>v 0.2</span>
          </div>
        </aside>
      </div>

      {/* Sticky mobile emit bar — only visible ≤720px via CSS */}
      <div className="mobile-emit-bar" role="region" aria-label="Total y emisión">
        <div className="mobile-total">
          <span className="mobile-total-label">Total a facturar</span>
          <span className="mobile-total-value">{fmtClp(totals.total)}</span>
          <span className="mobile-total-sub">{totals.cajas} cj · {totals.unidades} u</span>
        </div>
        <button type="button" className="btn btn-emit" disabled={!canEmit}>
          {totals.requires_vb ? "V°B° + Emitir" : "Emitir NV"}
        </button>
      </div>
    </>
  );
}

function ProductSearch({
  value, products, onPick, onTextChange,
}: {
  value: string;
  products: NvProduct[];
  onPick: (p: NvProduct) => void;
  onTextChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const matches = useMemo(() => {
    const v = value.trim().toLowerCase();
    if (!v) return products.slice(0, 15);
    return products
      .filter((p) => p.sku.toLowerCase().includes(v) || p.name.toLowerCase().includes(v))
      .slice(0, 15);
  }, [value, products]);

  useEffect(() => {
    if (!focused || !inputRef.current) { setPos(null); return; }
    const updatePos = () => {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 420) });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [focused]);

  return (
    <>
      <input
        ref={inputRef}
        className="cell-input txt"
        placeholder={`Busca entre ${products.length} productos por SKU o nombre…`}
        value={value}
        onChange={(e) => onTextChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        autoFocus
      />
      {focused && pos && (
        <ul style={{
          position: "fixed",
          top: pos.top, left: pos.left, width: pos.width,
          zIndex: 1000,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          maxHeight: 320, overflowY: "auto", listStyle: "none", padding: 0, margin: 0,
          boxShadow: "var(--shadow-2)",
        }}>
          {matches.length === 0 ? (
            <li style={{ padding: "10px", fontSize: 12, color: "var(--text-3)" }}>Sin coincidencias</li>
          ) : matches.map((p) => (
            <li
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); onPick(p); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--text-3)", marginTop: 2, display: "flex", gap: 10 }}>
                <span>{p.sku}</span>
                <span>·</span>
                <span>{fmtClp(p.base_price_gross)} bruto</span>
                <span>·</span>
                <span>{p.units_per_box} u/cj</span>
                {p.ila_rate > 0 && <><span>·</span><span>ILA {(p.ila_rate * 100).toFixed(1)}%</span></>}
                {p.category && <><span>·</span><span>{p.category.name}</span></>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ClientSearch({
  clients, selected, onPick, onClear,
}: {
  clients: NvClient[];
  selected: NvClient | null;
  onPick: (c: NvClient) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selected) setQuery("");
  }, [selected]);

  const matches = useMemo(() => {
    const v = query.trim().toLowerCase();
    if (!v) return clients.slice(0, 20);
    return clients
      .filter((c) =>
        c.name.toLowerCase().includes(v) ||
        String(c.rut_body).includes(v) ||
        (c.commune ?? "").toLowerCase().includes(v)
      )
      .slice(0, 20);
  }, [query, clients]);

  if (selected) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input className="field-input" value={selected.name} readOnly style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => { onClear(); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div className="field-input-group">
        <svg className="i prefix" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
        <input
          ref={inputRef}
          className="field-input"
          placeholder={`Busca entre ${clients.length} clientes por nombre, RUT o comuna…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
        />
      </div>
      {focused && (
        <ul style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)", maxHeight: 320, overflowY: "auto",
          listStyle: "none", padding: 0, margin: 0, boxShadow: "var(--shadow-2)",
        }}>
          {matches.length === 0 ? (
            <li style={{ padding: "12px", fontSize: 13, color: "var(--text-3)" }}>Sin coincidencias</li>
          ) : matches.map((c) => (
            <li
              key={c.id}
              onMouseDown={(e) => { e.preventDefault(); onPick(c); }}
              style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 500, color: "var(--text)" }}>{c.name}</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", gap: 10 }}>
                <span>{formatRut(c.rut_body, c.rut_dv)}</span>
                {c.commune && <><span>·</span><span>{c.commune}</span></>}
                {c.payment_term && <><span>·</span><span>{c.payment_term.name}</span></>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
