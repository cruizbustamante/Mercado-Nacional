"use client";

import { useState, useTransition, useRef } from "react";
import { previewInsurance, applyInsurance, type InsurancePreview, type ApplyInput } from "./actions";

const fmtClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmtUf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function InsuranceUploader() {
  const [preview, setPreview] = useState<InsurancePreview | null>(null);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; errors: string[]; uploadId: string | null; recordsInserted: number; clientsUpdated: number } | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  async function onPreview(formData: FormData) {
    setFatalError(null);
    startTransition(async () => {
      try {
        const r = await previewInsurance(formData);
        setPreview(r);
        setApplyResult(null);
      } catch (err) {
        setFatalError(`Error en preview: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  async function onApply() {
    if (!preview) return;
    setFatalError(null);

    function toDateStr(v: unknown): string | null {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().split("T")[0];
      const s = String(v);
      if (s.includes("T")) return s.split("T")[0];
      return s || null;
    }

    const input: ApplyInput = {
      fileDate: preview.fileDate ?? new Date().toISOString().split("T")[0],
      ufValue: preview.ufValue,
      totals: preview.totals,
      records: preview.records.map((r) => ({
        rut_body: r.rut_body,
        client_name: r.client_name,
        origin: r.origin,
        estado: r.estado,
        monto_uf: r.monto_uf,
        monto_clp: r.monto_clp,
        vigencia_desde: toDateStr(r.vigencia_desde),
        vigencia_hasta: toDateStr(r.vigencia_hasta),
        matched: r.matched,
        client_id: r.client_id,
      })),
    };

    console.log("[InsuranceUploader] Enviando apply:", input.records.length, "registros");

    startTransition(async () => {
      try {
        const r = await applyInsurance(input);
        console.log("[InsuranceUploader] Resultado:", r);
        setApplyResult(r);
      } catch (err) {
        console.error("[InsuranceUploader] Error en apply:", err);
        setFatalError(`Error al aplicar: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <>
      <form ref={formRef} action={onPreview} className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-900">Listado Nominados (.xlsx)</span>
            <input type="file" name="nominados" accept=".xlsx,.xls" required className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-zinc-200" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-900">Listado Innominados (.xlsx)</span>
            <input type="file" name="innominados" accept=".xlsx,.xls" required className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-zinc-200" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-900">Fecha del archivo</span>
            <input type="date" name="file_date" defaultValue={new Date().toISOString().split("T")[0]} required className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-900">Valor UF (opcional — se busca auto)</span>
            <input type="text" name="uf_value" placeholder="Ej: 39250" className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Procesando..." : "1. Procesar y previsualizar"}
        </button>
      </form>

      {fatalError && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Error</div>
          <p className="mt-1 font-mono text-xs">{fatalError}</p>
        </div>
      )}

      {preview && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between border-b border-zinc-200 pb-3">
            <h2 className="text-base font-semibold text-zinc-900">Vista previa</h2>
            <div className="text-xs text-zinc-500">
              Fecha archivo: <b>{preview.fileDate}</b> · UF: <b>${fmtUf.format(preview.ufValue)}</b>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <ul className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {preview.errors.map((e, i) => <li key={i}>⚠ {e}</li>)}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Registros" value={preview.totals.rows.toString()} />
            <Stat label="Activa" value={preview.totals.activa.toString()} tone="success" />
            <Stat label="Cancel" value={preview.totals.cancel.toString()} tone="muted" />
            <Stat label="Rechaz" value={preview.totals.rechaz.toString()} tone="muted" />
            <Stat label="Total UF" value={fmtUf.format(preview.totals.totalUf)} />
            <Stat label="Total CLP" value={fmtClp.format(preview.totals.totalClp)} />
          </div>

          <div className="mt-4">
            <p className="text-xs text-zinc-500">
              Coincidencias con clientes en sistema:{" "}
              <b>{preview.records.filter((r) => r.matched).length}</b> de{" "}
              <b>{preview.records.length}</b>
            </p>
          </div>

          {preview.ok && preview.records.length > 0 && !applyResult && (
            <button
              type="button"
              onClick={onApply}
              disabled={pending}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {pending ? "Aplicando..." : "2. Confirmar y actualizar clientes"}
            </button>
          )}

          {applyResult && (
            <div className={`mt-4 rounded-md border p-3 text-sm ${applyResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <div className="font-medium">
                {applyResult.ok ? "Carga aplicada" : "Carga aplicada con errores"}
              </div>
              <ul className="mt-1 text-xs">
                <li>Registros guardados: <b>{applyResult.recordsInserted}</b></li>
                <li>Clientes actualizados: <b>{applyResult.clientsUpdated}</b></li>
                <li>Carga ID: <code className="text-[10px]">{applyResult.uploadId}</code></li>
              </ul>
              {applyResult.errors.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">Errores ({applyResult.errors.length})</summary>
                  <ul className="mt-1 max-h-40 overflow-auto font-mono">
                    {applyResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          {preview.records.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                Ver detalle ({preview.records.length} registros)
              </summary>
              <div className="mt-2 max-h-96 overflow-auto rounded border border-zinc-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50 text-left">
                    <tr>
                      <th className="px-2 py-1.5">RUT</th>
                      <th className="px-2 py-1.5">Cliente</th>
                      <th className="px-2 py-1.5">Origen</th>
                      <th className="px-2 py-1.5">Estado</th>
                      <th className="px-2 py-1.5 text-right">UF</th>
                      <th className="px-2 py-1.5 text-right">CLP</th>
                      <th className="px-2 py-1.5">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.records.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-100">
                        <td className="px-2 py-1 font-mono">{r.rut_body}-{r.rut_dv}</td>
                        <td className="px-2 py-1 max-w-[24ch] truncate">{r.client_name}</td>
                        <td className="px-2 py-1">{r.origin}</td>
                        <td className="px-2 py-1">
                          <span className={
                            r.estado === "ACTIVA" ? "text-emerald-700" :
                            r.estado === "CANCEL" ? "text-zinc-500" : "text-amber-700"
                          }>{r.estado}</span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtUf.format(r.monto_uf)}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtClp.format(r.monto_clp)}</td>
                        <td className="px-2 py-1">{r.matched ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "muted" }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-mono text-sm tabular-nums ${tone === "success" ? "text-emerald-700" : tone === "muted" ? "text-zinc-500" : "text-zinc-900"}`}>
        {value}
      </div>
    </div>
  );
}
