import Link from "next/link";
import { getAlerts, type AlertSeverity } from "../_lib/queries";

export const revalidate = 60;

const SEV_LABEL: Record<AlertSeverity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export default async function AlertasPage() {
  const groups = await getAlerts();
  const totalCount = groups.reduce((s, g) => s + g.count, 0);
  const criticalCount = groups.filter((g) => g.severity === "critical").reduce((s, g) => s + g.count, 0);

  return (
    <>
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Operación</div>
            <h1 className="doc-title">Alertas accionables</h1>
            <p className="doc-sub">
              {totalCount === 0
                ? "Todo en orden — sin alertas activas en este momento."
                : `${groups.length} grupo(s) de alertas · ${totalCount} ítem(s) · ${criticalCount} crítico(s)`}
            </p>
          </div>
        </div>
      </section>

      <main className="content">
        {groups.length === 0 ? (
          <div className="sm-empty">
            <div className="sm-empty-icon" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="sm-empty-title">Sin alertas</div>
            <p className="sm-empty-desc">
              Cuando haya OC vencidas, líneas sin mapear, cadenas dormidas o problemas operacionales,
              aparecerán acá con la acción sugerida.
            </p>
          </div>
        ) : (
          <div className="alerts-stack">
            {groups.map((g) => (
              <article key={g.id} className={`alert-card sev-${g.severity}`}>
                <header className="alert-card-head">
                  <div className="alert-card-titles">
                    <div className="alert-card-meta">
                      <span className={`sev-badge sev-${g.severity}`}>{SEV_LABEL[g.severity]}</span>
                      <span className="alert-card-count">{g.count} ítem(s)</span>
                      <span className="alert-card-owner">→ {g.owner}</span>
                    </div>
                    <h2 className="alert-card-title">{g.title}</h2>
                    <p className="alert-card-desc">{g.description}</p>
                  </div>
                  {g.cta && (
                    <Link href={g.cta.href} className="alert-card-cta">
                      {g.cta.label}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M13 6l6 6-6 6"/>
                      </svg>
                    </Link>
                  )}
                </header>

                <ul className="alert-items">
                  {g.items.map((it) => (
                    <li key={it.id} className="alert-item">
                      <Link href={it.href} className="alert-item-link">
                        <div className="alert-item-main">
                          <span className="alert-item-label">{it.label}</span>
                          {it.detail && <span className="alert-item-detail">{it.detail}</span>}
                        </div>
                        <span className="alert-item-arrow">→</span>
                      </Link>
                    </li>
                  ))}
                  {g.hasMore && (
                    <li className="alert-item alert-item-more">
                      <span>+ {g.count - g.items.length} más</span>
                    </li>
                  )}
                </ul>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
