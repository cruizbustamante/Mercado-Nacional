"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readSheet, pickCol, parseClNumber, parseDate } from "@/lib/xlsx-utils";
import { parseRut } from "@/lib/rut";
import { getCurrentProfile } from "@/lib/auth";

const UF_NOMINAL_INNOMINADO = 200;

type Estado = "ACTIVA" | "CANCEL" | "RECHAZ";

interface InsuranceRow {
  origin: "Nominado" | "Innominado";
  rut_body: number;
  rut_dv: string;
  client_name: string;
  estado: Estado;
  monto_uf: number;
  vigencia_desde: Date | null;
  vigencia_hasta: Date | null;
}

export interface InsurancePreview {
  ok: boolean;
  errors: string[];
  fileDate: string | null;
  ufValue: number;
  totals: {
    rows: number;
    activa: number;
    cancel: number;
    rechaz: number;
    totalUf: number;
    totalClp: number;
  };
  records: Array<InsuranceRow & { matched: boolean; client_id: string | null; monto_clp: number }>;
}

function stripAccents(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function normalizeEstadoInnominado(v: unknown): Estado {
  if (v === null || v === undefined || String(v).trim() === "") return "RECHAZ";
  const s = stripAccents(String(v).trim().toLowerCase());
  if (s === "activa") return "ACTIVA";
  if (["cancelado", "cancelada", "expir"].some((k) => s.includes(k))) return "CANCEL";
  return "RECHAZ";
}

function normalizeEstadoNominado(v: unknown): Estado {
  if (v === null || v === undefined || String(v).trim() === "") return "RECHAZ";
  const s = stripAccents(String(v).trim().toLowerCase());
  if (s.includes("activ")) return "ACTIVA";
  if (s.includes("cancel") || s.includes("expir")) return "CANCEL";
  return "RECHAZ";
}

function parseSheet(buf: ArrayBuffer, origin: "Nominado" | "Innominado"): InsuranceRow[] {
  const rows = readSheet(buf);
  if (rows.length === 0) return [];

  const sample = rows[0];
  const cRut = pickCol(sample, ["Id. Nacional", "Id Nacional", "RUT", "R.U.T", "Documento"]);
  const cName = pickCol(sample, ["Cliente", "Razón Social", "Razon Social", "Nombre"]);
  const cEstado = pickCol(sample, ["Estado Actual", "Estado", "Estado Actual / Motivo de Rechazo", "EstadoActual"]);
  const cMonto = pickCol(sample, ["Monto Aprobado", "MontoAprobado", "Cupo Aprobado"]);
  const cDesde = pickCol(sample, ["Vigencia Desde", "Fecha Desde", "Desde", "F. Desde"]);
  const cHasta = pickCol(sample, ["Vigencia Hasta", "Fecha Hasta", "Hasta", "F. Hasta"]);

  if (!cRut || !cEstado) return [];

  const out: InsuranceRow[] = [];
  for (const row of rows) {
    const rut = parseRut(row[cRut] as string);
    if (!rut) continue;
    const estadoRaw = row[cEstado];
    const estado: Estado = origin === "Innominado"
      ? normalizeEstadoInnominado(estadoRaw)
      : normalizeEstadoNominado(estadoRaw);

    let monto_uf = 0;
    if (estado === "ACTIVA") {
      if (origin === "Innominado") {
        monto_uf = UF_NOMINAL_INNOMINADO;
      } else if (cMonto) {
        monto_uf = parseClNumber(row[cMonto]) ?? 0;
      }
    }

    out.push({
      origin,
      rut_body: rut.body,
      rut_dv: rut.dv,
      client_name: cName ? String(row[cName] ?? "").trim() : "",
      estado,
      monto_uf,
      vigencia_desde: cDesde ? parseDate(row[cDesde]) : null,
      vigencia_hasta: cHasta ? parseDate(row[cHasta]) : null,
    });
  }
  return out;
}

function consolidate(nom: InsuranceRow[], inn: InsuranceRow[]): InsuranceRow[] {
  const map = new Map<number, InsuranceRow>();
  // Innominados primero, Nominados sobrescriben
  for (const r of inn) map.set(r.rut_body, r);
  for (const r of nom) map.set(r.rut_body, r);
  return Array.from(map.values());
}

async function fetchUf(date: Date): Promise<number | null> {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const url = `https://mindicador.cl/api/uf/${dd}-${mm}-${yyyy}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const val = data?.serie?.[0]?.valor;
    return typeof val === "number" ? val : null;
  } catch {
    return null;
  }
}

export async function previewInsurance(formData: FormData): Promise<InsurancePreview> {
  const nomFile = formData.get("nominados") as File | null;
  const innFile = formData.get("innominados") as File | null;
  const ufStr = formData.get("uf_value") as string | null;
  const dateStr = formData.get("file_date") as string | null;

  const errors: string[] = [];

  if (!nomFile || nomFile.size === 0) errors.push("Falta archivo de Nominados.");
  if (!innFile || innFile.size === 0) errors.push("Falta archivo de Innominados.");
  if (errors.length > 0) {
    return {
      ok: false, errors, fileDate: null, ufValue: 0,
      totals: { rows: 0, activa: 0, cancel: 0, rechaz: 0, totalUf: 0, totalClp: 0 },
      records: [],
    };
  }

  const nomBuf = await nomFile!.arrayBuffer();
  const innBuf = await innFile!.arrayBuffer();

  const nom = parseSheet(nomBuf, "Nominado");
  const inn = parseSheet(innBuf, "Innominado");

  if (nom.length === 0) errors.push("No se pudo parsear el archivo de Nominados (revisar columnas Id. Nacional + Estado).");
  if (inn.length === 0) errors.push("No se pudo parsear el archivo de Innominados (revisar columnas Id. Nacional + Estado).");

  const consolidated = consolidate(nom, inn);

  const fileDate = dateStr ? new Date(dateStr) : new Date();
  let uf = ufStr ? parseClNumber(ufStr) ?? 0 : 0;
  if (uf <= 0) {
    const fetched = await fetchUf(fileDate);
    if (fetched) uf = fetched;
    else errors.push("No se pudo obtener UF automáticamente. Ingrésala manualmente.");
  }

  // Match con clientes
  const supabase = await createClient();
  const ruts = consolidated.map((r) => r.rut_body);
  const { data: clientsRows } = await supabase
    .from("clients")
    .select("id, rut_body")
    .in("rut_body", ruts);
  const clientMap = new Map((clientsRows ?? []).map((c) => [c.rut_body, c.id]));

  let activa = 0, cancel = 0, rechaz = 0, totalUf = 0, totalClp = 0;
  const records = consolidated.map((r) => {
    if (r.estado === "ACTIVA") activa++;
    else if (r.estado === "CANCEL") cancel++;
    else rechaz++;
    const monto_clp = Math.round(r.monto_uf * uf);
    totalUf += r.monto_uf;
    totalClp += monto_clp;
    return {
      ...r,
      matched: clientMap.has(r.rut_body),
      client_id: clientMap.get(r.rut_body) ?? null,
      monto_clp,
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    fileDate: fileDate.toISOString().split("T")[0],
    ufValue: uf,
    totals: {
      rows: consolidated.length,
      activa, cancel, rechaz,
      totalUf,
      totalClp,
    },
    records,
  };
}

export async function applyInsurance(formData: FormData): Promise<{
  ok: boolean;
  errors: string[];
  uploadId: string | null;
  recordsInserted: number;
  clientsUpdated: number;
}> {
  const preview = await previewInsurance(formData);
  if (!preview.ok || preview.records.length === 0) {
    return { ok: false, errors: preview.errors.length ? preview.errors : ["No hay registros para procesar."], uploadId: null, recordsInserted: 0, clientsUpdated: 0 };
  }

  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const totalActive = preview.records.filter((r) => r.estado === "ACTIVA").length;
  const matched = preview.records.filter((r) => r.matched).length;

  const { data: upload, error: upErr } = await supabase
    .from("insurance_uploads")
    .insert({
      file_date: preview.fileDate,
      uf_value: preview.ufValue,
      total_records: preview.totals.rows,
      total_active: totalActive,
      total_uf: preview.totals.totalUf,
      total_clp: preview.totals.totalClp,
      matched_clients: matched,
      uploaded_by: profile?.id ?? null,
    })
    .select("id")
    .single();

  if (upErr || !upload) {
    return { ok: false, errors: [`Error creando registro de carga: ${upErr?.message}`], uploadId: null, recordsInserted: 0, clientsUpdated: 0 };
  }

  // Insert records (en batches)
  const records = preview.records.map((r) => ({
    upload_id: upload.id,
    client_id: r.client_id,
    rut_body: r.rut_body,
    client_name: r.client_name,
    origin: r.origin,
    estado: r.estado,
    monto_uf: r.monto_uf,
    monto_clp: r.monto_clp,
    vigencia_desde: r.vigencia_desde?.toISOString().split("T")[0] ?? null,
    vigencia_hasta: r.vigencia_hasta?.toISOString().split("T")[0] ?? null,
    matched: r.matched,
  }));

  const errors: string[] = [];
  let recordsInserted = 0;
  const batchSize = 500;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from("insurance_records").insert(batch);
    if (error) errors.push(`Batch ${i}: ${error.message}`);
    else recordsInserted += batch.length;
  }

  // Update clients matched: actualizar línea de crédito + estado + fecha
  let clientsUpdated = 0;
  const now = new Date().toISOString();
  for (const r of preview.records) {
    if (!r.client_id) continue;
    const { error } = await supabase
      .from("clients")
      .update({
        insurer_name: "Aseguradora Nacional",
        insurer_credit_line_clp: r.monto_clp,
        insurer_credit_updated_at: now,
        insurer_status: r.estado,
      })
      .eq("id", r.client_id);
    if (error) errors.push(`Cliente ${r.rut_body}: ${error.message}`);
    else clientsUpdated++;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/cargadores/seguros");

  return { ok: errors.length === 0, errors, uploadId: upload.id, recordsInserted, clientsUpdated };
}
