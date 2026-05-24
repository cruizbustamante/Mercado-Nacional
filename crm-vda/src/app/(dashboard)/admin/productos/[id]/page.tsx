import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../ProductForm";

export default async function EditProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: product }, { data: cats }, { data: brs }] = await Promise.all([
    supabase
      .from("products")
      .select("*, category:product_categories(name), brand:brands(name)")
      .eq("id", id)
      .single(),
    supabase.from("product_categories").select("name").order("name"),
    supabase.from("brands").select("name").order("name"),
  ]);

  if (!product) notFound();

  const cat = (product as unknown as { category: { name: string } | null }).category;
  const brand = (product as unknown as { brand: { name: string } | null }).brand;

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-sm">
        <Link href="/admin/productos" className="text-zinc-500 hover:text-zinc-900">← Productos</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">{product.sku}</p>
      </header>
      <ProductForm
        initial={{
          id: product.id,
          sku: product.sku,
          name: product.name,
          category_name: cat?.name ?? null,
          brand_name: brand?.name ?? null,
          units_per_box: product.units_per_box,
          base_price_net: product.base_price_net,
          base_price_gross: product.base_price_gross,
          min_price_net: product.min_price_net,
          is_active: product.is_active,
        }}
        categories={(cats ?? []).map((c) => c.name)}
        brands={(brs ?? []).map((b) => b.name)}
      />
    </div>
  );
}
