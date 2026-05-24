import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import pkg from "../../../package.json";
import "./login.css";

export const revalidate = 60;

async function getStats() {
  const supabase = await createClient();
  const [products, clients, chains] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("supermarket_chains").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  return {
    products: products.count ?? 0,
    clients: clients.count ?? 0,
    chains: chains.count ?? 0,
  };
}

export default async function LoginPage() {
  const stats = await getStats();
  const version = (pkg as { version: string }).version;

  return (
    <div className="login-page">
      <aside className="brand-side">
        <div className="brand-top">
          <div className="brand-mark">MN</div>
          <div className="brand-name">
            Mercado Nacional
            <span className="brand-name-sub">Sistema de gestión comercial</span>
          </div>
        </div>

        <div className="brand-center">
          <div className="brand-eyebrow">Bienvenido</div>
          <h1 className="brand-title">
            Gestión <span className="accent">comercial</span><br />
            con datos al día.
          </h1>
          <p className="brand-desc">
            Notas de venta, supermercados, cobranza, control de stock y reportes
            en un solo lugar — para tomar decisiones con la información de hoy.
          </p>
        </div>

        <div className="brand-foot">
          <div className="brand-stats">
            <div className="brand-stat">
              <span className="brand-stat-val">{stats.products.toLocaleString("es-CL")}</span>
              <span className="brand-stat-key">SKUs activos</span>
            </div>
            <div className="brand-stat">
              <span className="brand-stat-val">{stats.clients.toLocaleString("es-CL")}</span>
              <span className="brand-stat-key">Clientes</span>
            </div>
            <div className="brand-stat">
              <span className="brand-stat-val">{stats.chains.toLocaleString("es-CL")}</span>
              <span className="brand-stat-key">Cadenas</span>
            </div>
          </div>
          <div className="brand-version">v {version}</div>
        </div>
      </aside>

      <main className="form-side">
        <div className="form-wrap">
          <div className="form-top">
            <a href="mailto:cruiz@deaguirre.cl?subject=Soporte%20Mercado%20Nacional">
              ¿Necesitas ayuda? Contactar soporte →
            </a>
          </div>

          <div className="form-eyebrow">Iniciar sesión</div>
          <h2 className="form-title">Bienvenido de vuelta</h2>
          <p className="form-sub">Ingresa tus credenciales corporativas para continuar.</p>

          <LoginForm />

          <div className="form-foot">
            <span>© {new Date().getFullYear()} Viña de Aguirre · Mercado Nacional</span>
            <span className="form-foot-mono">v {version}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
