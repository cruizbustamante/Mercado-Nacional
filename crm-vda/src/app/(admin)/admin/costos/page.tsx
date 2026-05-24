import { createClient } from "@/lib/supabase/server";
import { CostosModule } from "./CostosModule";

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category_name: string | null;
  brand_name: string | null;
  wine_line: string | null;
  grape: string | null;
  base_price_net: number;
  iva_rate: number;
  ila_rate: number;
  unit_cost_net: number | null;
  is_active: boolean;
  costs: Record<string, number>;
}

export interface RappelRow {
  id: string;
  chain_id: string;
  chain_name: string;
  client_rut: string | null;
  client_name: string | null;
  label: string | null;
  rappel_pct: number;
  centralizacion_pct: number;
  merma_pct: number;
  extra_net_pct: number | null;
  extra_net_fixed: string | null;
  reposicion_pct: number;
  total_pct: number;
  fecha_acuerdo: string | null;
  fecha_actualizacion: string | null;
  is_active: boolean;
}

export interface ChainOption {
  id: string;
  name: string;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export default async function CostosPage() {
  const supabase = await createClient();

  const [productsRes, costsRes, chainsRes, rappelRes, logisticRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, unit_cost_net, base_price_net, iva_rate, ila_rate, wine_line, grape, is_active, category:product_categories(name), brand:brands(name)")
      .is("deleted_at", null)
      .order("sku"),
    supabase
      .from("product_costs")
      .select("product_id, quarter, unit_cost_net")
      .order("quarter"),
    supabase
      .from("supermarket_chains")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("rappel_agreements")
      .select("*, chain:supermarket_chains(id, name, client:clients(rut_body, rut_dv, name))")
      .order("created_at"),
    supabase
      .from("logistics_costs")
      .select("cost_net_per_unit")
      .is("product_id", null)
      .is("warehouse_id", null)
      .is("client_id", null)
      .maybeSingle(),
  ]);

  const costsByProduct = new Map<string, Record<string, number>>();
  const allQuarters = new Set<string>();
  for (const c of costsRes.data ?? []) {
    allQuarters.add(c.quarter);
    const map = costsByProduct.get(c.product_id) ?? {};
    map[c.quarter] = c.unit_cost_net;
    costsByProduct.set(c.product_id, map);
  }

  const products: ProductRow[] = (
    (productsRes.data ?? []) as unknown as Array<{
      id: string; sku: string; name: string; unit_cost_net: number | null;
      base_price_net: number; iva_rate: number; ila_rate: number;
      wine_line: string | null; grape: string | null; is_active: boolean;
      category: { name: string } | null;
      brand: { name: string } | null;
    }>
  ).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category_name: p.category?.name ?? null,
    brand_name: p.brand?.name ?? null,
    wine_line: p.wine_line,
    grape: p.grape,
    base_price_net: p.base_price_net,
    iva_rate: p.iva_rate,
    ila_rate: p.ila_rate,
    unit_cost_net: p.unit_cost_net,
    is_active: p.is_active,
    costs: costsByProduct.get(p.id) ?? {},
  }));

  const quarters = Array.from(allQuarters).sort();

  const rappel: RappelRow[] = (
    (rappelRes.data ?? []) as unknown as Array<{
      id: string; chain_id: string; label: string | null;
      rappel_pct: number; centralizacion_pct: number; merma_pct: number;
      extra_net_pct: number | null; extra_net_fixed: string | null;
      reposicion_pct: number; total_pct: number;
      fecha_acuerdo: string | null; fecha_actualizacion: string | null;
      is_active: boolean;
      chain: { id: string; name: string; client: { rut_body: number; rut_dv: string; name: string } | null } | null;
    }>
  ).map((r) => {
    const cl = r.chain?.client;
    return {
      id: r.id,
      chain_id: r.chain_id,
      chain_name: r.chain?.name ?? "?",
      client_rut: cl ? `${cl.rut_body.toLocaleString("es-CL").replace(/\./g, ".")}-${cl.rut_dv}` : null,
      client_name: cl?.name ?? null,
      label: r.label,
      rappel_pct: Number(r.rappel_pct),
      centralizacion_pct: Number(r.centralizacion_pct),
      merma_pct: Number(r.merma_pct),
      extra_net_pct: r.extra_net_pct != null ? Number(r.extra_net_pct) : null,
      extra_net_fixed: r.extra_net_fixed,
      reposicion_pct: Number(r.reposicion_pct),
      total_pct: Number(r.total_pct),
      fecha_acuerdo: r.fecha_acuerdo,
      fecha_actualizacion: r.fecha_actualizacion,
      is_active: r.is_active,
    };
  });

  const chains: ChainOption[] = (chainsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const currentQuarter = getCurrentQuarter();
  const productsWithCost = products.filter((p) => Object.keys(p.costs).length > 0).length;
  const logisticCostPerUnit = (logisticRes.data as unknown as { cost_net_per_unit: number } | null)?.cost_net_per_unit ?? 0;

  return (
    <CostosModule
      products={products}
      quarters={quarters}
      currentQuarter={currentQuarter}
      rappel={rappel}
      chains={chains}
      logisticCostPerUnit={logisticCostPerUnit}
      stats={{
        totalProducts: products.length,
        productsWithCost,
        currentQuarter,
        activeRappel: rappel.filter((r) => r.is_active).length,
      }}
    />
  );
}
