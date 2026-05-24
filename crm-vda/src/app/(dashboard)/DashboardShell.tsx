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
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <div className={`dash-shell ${open ? "drawer-open" : ""}`}>
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

      <aside className="dash-sidebar">
        {sidebar}
      </aside>

      {/* Backdrop only visible when open on mobile */}
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
