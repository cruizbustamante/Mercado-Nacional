import { redirect } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { getCurrentProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import "./theme.css";
import "./supermercados/supermercados.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default async function SupermercadosLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className={`sm-shell ${inter.variable}`}>
      {/* Slim topbar: link CRM + user + logout */}
      <div className="border-b border-line bg-bg-surface">
        <div className="max-w-[1440px] mx-auto px-8 py-2 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-2 hover:text-ink transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver al CRM
          </Link>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full text-white text-[10px] font-medium inline-flex items-center justify-center"
                style={{ background: profile.color ?? "#5F5E5A" }}
              >
                {profile.initials ?? "??"}
              </div>
              <div className="text-[11px] leading-tight">
                <div className="text-ink font-medium">{profile.short_name ?? profile.full_name}</div>
                <div className="text-ink-3">{profile.email}</div>
              </div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="w-6 h-6 inline-flex items-center justify-center text-ink-3 hover:text-ink hover:bg-bg-muted rounded transition-colors"
                title="Cerrar sesión"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      <main className="max-w-[1440px] mx-auto px-8 py-6">{children}</main>
    </div>
  );
}
