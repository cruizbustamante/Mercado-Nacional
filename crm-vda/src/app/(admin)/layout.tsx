import { redirect } from "next/navigation";
import Link from "next/link";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getCurrentProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import "../warm.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--f-display", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role?.name !== "admin") redirect("/");

  return (
    <div className={`warm ${fraunces.variable} ${instrument.variable} ${mono.variable}`}>
      <header className="app-header">
        <Link href="/" className="brand">
          <div className="brand-mark">MN</div>
          <span className="brand-name">Mercado Nacional</span>
          <span className="brand-sub">· Admin</span>
        </Link>
        <div className="divider-v"></div>
        <nav className="crumbs">
          <Link href="/">Inicio</Link>
          <span className="sep">/</span>
          <Link href="/admin" className="here">Administración</Link>
        </nav>
        <div className="header-spacer"></div>
        <div className="header-user">
          <div className="user-avatar" style={{ background: profile.color ? `linear-gradient(135deg, ${profile.color} 0%, #4A453D 100%)` : undefined }}>
            {profile.initials ?? "??"}
          </div>
          <div className="user-info">
            <strong>{profile.short_name ?? profile.full_name}</strong>
            <span>{profile.email}</span>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className="btn-logout">
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Salir
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
