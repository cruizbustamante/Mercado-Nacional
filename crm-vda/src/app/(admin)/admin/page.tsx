import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const [
    { count: cClients },
    { count: cProducts },
    { count: cCategories },
    { count: cBrands },
    { count: cInsurance },
    { count: cProfiles },
    { count: cChannels },
    { count: cUpcTotal },
    { count: cUpcMatched },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("products").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("product_categories").select("*", { count: "exact", head: true }),
    supabase.from("brands").select("*", { count: "exact", head: true }),
    supabase.from("insurance_uploads").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("sales_channels").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("sku_upc_mapping").select("*", { count: "exact", head: true }),
    supabase.from("sku_upc_mapping").select("*", { count: "exact", head: true }).not("product_id", "is", null),
  ]);

  const total = (cClients ?? 0) + (cProducts ?? 0);

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Centro de administración</div>
            <h1 className="hero-title">Administración</h1>
            <p className="hero-sub">
              Mantención de los datos maestros del sistema. Edita registros uno por uno o usa los
              cargadores Excel para subir información en bloque.
            </p>
          </div>
        </div>

        <div className="health-strip">
          <div className="health-cell">
            <div className="health-key"><span className="health-dot"></span> Total registros</div>
            <div className="health-val">{total}</div>
            <div className="health-sub">{cClients ?? 0} clientes · {cProducts ?? 0} productos</div>
          </div>
          <div className="health-cell">
            <div className="health-key"><span className="health-dot"></span> Catálogo</div>
            <div className="health-val">{cCategories ?? 0}</div>
            <div className="health-sub">categorías · {cBrands ?? 0} marcas</div>
          </div>
          <div className="health-cell">
            <div className="health-key"><span className="health-dot"></span> Equipo activo</div>
            <div className="health-val">{cProfiles ?? 0}</div>
            <div className="health-sub">perfiles · {cChannels ?? 0} canales</div>
          </div>
          <div className="health-cell">
            <div className={`health-key`}><span className={`health-dot ${cInsurance ? "" : "warn"}`}></span> Cargas seguros</div>
            <div className="health-val">{cInsurance ?? 0}</div>
            <div className={`health-sub ${cInsurance ? "ok" : "warn"}`}>
              {cInsurance ? "histórico disponible" : "sin carga · pendiente"}
            </div>
          </div>
        </div>
      </section>

      <main className="content">
        <div className="block">
          <div className="block-head">
            <div className="block-title">
              <span className="block-title-num">1</span>
              <span className="block-title-text">Datos maestros<span className="block-sub">Listar, editar o crear registros uno por uno</span></span>
            </div>
            <span className="block-hint">Mantención individual</span>
          </div>

          <div className="cards-grid">
            <DataCard
              icon="clients"
              title="Clientes"
              desc="Base B2B con datos comerciales, dirección, condiciones de pago y vendedor asignado."
              pill={{ tone: "ok", text: "Al día" }}
              stats={[{ val: cClients ?? 0, key: "Registros" }]}
              href="/admin/clientes"
              iconSvg={<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />}
            />

            <DataCard
              icon="products"
              title="Productos"
              desc="Catálogo de SKUs con precios netos, brutos, mínimos, categorías y marcas."
              pill={cProducts && cProducts > 0 ? { tone: "ok", text: `${cCategories ?? 0} categorías` } : undefined}
              stats={[
                { val: cProducts ?? 0, key: "SKUs" },
                { val: cBrands ?? 0, key: "Marcas" },
              ]}
              href="/admin/productos"
              iconSvg={<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" /></>}
            />

            <DataCard
              icon="suppliers"
              title="Mapeo UPC ↔ SKU"
              desc="Código de barras (DUN/EAN) que viene en las OC de supermercados, vinculado al SKU interno."
              pill={(cUpcTotal ?? 0) > 0 && (cUpcMatched ?? 0) < (cUpcTotal ?? 0)
                ? { tone: "warn", text: `${(cUpcTotal ?? 0) - (cUpcMatched ?? 0)} sin SKU` }
                : { tone: "ok", text: "OK" }}
              stats={[
                { val: cUpcTotal ?? 0, key: "Variantes" },
                { val: cUpcMatched ?? 0, key: "Con SKU" },
              ]}
              href="/admin/mapeo-upc"
              iconSvg={<><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14"/></>}
            />

            <DataCard
              icon="zones"
              title="Ejecutivos / Canales"
              desc="Vendedores activos, canales (mayorista, supermercado). Próximamente."
              pill={{ tone: "default", text: "Próximamente" }}
              stats={[
                { val: cProfiles ?? 0, key: "Ejecutivos" },
                { val: cChannels ?? 0, key: "Canales" },
              ]}
              href="/admin"
              iconSvg={<><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></>}
              disabled
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
              desc="Sube los PDF / Word de las OC. Detecta cadena, parsea líneas y vincula a SKU vía mapeo UPC. No duplica."
              meta="Cencosud, Tottus, Rendic, Alvi, SCPD, Walmart"
              href="/admin/cargadores/oc-supermercados"
            />

            <LoaderCard
              title="Seguros (línea de crédito)"
              desc="Carga mensual. Sube Nominados + Innominados, valoriza en UF y actualiza línea aseguradora por cliente."
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
  icon, title, desc, pill, stats, href, iconSvg, disabled,
}: {
  icon: "clients" | "products" | "suppliers" | "zones";
  title: string;
  desc: string;
  pill?: { tone: "ok" | "warn" | "default"; text: string };
  stats: Array<{ val: number | string; key: string }>;
  href: string;
  iconSvg: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="data-card" style={disabled ? { opacity: 0.55 } : undefined}>
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
          {disabled ? "Ver más adelante" : "Listar y editar"}
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
