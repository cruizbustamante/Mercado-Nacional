import { createClient } from "@/lib/supabase/server";
import { UpcMappingTable, type UpcRow, type ProductOption } from "./UpcMappingTable";

export default async function MapeoUpcPage() {
  const supabase = await createClient();

  const [mappingRes, productsRes, totalCountRes, matchedCountRes] = await Promise.all([
    supabase
      .from("sku_upc_mapping")
      .select("id, upc, product_id, product_name_oc, category_name, brand_name, notes, product:products(sku, name)")
      .order("upc")
      .limit(2000),
    supabase
      .from("products")
      .select("id, sku, name")
      .is("deleted_at", null)
      .order("name"),
    supabase.from("sku_upc_mapping").select("*", { count: "exact", head: true }),
    supabase.from("sku_upc_mapping").select("*", { count: "exact", head: true }).not("product_id", "is", null),
  ]);

  const rows: UpcRow[] = ((mappingRes.data ?? []) as unknown as Array<{
    id: string; upc: string; product_id: string | null;
    product_name_oc: string | null; category_name: string | null; brand_name: string | null; notes: string | null;
    product: { sku: string; name: string } | null;
  }>).map((r) => ({
    id: r.id, upc: r.upc, product_id: r.product_id,
    product_name_oc: r.product_name_oc, category_name: r.category_name,
    brand_name: r.brand_name, notes: r.notes,
    product_sku: r.product?.sku ?? null,
    product_name: r.product?.name ?? null,
  }));

  const products: ProductOption[] = (productsRes.data ?? []) as ProductOption[];

  const total = totalCountRes.count ?? 0;
  const matched = matchedCountRes.count ?? 0;
  const unmatched = total - matched;

  return (
    <UpcMappingTable
      initial={rows}
      products={products}
      stats={{ total, matched, unmatched }}
    />
  );
}
