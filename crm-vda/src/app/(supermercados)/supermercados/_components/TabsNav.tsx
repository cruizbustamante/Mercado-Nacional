"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab { href: string; label: string }

const TAB_ICONS: Record<string, React.ReactNode> = {
  "/supermercados": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" /><path d="M3 12l4-4 4 6 6-8 4 4" />
    </svg>
  ),
  "/supermercados/analisis": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  "/supermercados/ordenes": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l-6 6v3h3l6-6" /><path d="M22 2L12 12" />
    </svg>
  ),
  "/supermercados/alertas": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  ),
};

export function TabsNav({ tabs }: { tabs: ReadonlyArray<Tab> }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/supermercados") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="sm-tabs-pill" role="tablist" aria-label="Secciones de Supermercados">
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={active ? "is-active" : ""}
            prefetch
          >
            {TAB_ICONS[t.href]}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
