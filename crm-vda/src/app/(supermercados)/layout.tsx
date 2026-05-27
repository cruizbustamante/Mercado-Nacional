import { redirect } from "next/navigation";
import Link from "next/link";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getCurrentProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { TabsNav } from "./supermercados/_components/TabsNav";
import "../warm.css";
import "./supermercados/supermercados.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--f-display", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

const TABS = [
  { href: "/supermercados",          label: "Cumplimiento" },
  { href: "/supermercados/analisis", label: "Análisis" },
  { href: "/supermercados/ordenes",  label: "Órdenes" },
  { href: "/supermercados/alertas",  label: "Alertas" },
] as const;

export default async function SupermercadosLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className={`warm sm-shell ${fraunces.variable} ${instrument.variable} ${mono.variable}`}>
      <header className="sm-header">
        <div className="sm-header-row">
          <div className="sm-header-left">
            <Link href="/" className="sm-brand" aria-label="Volver al inicio">
              <div className="sm-brand-logo">MN</div>
              <div className="sm-brand-text">
                <b>Mercado Nacional</b>
                <span>Supermercados</span>
              </div>
            </Link>
            <nav className="sm-crumbs" aria-label="breadcrumb">
              <Link href="/">Inicio</Link>
              <span className="sep">&rsaquo;</span>
              <span className="current">Supermercados</span>
            </nav>
          </div>

          <TabsNav tabs={TABS} />

          <div className="sm-header-right">
            <div className="sm-user-chip">
              <div
                className="sm-user-avatar"
                style={{ background: profile.color ?? undefined }}
              >
                {profile.initials ?? "??"}
              </div>
              <div className="sm-user-info">
                <b>{profile.short_name ?? profile.full_name}</b>
                <span>{profile.email}</span>
              </div>
            </div>
            <form action={logout}>
              <button type="submit" className="sm-btn-logout" title="Cerrar sesión">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="sm-main">{children}</main>
    </div>
  );
}
