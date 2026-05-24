import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "../ProductForm";

export default async function NuevoProductoPage() {
  const supabase = await createClient();
  const [{ data: cats }, { data: brs }] = await Promise.all([
    supabase.from("product_categories").select("name").order("name"),
    supabase.from("brands").select("name").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-sm">
        <Link href="/admin/productos" className="text-zinc-500 hover:text-zinc-900">← Productos</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo producto</h1>
      </header>
      <ProductForm
        initial={{}}
        categories={(cats ?? []).map((c) => c.name)}
        brands={(brs ?? []).map((b) => b.name)}
      />
    </div>
  );
}
