"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveClient, deleteClient } from "./actions";
import { formatRut } from "@/lib/rut";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export interface ClientRow {
  id: string;
  rut_body: number;
  rut_dv: string;
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  payment_term_id: string | null;
  salesperson_id: string | null;
  channel_id: string | null;
  credit_line_clp: number;
  insurer_name: string | null;
  insurer_credit_line_clp: number;
  payment_term_name: string | null;
  salesperson_name: string | null;
}

export interface Option { id: string; label: string }

export function ClientsTable({
  initial, paymentTerms, salespeople, channels, totalCount,
}: {
  initial: ClientRow[];
  paymentTerms: Option[];
  salespeople: Option[];
  channels: Option[];
  totalCount: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);

  const filtered = initial.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) ||
      String(c.rut_body).includes(q) ||
      (c.commune ?? "").toLowerCase().includes(q) ||
      (c.salesperson_name ?? "").toLowerCase().includes(q);
  });

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">{filtered.length} de {totalCount} clientes</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Nuevo cliente
        </button>
      </header>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, RUT, comuna o vendedor…"
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">RUT</th>
              <th className="px-3 py-2">Razón Social</th>
              <th className="px-3 py-2">Comuna · Ciudad</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Cond. Pago</th>
              <th className="px-3 py-2 text-right">L. Crédito</th>
              <th className="px-3 py-2 text-right">L. Seguro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => setEditing(c)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono text-xs">{formatRut(c.rut_body, c.rut_dv)}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">
                  {c.commune ?? "—"}{c.city ? ` · ${c.city}` : ""}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">{c.salesperson_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-600">{c.payment_term_name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(c.credit_line_clp)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmt.format(c.insurer_credit_line_clp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ClientDialog
          client={editing === "new" ? null : editing}
          paymentTerms={paymentTerms}
          salespeople={salespeople}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ClientDialog({
  client, paymentTerms, salespeople, channels, onClose, onSaved,
}: {
  client: ClientRow | null;
  paymentTerms: Option[];
  salespeople: Option[];
  channels: Option[];
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
      const r = await saveClient({ ok: true, error: null }, fd);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  }

  async function handleDelete() {
    if (!client || !confirm("¿Eliminar este cliente?")) return;
    const fd = new FormData();
    fd.set("id", client.id);
    startTransition(async () => {
      await deleteClient(fd);
      onSaved();
    });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-0 w-full max-w-3xl rounded-lg bg-white p-0 shadow-2xl backdrop:bg-black/40">
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col">
        {client && <input type="hidden" name="id" value={client.id} />}

        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{client ? "Editar cliente" : "Nuevo cliente"}</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Identificación</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="RUT" name="rut" required defaultValue={client ? `${client.rut_body}-${client.rut_dv}` : ""} placeholder="12.345.678-9" />
              <Field label="Razón Social" name="name" required defaultValue={client?.name} className="col-span-2" />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Ubicación</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Dirección" name="address" defaultValue={client?.address ?? ""} className="col-span-3" />
              <Field label="Comuna" name="commune" defaultValue={client?.commune ?? ""} />
              <Field label="Ciudad" name="city" defaultValue={client?.city ?? ""} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Contacto</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Teléfono" name="phone" defaultValue={client?.phone ?? ""} />
              <Field label="Email" name="email" type="email" defaultValue={client?.email ?? ""} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Comercial</h3>
            <div className="grid grid-cols-3 gap-4">
              <Select label="Condición de Pago" name="payment_term_id" defaultValue={client?.payment_term_id ?? ""} options={paymentTerms} />
              <Select label="Vendedor" name="salesperson_id" defaultValue={client?.salesperson_id ?? ""} options={salespeople} />
              <Select label="Canal" name="channel_id" defaultValue={client?.channel_id ?? ""} options={channels} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">Crédito</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="L. Crédito Interna (CLP)" name="credit_line_clp" type="number" defaultValue={String(client?.credit_line_clp ?? 0)} />
              <Field label="Aseguradora" name="insurer_name" defaultValue={client?.insurer_name ?? ""} />
              <Field label="L. Crédito Seguro (CLP)" name="insurer_credit_line_clp" type="number" defaultValue={String(client?.insurer_credit_line_clp ?? 0)} />
            </div>
          </section>

          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">⚠ {error}</div>}
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-200 px-6 py-3">
          <div>
            {client && (
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
              {pending ? "Guardando..." : client ? "Guardar" : "Crear"}
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

function Select({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: Option[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-700">{label}</span>
      <select name={name} defaultValue={defaultValue} className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm">
        <option value="">— Sin asignar —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
