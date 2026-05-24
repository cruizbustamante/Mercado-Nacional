import { createClient } from "@/lib/supabase/server";
import { ProductsTable, type ProductRow } from "./ProductsTable";

export default async function ProductosAdminPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: cats }, { data: brs }] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, units_per_box, base_price_net, base_price_gross, min_price_net, unit_cost_net, is_active, category:product_categories(name), brand:brands(name)")
      .is("deleted_at", null)
      .order("name"),
    supabase.from("product_categories").select("name").order("name"),
    supabase.from("brands").select("name").order("name"),
  ]);

  const products: ProductRow[] = ((rows ?? []) as unknown as Array<{
    id: string; sku: string; name: string; units_per_box: number;
    base_price_net: number; base_price_gross: number; min_price_net: number;
    unit_cost_net: number | null;
    is_active: boolean;
    category: { name: string } | null;
    brand: { name: string } | null;
  }>).map((p) => ({
    id: p.id, sku: p.sku, name: p.name, units_per_box: p.units_per_box,
    base_price_net: p.base_price_net, base_price_gross: p.base_price_gross,
    min_price_net: p.min_price_net,
    unit_cost_net: p.unit_cost_net,
    is_active: p.is_active,
    category_name: p.category?.name ?? null,
    brand_name: p.brand?.name ?? null,
  }));

  const unclassified = products.filter((p) => !p.category_name || !p.brand_name).length;

  return (
    <ProductsTable
      initial={products}
      categories={(cats ?? []).map((c) => c.name)}
      brands={(brs ?? []).map((b) => b.name)}
      stats={{
        total: products.length,
        cats: (cats ?? []).length,
        brands: (brs ?? []).length,
        unclassified,
      }}
    />
  );
}
