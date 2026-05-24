"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab { href: string; label: string }

export function TabsNav({ tabs }: { tabs: ReadonlyArray<Tab> }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/supermercados") {
      // Cumplimiento es exact (no debe activarse para sub-rutas)
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="sm-tabs" role="tablist" aria-label="Secciones de Supermercados">
      <div className="sm-tabs-inner">
        {tabs.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={active}
              className={`sm-tab ${active ? "is-active" : ""}`}
              prefetch
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
