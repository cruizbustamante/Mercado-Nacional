"use client";

import { useState, useTransition } from "react";
import { uploadClients, type ClientUploadResult } from "./actions";

export function ClientsUploader() {
  const [result, setResult] = useState<ClientUploadResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      setResult({
        ok: false, totalRows: 0, inserted: 0, updated: 0,
        errors: ["Selecciona un archivo Excel."], newPaymentTerms: [], unknownSalespeople: [],
      });
      return;
    }
    startTransition(async () => {
      const r = await uploadClients(formData);
      setResult(r);
    });
  }

  return (
    <form action={onSubmit} className="rounded-lg border border-zinc-200 bg-white p-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-zinc-900">Archivo Excel (.xlsx)</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
        />
        {fileName && <p className="mt-2 text-xs text-zinc-500">Seleccionado: {fileName}</p>}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Procesando..." : "Subir y procesar"}
      </button>

      {result && (
        <div
          className={`mt-6 rounded-md border p-4 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="font-medium">
            {result.ok ? "Carga completada" : "Carga completada con observaciones"}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <li>Filas: <b>{result.totalRows}</b></li>
            <li>Insertados: <b>{result.inserted}</b></li>
            <li>Actualizados: <b>{result.updated}</b></li>
            <li>Errores: <b>{result.errors.length}</b></li>
          </ul>
          {result.newPaymentTerms.length > 0 && (
            <p className="mt-3 text-xs">
              <b>Nuevas condiciones de pago creadas:</b> {result.newPaymentTerms.join(", ")}
            </p>
          )}
          {result.unknownSalespeople.length > 0 && (
            <p className="mt-1 text-xs">
              <b>Ejecutivos no reconocidos (clientes quedaron sin vendedor):</b>{" "}
              {result.unknownSalespeople.join(", ")}
            </p>
          )}
          {result.errors.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-medium">Ver errores ({result.errors.length})</summary>
              <ul className="mt-2 max-h-48 overflow-auto rounded bg-white/60 p-2 font-mono">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
