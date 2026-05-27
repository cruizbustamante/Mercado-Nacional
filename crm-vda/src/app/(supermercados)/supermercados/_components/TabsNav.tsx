"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabDef {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const TAB_DEFS: TabDef[] = [
  {
    href: "/supermercados",
    label: "Cumplimiento",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18M7 16l4-4 4 4 6-6" />
      </svg>
    ),
  },
  {
    href: "/supermercados/analisis",
    label: "Análisis",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
  {
    href: "/supermercados/ordenes",
    label: "Órdenes",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      </svg>
    ),
  },
  {
    href: "/supermercados/alertas",
    label: "Alertas",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
    ),
  },
];

export function TabsNav({
  ordenesCount,
  alertasCount,
}: {
  ordenesCount?: number;
  alertasCount?: number;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/supermercados") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const badges: Record<string, { value: number; tone: "neutral" | "danger" } | undefined> = {
    "/supermercados/ordenes": ordenesCount != null ? { value: ordenesCount, tone: "neutral" } : undefined,
    "/supermercados/alertas": alertasCount != null ? { value: alertasCount, tone: "danger" } : undefined,
  };

  return (
    <nav className="flex items-center gap-1" aria-label="Pestañas Supermercados">
      {TAB_DEFS.map((tab) => {
        const active = isActive(tab.href);
        const badge = badges[tab.href];
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            className={`text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${
              active
                ? "bg-wine text-white font-medium"
                : "text-ink-2 hover:bg-bg-muted"
            }`}
          >
            {tab.icon}
            {tab.label}
            {badge && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full tabular ${
                  active
                    ? "bg-white/15"
                    : badge.tone === "danger"
                    ? "bg-neg-soft text-neg font-medium"
                    : "bg-bg-muted text-ink-2"
                }`}
              >
                {badge.value}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
