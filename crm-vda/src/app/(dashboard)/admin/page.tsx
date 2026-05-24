import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const [{ count: cClients }, { count: cProducts }, { count: cInsurance }] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("insurance_uploads").select("*", { count: "exact", head: true }),
  ]);

  const cards = [
    {
      title: "Clientes",
      desc: "Cargar/actualizar base de clientes desde Excel.",
      href: "/admin/cargadores/clientes",
      count: cClients ?? 0,
      label: "registros",
    },
    {
      title: "Productos",
      desc: "Cargar/actualizar productos, precios, categorías y marcas.",
      href: "/admin/cargadores/productos",
      count: cProducts ?? 0,
      label: "SKUs",
    },
    {
      title: "Seguros (línea de crédito)",
      desc: "Carga mensual de Nominados + Innominados de la aseguradora.",
      href: "/admin/cargadores/seguros",
      count: cInsurance ?? 0,
      label: "cargas históricas",
    },
  ];

  const tablas = [
    { title: "Clientes", desc: "Listar, editar o crear clientes uno por uno.", href: "/admin/clientes", count: cClients ?? 0, label: "clientes" },
    { title: "Productos", desc: "Listar, editar o crear productos uno por uno.", href: "/admin/productos", count: cProducts ?? 0, label: "SKUs" },
  ];

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <p className="mt-1 text-sm text-zinc-500">Carga y mantenimiento de datos maestros.</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Tablas
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tablas.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium text-zinc-900">{c.title}</h3>
                <span className="font-mono text-sm tabular-nums text-zinc-500">
                  {c.count}
                  <span className="ml-1 text-xs text-zinc-400">{c.label}</span>
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Cargadores Excel (carga masiva)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-medium text-zinc-900">{c.title}</h3>
                <span className="font-mono text-sm tabular-nums text-zinc-500">
                  {c.count}
                  <span className="ml-1 text-xs text-zinc-400">{c.label}</span>
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
