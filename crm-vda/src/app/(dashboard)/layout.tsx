import { redirect } from "next/navigation";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { MODULE_ROUTES } from "@/lib/modules";
import { logout } from "@/app/login/actions";
import { DashboardShell } from "./DashboardShell";
import { SidebarNav } from "./SidebarNav";
import "../warm.css";

const IMPLEMENTED_MODULES = new Set(["emisor_nv", "oc_supermercados", "configuracion", "finanzas", "facturacion"]);

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

  const moduleLinks = modules.map((m) => ({
    name: m.name,
    display_name: m.display_name,
    href: MODULE_ROUTES[m.name] ?? "/",
    implemented: IMPLEMENTED_MODULES.has(m.name),
  }));

  const sidebar = (
    <SidebarNav
      modules={moduleLinks}
      isAdmin={profile.role?.name === "admin"}
      profile={{
        initials: profile.initials ?? null,
        short_name: profile.short_name ?? null,
        full_name: profile.full_name,
        role_display: profile.role?.display_name ?? "",
        color: profile.color ?? null,
      }}
      logoutAction={logout}
    />
  );

  return (
    <div className={`warm ${fraunces.variable} ${instrument.variable} ${mono.variable}`}>
      <DashboardShell sidebar={sidebar}>{children}</DashboardShell>
    </div>
  );
}
