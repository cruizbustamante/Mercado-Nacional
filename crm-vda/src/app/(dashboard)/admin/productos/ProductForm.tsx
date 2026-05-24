"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveProduct, deleteProduct } from "./actions";

export interface ProductFormData {
  id?: string;
  sku?: string;
  name?: string;
  category_name?: string | null;
  brand_name?: string | null;
  units_per_box?: number;
  base_price_net?: number;
  base_price_gross?: number;
  min_price_net?: number;
  is_active?: boolean;
}

export function ProductForm({
  initial,
  categories,
  brands,
}: {
  initial: ProductFormData;
  categories: string[];
  brands: string[];
}) {
  const [state, formAction] = useActionState(saveProduct, { ok: true, error: null });

  return (
    <form action={formAction} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Identificación</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="SKU" name="sku" defaultValue={initial.sku} required />
          <div className="sm:col-span-2">
            <Field label="Nombre / Descripción" name="name" defaultValue={initial.name} required />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Clasificación</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Combo label="Categoría" name="category_name" defaultValue={initial.category_name ?? ""} options={categories} list="cat-list" />
          <Combo label="Marca" name="brand_name" defaultValue={initial.brand_name ?? ""} options={brands} list="brand-list" />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Empaque y Precios (CLP)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Unidades / Caja" name="units_per_box" type="number" min={1} defaultValue={String(initial.units_per_box ?? 12)} />
          <Field label="Neto Base" name="base_price_net" type="number" defaultValue={String(initial.base_price_net ?? 0)} />
          <Field label="Bruto Base" name="base_price_gross" type="number" defaultValue={String(initial.base_price_gross ?? 0)} />
          <Field label="Mínimo Neto" name="min_price_net" type="number" defaultValue={String(initial.min_price_net ?? 0)} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={initial.is_active ?? true}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <span>Producto activo (aparece en selección al emitir NV)</span>
        </label>
      </section>

      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          ⚠ {state.error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link href="/admin/productos" className="text-sm text-zinc-500 hover:text-zinc-900">Cancelar</Link>
        <div className="flex gap-2">
          {initial.id && <DeleteButton id={initial.id} />}
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {initial.id ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      <input
        {...props}
        className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />
    </label>
  );
}

function Combo({
  label, name, defaultValue, options, list,
}: { label: string; name: string; defaultValue: string; options: string[]; list: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        list={list}
        className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
      />
      <datalist id={list}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </label>
  );
}

function DeleteButton({ id }: { id: string }) {
  return (
    <form action={deleteProduct}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        onClick={(e) => { if (!confirm("¿Eliminar este producto? Se puede restaurar después.")) e.preventDefault(); }}
      >
        Eliminar
      </button>
    </form>
  );
}
