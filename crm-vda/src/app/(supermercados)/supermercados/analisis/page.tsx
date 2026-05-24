import Link from "next/link";
import { parsePeriod, periodPresets, previousPeriod } from "../_lib/period";
import { getRanking, type Dimension, type RankingRow } from "../_lib/queries";

export const revalidate = 60;

const fmtClp = (n: number, compact = false) => {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${Math.round(n)}`;
  }
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)}`;
};
const fmtNum = (n: number) => new Intl.NumberFormat("es-CL").format(n);
const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
const fmtDelta = (d: number | null): { text: string; tone: "ok" | "warn" | "danger" | "muted" } => {
  if (d === null) return { text: "—", tone: "muted" };
  const pct = Math.round(d * 100);
  if (pct === 0) return { text: "0%", tone: "muted" };
  const sign = pct > 0 ? "▲" : "▼";
  const tone = pct > 5 ? "ok" : pct < -5 ? "danger" : "warn";
  return { text: `${sign} ${Math.abs(pct)}%`, tone };
};

const DIMS: Array<{ key: Dimension; label: string }> = [
  { key: "marca", label: "Por marca" },
  { key: "categoria", label: "Por categoría" },
  { key: "sku", label: "Por SKU" },
  { key: "cadena", label: "Por cadena" },
];

interface ViewParams {
  vista?: string;
  periodo?: string;
  orden?: string;     // "oc" | "fact" | "fr" | "margen" | "delta"
  dir?: string;       // "asc" | "desc"
  limit?: string;
}

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<ViewParams>;
}) {
  const sp = await searchParams;
  const dim: Dimension = (DIMS.find((d) => d.key === sp.vista)?.key) ?? "marca";
  const period = parsePeriod(sp.periodo);
  const prevP = previousPeriod(period);
  const presets = periodPresets(period);

  const orden = (sp.orden ?? "oc") as "oc" | "fact" | "fr" | "margen" | "delta";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const limit = parseInt(sp.limit ?? "50", 10);

  const rows = await getRanking(period, dim);

  // Aplicar orden
  const sortFn = (a: RankingRow, b: RankingRow): number => {
    const mult = dir === "asc" ? 1 : -1;
    switch (orden) {
      case "fact":   return mult * (a.totalFacturado - b.totalFacturado);
      case "fr":     return mult * (a.fillRate - b.fillRate);
      case "margen": return mult * ((a.marginAmount ?? -Infinity) - (b.marginAmount ?? -Infinity));
      case "delta":  return mult * ((a.deltaOcPct ?? -1) - (b.deltaOcPct ?? -1));
      default:       return mult * (a.totalOc - b.totalOc);
    }
  };
  const sorted = [...rows].sort(sortFn);
  const top = sorted.slice(0, limit);

  // Bottom 5 (los peores en monto OC siempre)
  const bottom = dim === "sku"
    ? [...rows].sort((a, b) => a.totalOc - b.totalOc).filter((r) => r.totalOc > 0).slice(0, 5)
    : [];

  const totals = rows.reduce(
    (acc, r) => ({
      oc: acc.oc + r.totalOc,
      fact: acc.fact + r.totalFacturado,
      margin: acc.margin + (r.marginAmount ?? 0),
    }),
    { oc: 0, fact: 0, margin: 0 }
  );

  // Pareto: posición en la que se acumula 80% del facturado
  const sortedByFact = [...rows].sort((a, b) => b.totalFacturado - a.totalFacturado);
  let acc = 0;
  let paretoCutoff = 0;
  for (let i = 0; i < sortedByFact.length; i++) {
    acc += sortedByFact[i].totalFacturado;
    if (acc >= totals.fact * 0.8) { paretoCutoff = i + 1; break; }
  }

  // Helper para link de orden manteniendo otros params
  const orderLink = (newOrden: string) => {
    const params = new URLSearchParams();
    params.set("vista", dim);
    params.set("periodo", period.paramValue);
    params.set("orden", newOrden);
    params.set("dir", orden === newOrden && dir === "desc" ? "asc" : "desc");
    return `/supermercados/analisis?${params}`;
  };

  return (
    <>
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Análisis comercial</div>
            <h1 className="doc-title">{DIMS.find((d) => d.key === dim)?.label}</h1>
            <p className="doc-sub" style={{ textTransform: "capitalize" }}>
              {period.label} · comparativa contra <b style={{ color: "var(--text)" }}>{prevP.label}</b>
            </p>
          </div>

          <div className="period-picker">
            {presets.map((p) => (
              <Link
                key={p.value}
                href={`/supermercados/analisis?vista=${dim}&periodo=${p.value}`}
                className={`period-chip ${p.active ? "is-active" : ""}`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Sub-tabs de dimensión */}
        <div className="sub-tabs">
          {DIMS.map((d) => (
            <Link
              key={d.key}
              href={`/supermercados/analisis?vista=${d.key}&periodo=${period.paramValue}`}
              className={`sub-tab ${dim === d.key ? "is-active" : ""}`}
            >
              {d.label}
            </Link>
          ))}
          <div className="sub-tabs-spacer" />
          <span className="sub-tabs-hint">
            {rows.length} {dim === "sku" ? "SKUs" : dim === "cadena" ? "cadenas" : dim === "marca" ? "marcas" : "categorías"} ·
            Pareto 80% = {paretoCutoff > 0 ? `${paretoCutoff} ${dim === "sku" ? "SKUs" : "ítems"}` : "—"}
          </span>
        </div>
      </section>

      <main className="content">
        {rows.length === 0 ? (
          <div className="sm-empty">
            <div className="sm-empty-title">Sin datos en este período</div>
            <p className="sm-empty-desc">Cuando haya OC del período seleccionado, verás el ranking acá.</p>
          </div>
        ) : (
          <>
            <section className="dash-block">
              <div className="dash-block-head">
                <h2 className="dash-block-title">Ranking</h2>
                <span className="dash-block-hint">
                  Mostrando top {Math.min(limit, sorted.length)} de {rows.length}
                </span>
              </div>

              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}>#</th>
                      <th>{dim === "sku" ? "SKU / Producto" : dim === "cadena" ? "Cadena" : dim === "marca" ? "Marca" : "Categoría"}</th>
                      <th className="num">OC</th>
                      <th className="num">Cajas</th>
                      <th className="num">
                        <Link href={orderLink("oc")} className="th-sort">
                          Monto OC{orden === "oc" && (dir === "desc" ? " ↓" : " ↑")}
                        </Link>
                      </th>
                      <th className="num">
                        <Link href={orderLink("fact")} className="th-sort">
                          Facturado{orden === "fact" && (dir === "desc" ? " ↓" : " ↑")}
                        </Link>
                      </th>
                      <th className="num">
                        <Link href={orderLink("margen")} className="th-sort">
                          Margen ${orden === "margen" && (dir === "desc" ? " ↓" : " ↑")}
                        </Link>
                      </th>
                      <th className="num">Margen %</th>
                      <th>
                        <Link href={orderLink("fr")} className="th-sort">
                          Fill rate{orden === "fr" && (dir === "desc" ? " ↓" : " ↑")}
                        </Link>
                      </th>
                      <th className="num">
                        <Link href={orderLink("delta")} className="th-sort">
                          Δ vs {prevP.kind === "month" ? "mes ant." : "año ant."}{orden === "delta" && (dir === "desc" ? " ↓" : " ↑")}
                        </Link>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((r, i) => {
                      const frPct = Math.round(r.fillRate * 100);
                      const frTone = r.fillRate >= 0.85 ? "ok" : r.fillRate >= 0.7 ? "warn" : "danger";
                      const delta = fmtDelta(r.deltaOcPct);
                      const inPareto = paretoCutoff > 0 && i < paretoCutoff;
                      return (
                        <tr key={r.key}>
                          <td className="mono" style={{ color: "var(--text-3)" }}>
                            {i + 1}
                            {inPareto && <span className="pareto-dot" title="Dentro del 80% del facturado">★</span>}
                          </td>
                          <td>{r.label}</td>
                          <td className="num mono">{r.ocCount}</td>
                          <td className="num mono">{fmtNum(r.boxes)}</td>
                          <td className="num mono">{fmtClp(r.totalOc, true)}</td>
                          <td className="num mono">{fmtClp(r.totalFacturado, true)}</td>
                          <td className="num mono">
                            {r.marginAmount === null
                              ? <span style={{ color: "var(--text-4)" }}>—</span>
                              : fmtClp(r.marginAmount, true)}
                          </td>
                          <td className="num mono">
                            {r.marginRate === null ? (
                              <span style={{ color: "var(--text-4)" }}>—</span>
                            ) : (
                              <span title={r.costCoverage < 1 ? `cobertura costo ${fmtPct(r.costCoverage)}` : undefined}>
                                {fmtPct(r.marginRate)}
                                {r.costCoverage < 1 && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="fr-inline">
                              <div className="fr-bar"><div className={`fr-fill ${frTone}`} style={{ width: `${Math.min(100, frPct)}%` }} /></div>
                              <span className={`fr-pct ${frTone}`}>{frPct}%</span>
                            </div>
                          </td>
                          <td className="num">
                            <span className={`delta-pill tone-${delta.tone}`}>{delta.text}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}><strong>Total</strong></td>
                      <td className="num mono">—</td>
                      <td className="num mono">—</td>
                      <td className="num mono">{fmtClp(totals.oc, true)}</td>
                      <td className="num mono">{fmtClp(totals.fact, true)}</td>
                      <td className="num mono">{totals.margin > 0 ? fmtClp(totals.margin, true) : "—"}</td>
                      <td className="num mono">
                        {totals.fact > 0 && totals.margin > 0 ? fmtPct(totals.margin / totals.fact) : "—"}
                      </td>
                      <td><span className="fr-pct">{totals.oc > 0 ? fmtPct(totals.fact / totals.oc) : "0%"}</span></td>
                      <td className="num">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {bottom.length > 0 && (
              <section className="dash-block" style={{ marginTop: 24 }}>
                <div className="dash-block-head">
                  <h2 className="dash-block-title" style={{ color: "var(--danger)" }}>
                    Bottom 5 — bajo rendimiento
                  </h2>
                  <span className="dash-block-hint">Candidatos a revisar surtido o pricing</span>
                </div>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>SKU / Producto</th>
                        <th className="num">Cajas</th>
                        <th className="num">Monto OC</th>
                        <th className="num">Margen $</th>
                        <th>Fill rate</th>
                        <th className="num">Δ vs ant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bottom.map((r) => {
                        const frPct = Math.round(r.fillRate * 100);
                        const frTone = r.fillRate >= 0.85 ? "ok" : r.fillRate >= 0.7 ? "warn" : "danger";
                        const delta = fmtDelta(r.deltaOcPct);
                        return (
                          <tr key={r.key} style={{ background: "#FDF6F4" }}>
                            <td>{r.label}</td>
                            <td className="num mono">{fmtNum(r.boxes)}</td>
                            <td className="num mono">{fmtClp(r.totalOc, true)}</td>
                            <td className="num mono">
                              {r.marginAmount === null
                                ? <span style={{ color: "var(--text-4)" }}>—</span>
                                : fmtClp(r.marginAmount, true)}
                            </td>
                            <td>
                              <div className="fr-inline">
                                <div className="fr-bar"><div className={`fr-fill ${frTone}`} style={{ width: `${Math.min(100, frPct)}%` }} /></div>
                                <span className={`fr-pct ${frTone}`}>{frPct}%</span>
                              </div>
                            </td>
                            <td className="num"><span className={`delta-pill tone-${delta.tone}`}>{delta.text}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
