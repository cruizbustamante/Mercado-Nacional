"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveClient, deleteClient } from "./actions";

interface Option { id: string; name: string }

export interface ClientFormData {
  id?: string;
  rut?: string;
  name?: string;
  address?: string | null;
  commune?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  payment_term_id?: string | null;
  salesperson_id?: string | null;
  channel_id?: string | null;
  credit_line_clp?: number;
  insurer_name?: string | null;
  insurer_credit_line_clp?: number;
}

export function ClientForm({
  initial,
  paymentTerms,
  salespeople,
  channels,
}: {
  initial: ClientFormData;
  paymentTerms: Option[];
  salespeople: Array<{ id: string; full_name: string; short_name: string | null }>;
  channels: Array<{ id: string; display_name: string }>;
}) {
  const [state, formAction] = useActionState(saveClient, { ok: true, error: null });

  return (
    <form action={formAction} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Identificación</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="RUT" name="rut" defaultValue={initial.rut} required placeholder="12.345.678-9" />
          <div className="sm:col-span-2">
            <Field label="Razón Social" name="name" defaultValue={initial.name} required />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Ubicación</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field label="Dirección" name="address" defaultValue={initial.address ?? ""} />
          </div>
          <Field label="Comuna" name="commune" defaultValue={initial.commune ?? ""} />
          <Field label="Ciudad" name="city" defaultValue={initial.city ?? ""} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Contacto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Teléfono" name="phone" defaultValue={initial.phone ?? ""} />
          <Field label="Email" name="email" type="email" defaultValue={initial.email ?? ""} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Comercial</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Condición de Pago" name="payment_term_id" defaultValue={initial.payment_term_id ?? ""} options={paymentTerms.map((p) => ({ value: p.id, label: p.name }))} />
          <Select label="Vendedor" name="salesperson_id" defaultValue={initial.salesperson_id ?? ""} options={salespeople.map((s) => ({ value: s.id, label: s.short_name ?? s.full_name }))} />
          <Select label="Canal" name="channel_id" defaultValue={initial.channel_id ?? ""} options={channels.map((c) => ({ value: c.id, label: c.display_name }))} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">Crédito</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Línea Crédito Interna (CLP)" name="credit_line_clp" type="number" defaultValue={String(initial.credit_line_clp ?? 0)} />
          <Field label="Aseguradora" name="insurer_name" defaultValue={initial.insurer_name ?? ""} />
          <Field label="Línea Crédito Seguro (CLP)" name="insurer_credit_line_clp" type="number" defaultValue={String(initial.insurer_credit_line_clp ?? 0)} />
        </div>
      </section>

      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          ⚠ {state.error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link href="/admin/clientes" className="text-sm text-zinc-500 hover:text-zinc-900">
          Cancelar
        </Link>
        <div className="flex gap-2">
          {initial.id && (
            <DeleteButton id={initial.id} />
          )}
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {initial.id ? "Guardar cambios" : "Crear cliente"}
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

function Select({
  label, name, defaultValue, options,
}: {
  label: string; name: string; defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
      >
        <option value="">— Sin asignar —</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function DeleteButton({ id }: { id: string }) {
  return (
    <form action={deleteClient}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        onClick={(e) => { if (!confirm("¿Eliminar este cliente? Se puede restaurar después.")) e.preventDefault(); }}
      >
        Eliminar
      </button>
    </form>
  );
}
