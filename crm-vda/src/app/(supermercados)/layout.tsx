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
  { href: "/supermercados/analisis", label: "Análisis comercial" },
  { href: "/supermercados/ordenes",  label: "Órdenes (OC)" },
  { href: "/supermercados/alertas",  label: "Alertas" },
] as const;

export default async function SupermercadosLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className={`warm sm-shell ${fraunces.variable} ${instrument.variable} ${mono.variable}`}>
      <header className="sm-header">
        <Link href="/" className="brand" aria-label="Volver al inicio">
          <div className="brand-mark">MN</div>
          <div className="brand-name-block">
            <span className="brand-name">Mercado Nacional</span>
            <span className="brand-sub">Supermercados</span>
          </div>
        </Link>

        <div className="divider-v" />

        <nav className="crumbs" aria-label="breadcrumb">
          <Link href="/">Inicio</Link>
          <span className="sep">/</span>
          <Link href="/supermercados" className="here">Supermercados</Link>
        </nav>

        <div className="header-spacer" />

        <Link href="/admin/cargadores/oc-supermercados" className="sm-header-cta">
          <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          Cargar OC
        </Link>

        <div className="header-user">
          <div
            className="user-avatar"
            style={{ background: profile.color ? `linear-gradient(135deg, ${profile.color} 0%, #4A453D 100%)` : undefined }}
          >
            {profile.initials ?? "??"}
          </div>
          <div className="user-info">
            <strong>{profile.short_name ?? profile.full_name}</strong>
            <span>{profile.email}</span>
          </div>
        </div>

        <form action={logout}>
          <button type="submit" className="btn-logout" title="Cerrar sesión">
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>
        </form>
      </header>

      <TabsNav tabs={TABS} />

      <main className="sm-main">{children}</main>
    </div>
  );
}
