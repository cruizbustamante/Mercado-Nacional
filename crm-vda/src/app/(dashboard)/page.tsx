import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ICONS, MODULE_ROUTES } from "@/lib/modules";
import { getModuleStats, type ModuleStats } from "@/lib/home-stats";

export const revalidate = 60;

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const modules = await getUserModules(profile.id, profile.role_id);

  // Stats live por módulo en paralelo
  const statsByModule = new Map<string, ModuleStats>();
  await Promise.all(
    modules.map(async (m) => {
      statsByModule.set(m.id, await getModuleStats(m.name));
    })
  );

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Sistema de gestión comercial</div>
            <h1 className="hero-title">Hola, {profile.short_name ?? profile.full_name}</h1>
            <p className="hero-sub">
              {profile.role?.display_name} · {modules.length} módulos disponibles según tu rol.
            </p>
          </div>
        </div>
      </section>

      <main className="content">
        <div className="cards-grid">
          {modules.map((m) => {
            const href = MODULE_ROUTES[m.name] ?? "/";
            const ms = statsByModule.get(m.id);
            const tint = m.color ?? "#666";
            const primary = ms?.actions.find((a) => a.primary);
            const secondary = ms?.actions.filter((a) => !a.primary) ?? [];

            return (
              <article key={m.id} className="data-card module-card">
                <div className="data-card-body">
                  <div className="data-card-icon-row">
                    <Link href={href} className="module-card-head" aria-label={`Abrir ${m.display_name}`}>
                      <div
                        className="data-card-icon module"
                        style={{ background: tint + "1A", color: tint }}
                      >
                        <span style={{ fontSize: 22, lineHeight: 1 }}>
                          {MODULE_ICONS[m.icon ?? ""] ?? "•"}
                        </span>
                      </div>
                      <div className="module-card-titles">
                        <div className="data-card-name">{m.display_name}</div>
                        {m.description && <div className="module-card-desc">{m.description}</div>}
                      </div>
                    </Link>
                    {primary && (
                      <Link href={primary.href} className="data-card-pill primary-action">
                        {primary.label}
                      </Link>
                    )}
                  </div>

                  {ms && ms.stats.length > 0 && (
                    <div className="module-stats">
                      {ms.stats.map((s, i) => (
                        <div key={`${s.key}-${i}`} className="module-stat">
                          <span className={`module-stat-val ${s.tone ?? ""}`}>{s.val}</span>
                          <span className="module-stat-key">{s.key}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {ms?.alert && (
                    ms.alert.href ? (
                      <Link href={ms.alert.href} className={`module-alert tone-${ms.alert.tone}`}>
                        <span className="module-alert-dot" />
                        {ms.alert.text}
                        <span className="module-alert-arrow">→</span>
                      </Link>
                    ) : (
                      <div className={`module-alert tone-${ms.alert.tone}`}>
                        <span className="module-alert-dot" />
                        {ms.alert.text}
                      </div>
                    )
                  )}
                </div>

                <div className="data-card-foot">
                  {secondary.length > 0 ? (
                    secondary.map((a) => (
                      <Link key={a.href} href={a.href}>
                        {a.label}
                      </Link>
                    ))
                  ) : (
                    <Link href={href} className="primary">
                      Abrir módulo
                      <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M5 12h14M13 6l6 6-6 6"/>
                      </svg>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
