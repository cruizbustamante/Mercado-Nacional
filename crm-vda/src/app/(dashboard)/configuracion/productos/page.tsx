import { createClient } from "@/lib/supabase/server";
import type { Product, ProductCategory, Brand } from "@/lib/types/database";
import { FichaProductos } from "./FichaProductos";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const supabase = await createClient();

  const [{ data: rawProducts }, { data: rawCategories }, { data: rawBrands }, logisticRes] =
    await Promise.all([
      supabase
        .from("products")
        .select("*, category:product_categories(id,name), brand:brands(id,name)")
        .is("deleted_at", null)
        .order("sku"),
      supabase
        .from("product_categories")
        .select("id,name,is_active")
        .eq("is_active", true)
        .order("name"),
      supabase.from("brands").select("id,name,is_active").eq("is_active", true).order("name"),
      supabase
        .from("logistics_costs")
        .select("cost_net_per_unit")
        .is("product_id", null)
        .is("warehouse_id", null)
        .is("client_id", null)
        .maybeSingle(),
    ]);

  const products = (rawProducts ?? []) as unknown as Product[];
  const categories = (rawCategories ?? []) as ProductCategory[];
  const brands = (rawBrands ?? []) as Brand[];
  const logisticCostPerUnit = (logisticRes.data as unknown as { cost_net_per_unit: number } | null)?.cost_net_per_unit ?? 0;

  return <FichaProductos products={products} categories={categories} brands={brands} logisticCostPerUnit={logisticCostPerUnit} />;
}
