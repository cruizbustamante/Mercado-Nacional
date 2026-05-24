"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface ModuleLink {
  name: string;
  display_name: string;
  href: string;
  implemented: boolean;
}

interface Props {
  modules: ModuleLink[];
  isAdmin: boolean;
  profile: {
    initials: string | null;
    short_name: string | null;
    full_name: string;
    role_display: string;
    color: string | null;
  };
  logoutAction: () => Promise<void>;
}

const ICONS: Record<string, React.ReactNode> = {
  emisor_nv: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  despacho: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  stock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  finanzas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  oc_supermercados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  costos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  configuracion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
};

export function SidebarNav({ modules, isAdmin, profile, logoutAction }: Props) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      <div className="dash-sidebar-head">
        <Link href="/" className="brand">
          <div className="brand-mark">MN</div>
          <span className="brand-name">Mercado Nacional</span>
        </Link>
      </div>

      <nav className="dash-sidebar-nav">
        <Link href="/" className={`dash-nav-link ${isActive("/") && pathname === "/" ? "active" : ""}`}>
          <span className="dash-nav-icon-svg">{ICONS.home}</span>
          <span>Inicio</span>
        </Link>

        <div className="dash-nav-section">Operaciones</div>
        {modules.map((m) => {
          const active = isActive(m.href);
          const disabled = !m.implemented;
          if (disabled) {
            return (
              <div key={m.name} className="dash-nav-link disabled" title="Próximamente">
                <span className="dash-nav-icon-svg">{ICONS[m.name] ?? ICONS.home}</span>
                <span>{m.display_name}</span>
                <span className="dash-nav-badge">pronto</span>
              </div>
            );
          }
          return (
            <Link
              key={m.name}
              href={m.href}
              className={`dash-nav-link ${active ? "active" : ""}`}
            >
              <span className="dash-nav-icon-svg">{ICONS[m.name] ?? ICONS.home}</span>
              <span>{m.display_name}</span>
            </Link>
          );
        })}

        <div className="dash-nav-section">Gestión</div>
        <Link href="/configuracion/productos" className={`dash-nav-link ${isActive("/configuracion") ? "active" : ""}`}>
          <span className="dash-nav-icon-svg">{ICONS.configuracion}</span>
          <span>Configuración</span>
        </Link>

        {isAdmin && (
          <>
            <div className="dash-nav-section">Administración</div>
            <Link href="/admin" className={`dash-nav-link ${isActive("/admin") && !isActive("/admin/costos") ? "active" : ""}`}>
              <span className="dash-nav-icon-svg">{ICONS.admin}</span>
              <span>Cargadores y Mapeos</span>
            </Link>
            <Link href="/admin/costos" className={`dash-nav-link ${isActive("/admin/costos") ? "active" : ""}`}>
              <span className="dash-nav-icon-svg">{ICONS.costos}</span>
              <span>Costos y Rappel</span>
            </Link>
          </>
        )}
      </nav>

      <div className="dash-sidebar-foot">
        <div className="dash-avatar" style={{ background: profile.color ?? "var(--text-3)" }}>
          {profile.initials ?? "??"}
        </div>
        <div className="dash-user-info">
          <div className="dash-user-name">{profile.short_name ?? profile.full_name}</div>
          <div className="dash-user-role">{profile.role_display}</div>
        </div>
        <form action={logoutAction}>
          <button type="submit" title="Salir" className="dash-logout-btn">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}

