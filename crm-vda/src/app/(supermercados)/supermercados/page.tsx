import Link from "next/link";
import { parsePeriod, periodPresets } from "./_lib/period";
import { getDashboardKpis, getChainBreakdown, getTopSkus } from "./_lib/queries";

export const revalidate = 60;

const fmtClp = (n: number, compact = false) => {
  if (compact) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  }
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;
};
const fmtNum = (n: number) => new Intl.NumberFormat("es-CL").format(n);
const fmtPct = (r: number) => `${Math.round(r * 100)}%`;

export default async function CumplimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.periodo);
  const presets = periodPresets(period);

  const [kpis, chains, topSkus] = await Promise.all([
    getDashboardKpis(period),
    getChainBreakdown(period),
    getTopSkus(period, 8),
  ]);

  const frTone = kpis.fillRate >= 0.85 ? "ok" : kpis.fillRate >= 0.7 ? "warn" : "danger";

  return (
    <>
      {/* DOC HEAD */}
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Dashboard</div>
            <h1 className="doc-title">Cumplimiento</h1>
            <p className="doc-sub" style={{ textTransform: "capitalize" }}>
              Período: <b style={{ color: "var(--text)" }}>{period.label}</b> · {kpis.ocCount} OC analizadas
            </p>
          </div>

          {/* Period selector */}
          <div className="period-picker">
            {presets.map((p) => (
              <Link
                key={p.value}
                href={`/supermercados?periodo=${p.value}`}
                className={`period-chip ${p.active ? "is-active" : ""}`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* KPI STRIP densificada (60px) */}
        <div className="kpi-strip">
          <div className="kpi-cell">
            <div className="kpi-key">OC del período</div>
            <div className="kpi-val">{kpis.ocCount}</div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-key">Monto OC</div>
            <div className="kpi-val">{fmtClp(kpis.totalOc, true)}</div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-key">Facturado</div>
            <div className="kpi-val ok">{fmtClp(kpis.totalFacturado, true)}</div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-key">Fill rate</div>
            <div className={`kpi-val ${frTone}`}>{fmtPct(kpis.fillRate)}</div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-key">Pendiente recuperable</div>
            <div className="kpi-val warn">{fmtClp(kpis.totalPendiente, true)}</div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-key">Venta perdida</div>
            <div className={`kpi-val ${kpis.totalPerdido > 0 ? "danger" : "ok"}`}>
              {fmtClp(kpis.totalPerdido, true)}
            </div>
          </div>
          <div className="kpi-cell">
            <div className="kpi-key">Margen aprox.</div>
            <div className="kpi-val">
              {kpis.marginCoverage > 0 ? fmtClp(kpis.marginAmount, true) : "—"}
            </div>
            <div className="kpi-sub">
              {kpis.marginCoverage > 0
                ? `${fmtPct(kpis.marginRate)} · cobertura ${fmtPct(kpis.marginCoverage)}`
                : "carga costos en productos"}
            </div>
          </div>
        </div>

        {/* Alerta líneas huérfanas */}
        {kpis.orphanLines > 0 && (
          <Link href="/admin/mapeo-upc" className="dashboard-alert tone-warn">
            <span className="dashboard-alert-dot" />
            <span>
              <b>{kpis.orphanLines}</b> de {kpis.totalLines} líneas sin SKU mapeado en este período —
              el dashboard subestima los totales reales.
            </span>
            <span className="dashboard-alert-arrow">Resolver →</span>
          </Link>
        )}
      </section>

      <main className="content">
        {/* TABLA POR CADENA */}
        <section className="dash-block">
          <div className="dash-block-head">
            <h2 className="dash-block-title">Por cadena</h2>
            <span className="dash-block-hint">Click en una fila para ver sus OC</span>
          </div>

          {chains.length === 0 ? (
            <div className="sm-empty" style={{ padding: "32px 24px" }}>
              <div className="sm-empty-title" style={{ fontSize: 15 }}>Sin OC en el período</div>
              <p className="sm-empty-desc" style={{ fontSize: 12.5 }}>
                Cuando cargues OC del período seleccionado, aparecerán acá.
              </p>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Cadena</th>
                    <th className="num">OC</th>
                    <th className="num">Monto OC</th>
                    <th className="num">Facturado</th>
                    <th className="num">Pendiente</th>
                    <th className="num">Margen $</th>
                    <th className="num">Margen %</th>
                    <th>Fill rate</th>
                  </tr>
                </thead>
                <tbody>
                  {chains.map((ch) => {
                    const frPct = Math.round(ch.fillRate * 100);
                    const tone = ch.fillRate >= 0.85 ? "ok" : ch.fillRate >= 0.7 ? "warn" : "danger";
                    return (
                      <tr key={ch.id}>
                        <td>
                          <Link
                            href={`/supermercados/ordenes?mes=${period.kind === "month" ? period.paramValue : ""}&chain=${ch.id}`}
                            className="dash-chain-link"
                          >
                            {ch.name}
                          </Link>
                        </td>
                        <td className="num mono">{ch.ocCount}</td>
                        <td className="num mono">{fmtClp(ch.totalOc, true)}</td>
                        <td className="num mono">{fmtClp(ch.totalFacturado, true)}</td>
                        <td className={`num mono ${ch.totalPendiente > 0 ? "warn-text" : ""}`}>
                          {fmtClp(ch.totalPendiente, true)}
                        </td>
                        <td className="num mono">
                          {ch.marginAmount > 0 ? fmtClp(ch.marginAmount, true) : "—"}
                        </td>
                        <td className="num mono">
                          {ch.marginRate > 0 ? fmtPct(ch.marginRate) : "—"}
                        </td>
                        <td>
                          <div className="fr-inline">
                            <div className="fr-bar"><div className={`fr-fill ${tone}`} style={{ width: `${Math.min(100, frPct)}%` }} /></div>
                            <span className={`fr-pct ${tone}`}>{frPct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td><strong>Total</strong></td>
                    <td className="num mono">{kpis.ocCount}</td>
                    <td className="num mono">{fmtClp(kpis.totalOc, true)}</td>
                    <td className="num mono">{fmtClp(kpis.totalFacturado, true)}</td>
                    <td className="num mono">{fmtClp(kpis.totalPendiente, true)}</td>
                    <td className="num mono">{kpis.marginAmount > 0 ? fmtClp(kpis.marginAmount, true) : "—"}</td>
                    <td className="num mono">{kpis.marginRate > 0 ? fmtPct(kpis.marginRate) : "—"}</td>
                    <td><span className={`fr-pct ${frTone}`}>{fmtPct(kpis.fillRate)}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* TOP SKUs */}
        <section className="dash-block" style={{ marginTop: 24 }}>
          <div className="dash-block-head">
            <h2 className="dash-block-title">Top SKUs por volumen OC</h2>
            <Link href="/supermercados/analisis" className="dash-block-action">
              Ver análisis completo →
            </Link>
          </div>

          {topSkus.length === 0 ? (
            <div className="sm-empty" style={{ padding: "24px 16px" }}>
              <p className="sm-empty-desc" style={{ fontSize: 12.5 }}>Sin datos de SKU en el período.</p>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>SKU / Producto</th>
                    <th className="num">Cajas</th>
                    <th className="num">Unidades</th>
                    <th className="num">Monto OC</th>
                    <th className="num">Facturado est.</th>
                    <th className="num">Margen $</th>
                  </tr>
                </thead>
                <tbody>
                  {topSkus.map((s, i) => (
                    <tr key={`${s.product_id ?? s.name}-${i}`}>
                      <td className="mono" style={{ color: "var(--text-3)" }}>{i + 1}</td>
                      <td>
                        <div className="prod-name">{s.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                          {s.sku ?? <span className="badge badge-warn">sin SKU</span>}
                        </div>
                      </td>
                      <td className="num mono">{fmtNum(s.boxes)}</td>
                      <td className="num mono">{fmtNum(s.units)}</td>
                      <td className="num mono">{fmtClp(s.totalOc, true)}</td>
                      <td className="num mono">{fmtClp(s.totalFacturado, true)}</td>
                      <td className="num mono">
                        {s.marginAmount === null ? <span style={{ color: "var(--text-4)" }}>—</span>
                          : fmtClp(s.marginAmount, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
