import Link from "next/link";
import type { OcDetail } from "../../_lib/queries";
import { OcLinesEditor } from "./OcLinesEditor";

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

export function OcDetailContent({ oc, mode, logisticsCosts = {} }: { oc: OcDetail; mode: "page" | "modal"; logisticsCosts?: Record<string, number> }) {
  const cumplimTone = oc.cumplim >= 80 ? "ok" : oc.cumplim >= 50 ? "warn" : "danger";
  const pendiente = Math.max(0, oc.total_amount - oc.totalFacturado - oc.totalLostSale);
  const orphanCount = oc.items.filter((it) => !it.product).length;
  const totalCajas = oc.items.reduce((s, it) => s + (it.quantity_boxes || 0), 0);

  return (
    <>
      <section className="oc-detail-head">
        {mode === "page" && (
          <div className="oc-detail-back">
            <Link href="/supermercados/ordenes" className="back-link">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Volver a Órdenes
            </Link>
          </div>
        )}

        <div className="oc-detail-title-row">
          <div className="oc-detail-titles">
            <div className="doc-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {oc.chain && <span className="chain-mini">{oc.chain.name.slice(0, 2).toUpperCase()}</span>}
              <span>{oc.chain?.name ?? "—"}</span>
              {oc.buyer && <><span style={{ color: "var(--text-4)" }}>·</span><span>{oc.buyer}</span></>}
            </div>
            <h1 className="oc-detail-title">
              OC <span className="mono" style={{ fontWeight: 400 }}>{oc.order_number}</span>
            </h1>
            <p className="oc-detail-sub">
              Emitida {oc.order_date}
              {oc.cancellation_date && (
                <> · entrega <span className={oc.isVencida ? "text-danger" : ""}>{oc.cancellation_date}</span></>
              )}
              <span className={`status-tag ${
                oc.status === "COMPLETADA" ? "ok"
                : oc.status === "PARCIAL" ? "warn"
                : oc.isVencida ? "danger" : "muted"
              }`} style={{ marginLeft: 10 }}>
                {oc.status}
              </span>
            </p>
          </div>

          <div className="oc-detail-actions">
            {oc.source_pdf && (
              <span className="oc-detail-source" title={oc.source_pdf}>
                📄 {oc.source_pdf.length > 30 ? `…${oc.source_pdf.slice(-28)}` : oc.source_pdf}
              </span>
            )}
          </div>
        </div>

        {/* META STRIP 6 cells */}
        <div className="oc-meta-strip">
          <div className="oc-meta-cell">
            <div className="oc-meta-key">Total OC</div>
            <div className="oc-meta-val">{fmtClpCompact(oc.total_amount)}</div>
          </div>
          <div className="oc-meta-cell">
            <div className="oc-meta-key">Facturado</div>
            <div className="oc-meta-val ok">{fmtClpCompact(oc.totalFacturado)}</div>
          </div>
          <div className="oc-meta-cell">
            <div className="oc-meta-key">Pendiente</div>
            <div className={`oc-meta-val ${pendiente > 0 ? "warn" : "ok"}`}>{fmtClpCompact(pendiente)}</div>
          </div>
          <div className="oc-meta-cell">
            <div className="oc-meta-key">Venta perdida</div>
            <div className={`oc-meta-val ${oc.totalLostSale > 0 ? "danger" : ""}`}>{fmtClpCompact(oc.totalLostSale)}</div>
          </div>
          <div className="oc-meta-cell">
            <div className="oc-meta-key">Líneas / mapeadas</div>
            <div className="oc-meta-val">
              {oc.items.length} <span style={{ color: orphanCount > 0 ? "var(--warning)" : "var(--text-3)", fontSize: 14 }}>
                / {oc.items.length - orphanCount}
              </span>
            </div>
          </div>
          <div className="oc-meta-cell">
            <div className="oc-meta-key">Cajas / Días</div>
            <div className="oc-meta-val">
              {totalCajas}
              <span style={{ fontSize: 13, color: oc.daysSinceIssue > 20 ? "var(--warning)" : "var(--text-3)", marginLeft: 6 }}>
                · {oc.daysSinceIssue}d
              </span>
            </div>
          </div>
        </div>

        {/* Banner cumplimiento grande */}
        <div className="oc-fillrate-banner">
          <div className="oc-fillrate-label">
            <span className="oc-fillrate-eyebrow">Cumplimiento actual</span>
            <span className={`oc-fillrate-big ${cumplimTone}`}>{oc.cumplim}%</span>
          </div>
          <div className="oc-fillrate-bar">
            <div className={`oc-fillrate-fill tone-${cumplimTone}`} style={{ width: `${Math.min(100, oc.cumplim)}%` }} />
          </div>
        </div>

        {orphanCount > 0 && (
          <Link href="/admin/mapeo-upc" className="dashboard-alert tone-warn" style={{ marginTop: 12 }}>
            <span className="dashboard-alert-dot" />
            <span><b>{orphanCount}</b> línea(s) sin SKU mapeado en esta OC</span>
            <span className="dashboard-alert-arrow">Resolver →</span>
          </Link>
        )}
      </section>

      {/* Editor inline + sidebar */}
      <OcLinesEditor oc={oc} logisticsCosts={logisticsCosts} />
    </>
  );
}
