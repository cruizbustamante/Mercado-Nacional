import Link from "next/link";
import { parsePeriod, periodPresets } from "./_lib/period";
import { getDashboardKpis, getChainBreakdown, getTopSkus, getTopBrands } from "./_lib/queries";

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

function chainAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud") || n.includes("cenco") || n.includes("jumbo") || n.includes("santa isabel")) return "cen";
  if (n.includes("smu") || n.includes("unimarc")) return "smu";
  if (n.includes("tottus") || n.includes("falabella")) return "tot";
  if (n.includes("walmart") || n.includes("líder") || n.includes("lider") || n.includes("acuenta")) return "wal";
  if (n.includes("rendic")) return "ren";
  return "gen";
}

function chainInitials(name: string): string {
  const accent = chainAccent(name);
  if (accent !== "gen") return accent.toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

export default async function CumplimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.periodo);
  const presets = periodPresets(period);

  const [kpis, chains, topSkus, topBrands] = await Promise.all([
    getDashboardKpis(period),
    getChainBreakdown(period),
    getTopSkus(period, 5),
    getTopBrands(period, 5),
  ]);

  const frPct = Math.round(kpis.fillRate * 100);
  const noCapturado = kpis.totalPendiente + kpis.totalPerdido;
  const pendPct = kpis.totalOc > 0 ? (kpis.totalPendiente / kpis.totalOc) * 100 : 0;
  const perdPct = kpis.totalOc > 0 ? (kpis.totalPerdido / kpis.totalOc) * 100 : 0;
  const maxBrandOc = topBrands.length > 0 ? topBrands[0].totalOc : 1;
  const maxSkuOc = topSkus.length > 0 ? topSkus[0].totalOc : 1;

  return (
    <>
      {/* TOPBAR */}
      <section className="sm-topbar">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1>Cumplimiento</h1>
          <div className="sub" style={{ textTransform: "capitalize" }}>
            Período <b>{period.label}</b> · {kpis.ocCount} OC analizadas
          </div>
        </div>
        <div className="sm-periods">
          {presets.map((p) => (
            <Link
              key={p.value}
              href={`/supermercados?periodo=${p.value}`}
              className={`sm-pchip ${p.active ? "is-active" : ""}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      {/* FLOW CARD — ¿Dónde está la plata? */}
      <section className="flow-card">
        <div className="flow-header">
          <span className="label">Flujo del mes</span>
          <span className="question">¿Dónde está la plata?</span>
        </div>

        <div className="flow-stages">
          <div className="stage">
            <div className="stage-label">Monto OC</div>
            <div className="stage-value">{fmtClp(kpis.totalOc, true)}</div>
            <div className="stage-context">{kpis.ocCount} OC · {kpis.chainCount} cadena{kpis.chainCount !== 1 ? "s" : ""}</div>
          </div>
          <div className="stage-arrow">→</div>
          <div className="stage">
            <div className="stage-label">Facturado</div>
            <div className="stage-value ok">{fmtClp(kpis.totalFacturado, true)}</div>
            <div className="stage-context">Fill rate {frPct}%</div>
          </div>
          <div className="stage-arrow">→</div>
          <div className="stage">
            <div className="stage-label">No capturado</div>
            <div className="stage-value dg">{fmtClp(noCapturado, true)}</div>
            <div className="stage-context">
              {fmtClp(kpis.totalPendiente, true)} pendiente · {fmtClp(kpis.totalPerdido, true)} perdida
            </div>
          </div>
        </div>

        {/* Stacked bar */}
        <div className="flow-bar">
          <span className="seg-ok" style={{ width: `${frPct}%` }} />
          <span className="seg-wn" style={{ width: `${pendPct.toFixed(1)}%` }} />
          <span className="seg-dg" style={{ width: `${perdPct.toFixed(1)}%` }} />
        </div>

        <div className="flow-legend">
          <span className="item">
            <span className="dot" style={{ background: "var(--success)" }} />
            Facturado <span className="v">{fmtClp(kpis.totalFacturado, true)}</span>
          </span>
          <span className="item">
            <span className="dot" style={{ background: "var(--warning)" }} />
            Pendiente recuperable <span className="v">{fmtClp(kpis.totalPendiente, true)}</span>
          </span>
          <span className="item">
            <span className="dot" style={{ background: "var(--danger)" }} />
            Venta perdida <span className="v">{fmtClp(kpis.totalPerdido, true)}</span>
          </span>
        </div>

        {/* Crit banner */}
        {kpis.vencidasCount > 0 && (
          <Link href="/supermercados/alertas" className="crit-banner" style={{ textDecoration: "none" }}>
            <span className="icon-circle">!</span>
            <span>
              <b>{kpis.vencidasCount} OC vencida{kpis.vencidasCount !== 1 ? "s" : ""}</b>{" "}
              suman <b>{fmtClp(kpis.totalPerdido, true)}</b> en venta perdida — atención urgente
            </span>
            <span className="link">Ver alertas →</span>
          </Link>
        )}

        {kpis.orphanLines > 0 && (
          <Link href="/admin/mapeo-upc" className="crit-banner" style={{ textDecoration: "none", background: "var(--warning-soft)", borderColor: "rgba(184,110,21,0.18)", color: "var(--warning)" }}>
            <span className="icon-circle" style={{ background: "var(--warning)" }}>⚠</span>
            <span>
              <b>{kpis.orphanLines}</b> de {kpis.totalLines} líneas sin SKU mapeado —
              el dashboard subestima los totales reales
            </span>
            <span className="link" style={{ color: "var(--warning)" }}>Resolver →</span>
          </Link>
        )}
      </section>

      {/* CADENA GRID — scorecards with donuts */}
      {chains.length > 0 && (
        <section>
          <div className="sm-section-head">
            <h2>Cadenas</h2>
            <div className="meta">
              {chains.length} activa{chains.length !== 1 ? "s" : ""} ·{" "}
              <Link href="/supermercados/ordenes">Ver todas →</Link>
            </div>
          </div>

          <div className="cadena-grid">
            {chains.map((ch) => {
              const pct = Math.round(ch.fillRate * 100);
              const isCrit = ch.fillRate < 0.7;
              const tone = ch.fillRate >= 0.85 ? "ok" : ch.fillRate >= 0.7 ? "wn" : "dg";
              const accent = chainAccent(ch.name);
              const circumference = 2 * Math.PI * 15.9;
              const strokeLen = (pct / 100) * circumference;
              const gapLen = circumference - strokeLen;
              const strokeColor = tone === "ok" ? "#2C6E3B" : tone === "wn" ? "#B86E15" : "#B83838";
              const bgStroke = tone === "ok" ? "#E6EFE3" : tone === "wn" ? "#FAEDD8" : "#FBE7E5";

              return (
                <div key={ch.id} className={`cadena-card ${isCrit ? "crit" : ""}`}>
                  {isCrit && <span className="top-accent" />}
                  <div className="cadena-top">
                    <div className="cadena-id">
                      <div className={`cadena-initials ${accent}`}>{chainInitials(ch.name)}</div>
                      <div className="cadena-name">
                        <b>{ch.name}</b>
                        <span>{ch.ocCount} OC · {ch.skuCount} SKU</span>
                      </div>
                    </div>
                    {isCrit && <div className="status-pill crit">Crítico</div>}
                  </div>

                  <div className="cadena-body">
                    <div className="donut">
                      <svg viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke={bgStroke} strokeWidth="3.5" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke={strokeColor} strokeWidth="3.5"
                          strokeDasharray={`${strokeLen.toFixed(1)} ${gapLen.toFixed(1)}`} />
                      </svg>
                      <div className={`pct ${tone}`}>{pct}%</div>
                    </div>
                    <div className="cadena-figs">
                      <div className="fig-row"><span className="l">OC</span><span className="v">{fmtClp(ch.totalOc, true)}</span></div>
                      <div className="fig-row"><span className="l">Facturado</span><span className="v">{fmtClp(ch.totalFacturado, true)}</span></div>
                      {ch.totalPendiente > 0 && (
                        <div className="fig-row"><span className="l">Pendiente</span><span className="v wn">{fmtClp(ch.totalPendiente, true)}</span></div>
                      )}
                      {ch.totalPerdido > 0 && (
                        <div className="fig-row"><span className="l">Perdido</span><span className="v dg">{fmtClp(ch.totalPerdido, true)}</span></div>
                      )}
                    </div>
                  </div>

                  <div className="cadena-foot">
                    <span>{ch.ocCount} orden{ch.ocCount !== 1 ? "es" : ""}</span>
                    <Link href={`/supermercados/ordenes?chain=${ch.id}`}>Ver OC →</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* LEADERBOARD GRID — Top marcas + Top SKUs */}
      {(topBrands.length > 0 || topSkus.length > 0) && (
        <section>
          <div className="sm-section-head">
            <h2>Ranking</h2>
            <div className="meta">
              <Link href="/supermercados/analisis">Ver análisis completo →</Link>
            </div>
          </div>

          <div className="lb-grid">
            {/* Top Marcas */}
            {topBrands.length > 0 && (
              <div className="lb-card">
                <div className="lb-head">
                  <div className="left">
                    <div className="icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </div>
                    <div>
                      <h3>Top marcas</h3>
                      <span className="sub">por volumen OC</span>
                    </div>
                  </div>
                </div>
                {topBrands.map((b, i) => {
                  const barW = maxBrandOc > 0 ? (b.totalOc / maxBrandOc) * 100 : 0;
                  return (
                    <div key={b.brand} className="lb-row">
                      <div className={`lb-rank ${i < 3 ? "podium" : ""}`}>{i + 1}</div>
                      <div className="lb-name">
                        <b>{b.brand}</b>
                        <span>{b.categoryCount} cat{b.categoryCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="lb-bar">
                        <div className="track"><span style={{ width: `${barW}%` }} /></div>
                        <span className="vol">{fmtNum(b.boxes)}</span>
                      </div>
                      <div className="lb-amt">{fmtClp(b.totalOc, true)}</div>
                    </div>
                  );
                })}
                <div className="lb-foot">
                  <span>{topBrands.length} marcas mostradas</span>
                  <Link href="/supermercados/analisis?dim=marca">Ver todas →</Link>
                </div>
              </div>
            )}

            {/* Top SKUs */}
            {topSkus.length > 0 && (
              <div className="lb-card">
                <div className="lb-head">
                  <div className="left">
                    <div className="icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </div>
                    <div>
                      <h3>Top SKUs</h3>
                      <span className="sub">por volumen OC</span>
                    </div>
                  </div>
                </div>
                {topSkus.map((s, i) => {
                  const barW = maxSkuOc > 0 ? (s.totalOc / maxSkuOc) * 100 : 0;
                  return (
                    <div key={`${s.product_id ?? s.name}-${i}`} className="lb-row">
                      <div className={`lb-rank ${i < 3 ? "podium" : ""}`}>{i + 1}</div>
                      <div className="lb-name">
                        <b>{s.name}</b>
                        <span>{s.sku ?? "sin SKU"}</span>
                      </div>
                      <div className="lb-bar">
                        <div className="track"><span style={{ width: `${barW}%` }} /></div>
                        <span className="vol">{fmtNum(s.boxes)}</span>
                      </div>
                      <div className="lb-amt">{fmtClp(s.totalOc, true)}</div>
                    </div>
                  );
                })}
                <div className="lb-foot">
                  <span>{topSkus.length} SKUs mostrados</span>
                  <Link href="/supermercados/analisis?dim=sku">Ver todos →</Link>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
