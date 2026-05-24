"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <div className={`dash-shell ${open ? "drawer-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Mobile top bar */}
      <div className="dash-mobile-bar">
        <button
          type="button"
          className="dash-hamburger"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </button>
        <div className="dash-mobile-brand">
          <div className="brand-mark">MN</div>
          <span>Mercado Nacional</span>
        </div>
      </div>

      {/* Desktop collapse toggle */}
      <button
        type="button"
        className="dash-collapse-btn"
        title={collapsed ? "Mostrar menú" : "Ocultar menú"}
        onClick={() => setCollapsed((v) => !v)}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <aside className="dash-sidebar">
        {sidebar}
      </aside>

      <button
        type="button"
        className="dash-backdrop"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />

      <main className="dash-main">
        {children}
      </main>
    </div>
  );
}
