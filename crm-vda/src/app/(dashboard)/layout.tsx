import Link from "next/link";
import { redirect } from "next/navigation";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ICONS, MODULE_ROUTES } from "@/lib/modules";
import { logout } from "@/app/login/actions";
import { DashboardShell } from "./DashboardShell";
import "../warm.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--f-display", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const modules = await getUserModules(profile.id, profile.role_id);

  const sidebar = (
    <>
      <div className="dash-sidebar-head">
        <Link href="/" className="brand">
          <div className="brand-mark">MN</div>
          <span className="brand-name">Mercado Nacional</span>
        </Link>
      </div>
      <nav className="dash-sidebar-nav">
        {modules.map((m) => (
          <Link
            key={m.id}
            href={MODULE_ROUTES[m.name] ?? "/"}
            className="dash-nav-link"
          >
            <span className="dash-nav-icon">
              {MODULE_ICONS[m.icon ?? ""] ?? "•"}
            </span>
            <span>{m.display_name}</span>
          </Link>
        ))}
        {profile.role?.name === "admin" && (
          <>
            <div className="dash-nav-section">Administración</div>
            <Link href="/admin" className="dash-nav-link">
              <span className="dash-nav-icon">⚙️</span>
              <span>Centro de admin</span>
            </Link>
          </>
        )}
      </nav>
      <div className="dash-sidebar-foot">
        <div
          className="dash-avatar"
          style={{ background: profile.color ?? "var(--text-3)" }}
        >
          {profile.initials ?? "??"}
        </div>
        <div className="dash-user-info">
          <div className="dash-user-name">{profile.short_name ?? profile.full_name}</div>
          <div className="dash-user-role">{profile.role?.display_name}</div>
        </div>
        <form action={logout}>
          <button type="submit" title="Salir" className="dash-logout-btn">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className={`warm ${fraunces.variable} ${instrument.variable} ${mono.variable}`}>
      <DashboardShell sidebar={sidebar}>{children}</DashboardShell>
    </div>
  );
}
