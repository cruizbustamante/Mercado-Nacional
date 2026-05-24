import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ICONS, MODULE_ROUTES } from "@/lib/modules";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const modules = await getUserModules(profile.id, profile.role_id);

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Sistema de gestión comercial</div>
            <h1 className="hero-title">Hola, {profile.short_name ?? profile.full_name}</h1>
            <p className="hero-sub">
              {profile.role?.display_name} · {modules.length} módulos disponibles según tu rol.
              Selecciona uno abajo para empezar.
            </p>
          </div>
        </div>
      </section>

      <main className="content">
        <div className="cards-grid">
          {modules.map((m) => {
            const href = MODULE_ROUTES[m.name] ?? "/";
            return (
              <Link key={m.id} href={href} className="data-card">
                <div className="data-card-body">
                  <div className="data-card-icon-row">
                    <div className="data-card-icon module" style={{
                      background: (m.color ?? "#666") + "1A",
                      color: m.color ?? "var(--text)",
                    }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>
                        {MODULE_ICONS[m.icon ?? ""] ?? "•"}
                      </span>
                    </div>
                    {m.can_edit && <span className="data-card-pill ok">edición</span>}
                  </div>
                  <div className="data-card-name">{m.display_name}</div>
                  {m.description && <div className="data-card-desc">{m.description}</div>}
                </div>
                <div className="data-card-foot">
                  <span className="primary">
                    Abrir módulo
                    <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
