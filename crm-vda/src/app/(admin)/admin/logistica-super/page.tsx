import { createClient } from "@/lib/supabase/server";
import { getAllLogisticsCostRules } from "@/lib/supermarket-logistics";
import { LogisticaSuperModule } from "./LogisticaSuperModule";

export default async function LogisticaSuperPage() {
  const supabase = await createClient();

  const [rules, { data: brands }, { data: chains }] = await Promise.all([
    getAllLogisticsCostRules(),
    supabase
      .from("brands")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("supermarket_chains")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Configuración Supermercados</div>
            <h1 className="hero-title">Logística Supermercados</h1>
            <p className="hero-sub">
              Costo logístico por unidad, configurable por marca y cadena.
              El sistema busca regla específica (marca+cadena), luego por marca, luego por cadena, y finalmente el valor por defecto.
            </p>
          </div>
        </div>
      </section>

      <main className="content">
        <LogisticaSuperModule
          rules={rules}
          brands={(brands ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
          chains={(chains ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
        />
      </main>
    </>
  );
}
