"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/configuracion/productos", label: "Productos" },
  { href: "/configuracion/clientes", label: "Clientes" },
  { href: "/configuracion/ejecutivos", label: "Ejecutivos" },
  { href: "/configuracion/canales", label: "Canales de Venta" },
];

export function ConfigNav() {
  const pathname = usePathname();

  return (
    <div className="config-nav">
      <div className="config-nav-inner">
        <h2 className="config-nav-title">Configuración</h2>
        <nav className="config-tabs">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`config-tab ${pathname.startsWith(t.href) ? "active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
