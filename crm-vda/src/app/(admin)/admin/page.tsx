import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const [
    { count: cClients },
    { count: cProducts },
    { count: cInsurance },
    { count: cUpcTotal },
    { count: cUpcMatched },
    { count: cProductCosts },
    { count: cRappel },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("products").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("insurance_uploads").select("*", { count: "exact", head: true }),
    supabase.from("sku_upc_mapping").select("*", { count: "exact", head: true }),
    supabase.from("sku_upc_mapping").select("*", { count: "exact", head: true }).not("product_id", "is", null),
    supabase.from("product_costs").select("*", { count: "exact", head: true }),
    supabase.from("rappel_agreements").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Centro de administración</div>
            <h1 className="hero-title">Administración</h1>
            <p className="hero-sub">
              Cargadores Excel y herramientas de soporte. La gestión de fichas maestras
              (productos, clientes, ejecutivos, canales) está en el módulo Configuración del sidebar.
            </p>
          </div>
        </div>
      </section>

      <main className="content">
        <div className="block">
          <div className="block-head">
            <div className="block-title">
              <span className="block-title-num">1</span>
              <span className="block-title-text">Herramientas<span className="block-sub">Mapeos y costos</span></span>
            </div>
          </div>

          <div className="cards-grid">
            <DataCard
              icon="suppliers"
              title="Mapeo Supermercados (DUN ↔ SKU)"
              desc="Código DUN/EAN de OC supermercados vinculado a SKU interno."
              pill={(cUpcTotal ?? 0) > 0 && (cUpcMatched ?? 0) < (cUpcTotal ?? 0)
                ? { tone: "warn", text: `${(cUpcTotal ?? 0) - (cUpcMatched ?? 0)} sin SKU` }
                : (cUpcTotal ?? 0) === 0
                  ? { tone: "warn", text: "vacío" }
                  : { tone: "ok", text: "OK" }}
              stats={[
                { val: cUpcTotal ?? 0, key: "DUN" },
                { val: cUpcMatched ?? 0, key: "Con SKU" },
              ]}
              href="/admin/mapeo-upc"
              iconSvg={<><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14"/></>}
            />

            <DataCard
              icon="costs"
              title="Costos y Rappel"
              desc="Importar costos trimestrales y gestionar acuerdos rappel con cadenas."
              pill={(cProductCosts ?? 0) > 0 ? { tone: "ok", text: `${cRappel ?? 0} rappel` } : { tone: "warn", text: "sin costos" }}
              stats={[
                { val: cProductCosts ?? 0, key: "Costos" },
                { val: cRappel ?? 0, key: "Rappel" },
              ]}
              href="/admin/costos"
              iconSvg={<><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>}
            />
          </div>
        </div>

        <div className="block">
          <div className="block-head">
            <div className="block-title">
              <span className="block-title-num">2</span>
              <span className="block-title-text">Cargadores Excel<span className="block-sub">Carga masiva desde planilla</span></span>
            </div>
            <span className="block-hint">Carga en bloque</span>
          </div>

          <div className="loader-grid">
            <LoaderCard
              title="Clientes"
              desc="Upsert por RUT. Crea condiciones de pago nuevas automáticamente."
              meta={`${cClients ?? 0} actuales`}
              href="/admin/cargadores/clientes"
            />
            <LoaderCard
              title="Productos"
              desc="Upsert por SKU. Crea categorías y marcas automáticamente."
              meta={`${cProducts ?? 0} actuales`}
              href="/admin/cargadores/productos"
            />
            <LoaderCard
              title="OC Supermercados"
              desc="Sube los PDF / Word de las OC. Detecta cadena, parsea líneas y vincula a SKU vía mapeo UPC."
              meta="Cencosud, Tottus, Rendic, Alvi, SCPD, Walmart"
              href="/admin/cargadores/oc-supermercados"
            />
            <LoaderCard
              title="Seguros (línea de crédito)"
              desc="Carga mensual. Sube Nominados + Innominados, valoriza en UF y actualiza línea aseguradora."
              meta={cInsurance ? `${cInsurance} cargas` : "sin cargas"}
              href="/admin/cargadores/seguros"
              special
            />
          </div>
        </div>
      </main>
    </>
  );
}

function DataCard({
  icon, title, desc, pill, stats, href, iconSvg,
}: {
  icon: "suppliers" | "costs";
  title: string;
  desc: string;
  pill?: { tone: "ok" | "warn" | "default"; text: string };
  stats: Array<{ val: number | string; key: string }>;
  href: string;
  iconSvg: React.ReactNode;
}) {
  return (
    <div className="data-card">
      <div className="data-card-body">
        <div className="data-card-icon-row">
          <div className={`data-card-icon ${icon}`}>
            <svg className="i-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{iconSvg}</svg>
          </div>
          {pill && (
            <span className={`data-card-pill ${pill.tone === "ok" ? "ok" : pill.tone === "warn" ? "warn" : ""}`}>
              {pill.text}
            </span>
          )}
        </div>
        <div className="data-card-name">{title}</div>
        <div className="data-card-desc">{desc}</div>
        <div className="data-card-stats">
          {stats.map((s) => (
            <div key={s.key} className="data-stat">
              <span className="data-stat-val">{s.val}</span>
              <span className="data-stat-key">{s.key}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="data-card-foot">
        <Link href={href} className="primary">
          <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          Abrir
        </Link>
      </div>
    </div>
  );
}

function LoaderCard({
  title, desc, meta, href, special,
}: { title: string; desc: string; meta: string; href: string; special?: boolean }) {
  return (
    <Link href={href} className={`loader-card ${special ? "special" : ""}`}>
      <div className="loader-card-head">
        <div className="loader-card-title">{title}</div>
        <div className="loader-card-meta">{meta}</div>
      </div>
      <div className="loader-card-desc">{desc}</div>
    </Link>
  );
}
