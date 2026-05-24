import Link from "next/link";
import { redirect } from "next/navigation";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ICONS, MODULE_ROUTES } from "@/lib/modules";
import { logout } from "@/app/login/actions";
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

  return (
    <div className={`warm ${fraunces.variable} ${instrument.variable} ${mono.variable}`} style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{
        width: 240,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ height: "var(--header-h)", display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/" className="brand">
            <div className="brand-mark">MN</div>
            <span className="brand-name">Mercado Nacional</span>
          </Link>
        </div>
        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {modules.map((m) => (
            <Link
              key={m.id}
              href={MODULE_ROUTES[m.name] ?? "/"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                fontSize: 13,
                color: "var(--text-2)",
                borderRadius: "var(--r-sm)",
                marginBottom: 2,
                textDecoration: "none",
                transition: "background-color 120ms",
              }}
              className="dash-nav-link"
            >
              <span style={{
                fontSize: 16,
                width: 24,
                height: 24,
                display: "inline-grid",
                placeItems: "center",
              }}>
                {MODULE_ICONS[m.icon ?? ""] ?? "•"}
              </span>
              <span>{m.display_name}</span>
            </Link>
          ))}
          {profile.role?.name === "admin" && (
            <>
              <div style={{ marginTop: 16, marginBottom: 4, padding: "0 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-3)" }}>
                Administración
              </div>
              <Link
                href="/admin"
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", fontSize: 13, color: "var(--text-2)",
                  borderRadius: "var(--r-sm)", marginBottom: 2, textDecoration: "none",
                }}
                className="dash-nav-link"
              >
                <span style={{ fontSize: 16, width: 24, height: 24, display: "inline-grid", placeItems: "center" }}>⚙️</span>
                <span>Centro de admin</span>
              </Link>
            </>
          )}
        </nav>
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: profile.color ?? "var(--text-3)",
              color: "white",
              display: "grid", placeItems: "center",
              fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 600,
            }}
          >
            {profile.initials ?? "??"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile.short_name ?? profile.full_name}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              {profile.role?.display_name}
            </div>
          </div>
          <form action={logout}>
            <button type="submit" title="Salir" style={{
              width: 28, height: 28, padding: 0,
              border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              background: "var(--surface)", color: "var(--text-3)",
              cursor: "pointer", display: "grid", placeItems: "center",
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflow: "auto", background: "var(--bg)" }}>
        {children}
      </main>
      <style>{`.warm .dash-nav-link:hover { background: var(--surface-2); color: var(--text); }`}</style>
    </div>
  );
}
