"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveProduct, deleteProduct } from "./actions";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  units_per_box: number;
  base_price_net: number;
  base_price_gross: number;
  min_price_net: number;
  is_active: boolean;
  category_name: string | null;
  brand_name: string | null;
}

export function ProductsTable({
  initial, categories, brands, totalCount,
}: {
  initial: ProductRow[];
  categories: string[];
  brands: string[];
  totalCount: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);

  const filtered = initial.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) ||
      (p.brand_name ?? "").toLowerCase().includes(q) ||
      (p.category_name ?? "").toLowerCase().includes(q);
  });

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {filtered.length} de {totalCount} productos
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Nuevo producto
        </button>
      </header>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por SKU, nombre, marca o categoría…"
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Marca</th>
              <th className="px-3 py-2 text-right">U/Cj</th>
              <th className="px-3 py-2 text-right">Neto</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">Mín neto</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} onClick={() => setEditing(p)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{p.category_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{p.brand_name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{p.units_per_box}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(p.base_price_net)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(p.base_price_gross)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(p.min_price_net)}</td>
                <td className="px-3 py-2 text-right">
                  {!p.is_active && <span className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600">Inactivo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          categories={categories}
          brands={brands}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ProductDialog({
  product, categories, brands, onClose, onSaved,
}: {
  product: ProductRow | null;
  categories: string[];
  brands: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await saveProduct({ ok: true, error: null }, fd);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  }

  async function handleDelete() {
    if (!product || !confirm("¿Eliminar este producto?")) return;
    const fd = new FormData();
    fd.set("id", product.id);
    startTransition(async () => {
      await deleteProduct(fd);
      onSaved();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 w-full max-w-2xl rounded-lg bg-white p-0 shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col">
        {product && <input type="hidden" name="id" value={product.id} />}

        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{product ? "Editar producto" : "Nuevo producto"}</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Field label="SKU" name="sku" defaultValue={product?.sku} required />
            <Field label="Nombre / Descripción" name="name" defaultValue={product?.name} required className="col-span-2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Combo label="Categoría" name="category_name" defaultValue={product?.category_name ?? ""} options={categories} list="cat-list" />
            <Combo label="Marca" name="brand_name" defaultValue={product?.brand_name ?? ""} options={brands} list="brand-list" />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Field label="U / Caja" name="units_per_box" type="number" min={1} defaultValue={String(product?.units_per_box ?? 12)} />
            <Field label="Neto base" name="base_price_net" type="number" defaultValue={String(product?.base_price_net ?? 0)} />
            <Field label="Bruto base" name="base_price_gross" type="number" defaultValue={String(product?.base_price_gross ?? 0)} />
            <Field label="Mín neto" name="min_price_net" type="number" defaultValue={String(product?.min_price_net ?? 0)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} className="h-4 w-4" />
            <span>Activo</span>
          </label>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">⚠ {error}</div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-200 px-6 py-3">
          <div>
            {product && (
              <button type="button" onClick={handleDelete} disabled={pending} className="text-sm font-medium text-red-700 hover:text-red-900">
                Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
              {pending ? "Guardando..." : product ? "Guardar" : "Crear"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

function Field({ label, className = "", ...props }: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      <input {...props} className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500" />
    </label>
  );
}

function Combo({ label, name, defaultValue, options, list }: { label: string; name: string; defaultValue: string; options: string[]; list: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      <input name={name} defaultValue={defaultValue} list={list} className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      <datalist id={list}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </label>
  );
}
