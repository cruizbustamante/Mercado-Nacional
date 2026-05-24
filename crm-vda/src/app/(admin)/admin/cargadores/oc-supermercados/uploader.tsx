"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { importOcFiles, type OcImportResult } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  creada: "bg-emerald-100 text-emerald-800 border-emerald-300",
  duplicada: "bg-amber-100 text-amber-800 border-amber-300",
  error: "bg-red-100 text-red-800 border-red-300",
  vacia: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

const STATUS_LABEL: Record<string, string> = {
  creada: "✓ Creada",
  duplicada: "↻ Ya existe",
  error: "× Error",
  vacia: "○ Sin parser",
};

export function OcFilesUploader() {
  const [result, setResult] = useState<OcImportResult | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("files");
    if (!files || files.length === 0) return;
    startTransition(async () => {
      const r = await importOcFiles(fd);
      setResult(r);
      if (inputRef.current) inputRef.current.value = "";
      setFileNames([]);
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-zinc-200 bg-white p-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-zinc-900">
          Archivos OC (acepta múltiples · PDF / DOC / DOCX / MD)
        </span>
        <input
          ref={inputRef}
          type="file"
          name="files"
          accept=".pdf,.doc,.docx,.md,.txt"
          multiple
          required
          onChange={(e) => setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))}
          className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
        />
        {fileNames.length > 0 && (
          <div className="mt-2 text-xs text-zinc-500">
            {fileNames.length} archivo{fileNames.length === 1 ? "" : "s"} seleccionado{fileNames.length === 1 ? "" : "s"}:
            <ul className="mt-1 list-disc pl-5">
              {fileNames.slice(0, 10).map((n, i) => <li key={i}>{n}</li>)}
              {fileNames.length > 10 && <li>… y {fileNames.length - 10} más</li>}
            </ul>
          </div>
        )}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Procesando..." : `Importar ${fileNames.length || ""} OC`.trim()}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          <div className={`rounded-md border p-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="font-medium">
              Resultado: {result.files.filter((f) => f.status === "creada").length} creadas ·{" "}
              {result.files.filter((f) => f.status === "duplicada").length} duplicadas ·{" "}
              {result.files.filter((f) => f.status === "error" || f.status === "vacia").length} con problemas
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-zinc-200">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Archivo</th>
                  <th className="px-3 py-2">Cadena</th>
                  <th className="px-3 py-2">N° Orden</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Líneas</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {result.files.map((f, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-mono text-[11px] max-w-[18ch] truncate" title={f.filename}>{f.filename}</td>
                    <td className="px-3 py-2">{f.chain}</td>
                    <td className="px-3 py-2 font-mono">{f.order_number}</td>
                    <td className="px-3 py-2 text-right font-mono">${f.total_amount.toLocaleString("es-CL")}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {f.lines_matched}/{f.lines_total}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded border px-2 py-0.5 text-[10px] ${STATUS_COLOR[f.status]}`}>
                        {STATUS_LABEL[f.status]}
                      </span>
                      {f.message && f.status !== "creada" && (
                        <div className="mt-1 text-[10px] text-zinc-500">{f.message}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.noMapeados.length > 0 && (
            <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <summary className="cursor-pointer font-medium">
                {result.noMapeados.length} DUN sin SKU vinculado · resolver para que aparezcan en el dashboard
              </summary>
              <div className="mt-2 max-h-64 overflow-auto rounded bg-white/60 p-2">
                <table className="w-full">
                  <thead><tr><th className="px-2 py-1 text-left">DUN</th><th className="px-2 py-1 text-left">Producto OC</th><th className="px-2 py-1 text-left">OC</th></tr></thead>
                  <tbody>
                    {result.noMapeados.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-zinc-200">
                        <td className="px-2 py-1 font-mono">{r.upc}</td>
                        <td className="px-2 py-1">{r.producto}</td>
                        <td className="px-2 py-1 font-mono">{r.orden}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link href="/admin/mapeo-upc" className="mt-2 inline-block font-medium underline">
                → Ir a Mapeo Supermercados (DUN ↔ SKU)
              </Link>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
