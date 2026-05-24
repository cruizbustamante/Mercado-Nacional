"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readSheet, pickCol, toClpInt } from "@/lib/xlsx-utils";
import { parseRut } from "@/lib/rut";

export interface ClientUploadResult {
  ok: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  errors: string[];
  newPaymentTerms: string[];
  unknownSalespeople: string[];
}

export async function uploadClients(formData: FormData): Promise<ClientUploadResult> {
  const file = formData.get("file") as File | null;
  if (!file) {
    return {
      ok: false, totalRows: 0, inserted: 0, updated: 0,
      errors: ["No se recibió archivo."], newPaymentTerms: [], unknownSalespeople: [],
    };
  }

  const buf = await file.arrayBuffer();
  let rows: Record<string, unknown>[];
  try {
    rows = readSheet(buf);
  } catch (e) {
    return {
      ok: false, totalRows: 0, inserted: 0, updated: 0,
      errors: [`Error leyendo Excel: ${(e as Error).message}`],
      newPaymentTerms: [], unknownSalespeople: [],
    };
  }
  if (rows.length === 0) {
    return {
      ok: false, totalRows: 0, inserted: 0, updated: 0,
      errors: ["El archivo no tiene filas."],
      newPaymentTerms: [], unknownSalespeople: [],
    };
  }

  const sample = rows[0];
  const cRut = pickCol(sample, ["RUT", "R.U.T", "Id. Nacional", "Id Nacional", "RUT Cliente"]);
  const cName = pickCol(sample, ["Razón Social", "Razon Social", "Nombre Cliente", "Cliente", "Nombre"]);
  const cAddr = pickCol(sample, ["Dirección", "Direccion", "Address"]);
  const cCommune = pickCol(sample, ["Comuna"]);
  const cCity = pickCol(sample, ["Ciudad", "City"]);
  const cEmail = pickCol(sample, ["Email", "Correo"]);
  const cPhone = pickCol(sample, ["Teléfono", "Telefono", "Phone"]);
  const cPayTerm = pickCol(sample, ["Condición Pago", "Condicion Pago", "Forma de Pago"]);
  const cSalesp = pickCol(sample, ["Ejecutivo", "Vendedor", "Salesperson"]);
  const cChannel = pickCol(sample, ["Canal", "Canal Venta", "Channel"]);
  const cCreditLine = pickCol(sample, ["Línea Crédito", "Linea Credito", "Crédito Interno", "Credit Line"]);

  if (!cRut || !cName) {
    return {
      ok: false, totalRows: rows.length, inserted: 0, updated: 0,
      errors: ["No se encontraron columnas obligatorias: RUT y Nombre/Razón Social."],
      newPaymentTerms: [], unknownSalespeople: [],
    };
  }

  const supabase = await createClient();

  // Auto-create payment terms
  const payTerms = new Set<string>();
  for (const row of rows) {
    if (cPayTerm && row[cPayTerm]) payTerms.add(String(row[cPayTerm]).trim());
  }
  const newPaymentTerms: string[] = [];
  if (payTerms.size > 0) {
    const { data: existing } = await supabase.from("payment_terms").select("name").in("name", Array.from(payTerms));
    const existingSet = new Set((existing ?? []).map((r) => r.name));
    const toInsert = Array.from(payTerms).filter((p) => !existingSet.has(p));
    if (toInsert.length > 0) {
      const payload = toInsert.map((name) => {
        let days = 0;
        for (const d of ["120", "90", "75", "60", "45", "30", "15"]) {
          if (name.includes(d)) { days = parseInt(d, 10); break; }
        }
        return { name, days };
      });
      await supabase.from("payment_terms").insert(payload);
      newPaymentTerms.push(...toInsert);
    }
  }

  // Map lookups
  const [{ data: ptRows }, { data: profileRows }, { data: channelRows }] = await Promise.all([
    supabase.from("payment_terms").select("id, name"),
    supabase.from("profiles").select("id, email, full_name, short_name"),
    supabase.from("sales_channels").select("id, name"),
  ]);
  const ptMap = new Map((ptRows ?? []).map((r) => [r.name, r.id]));
  const channelMap = new Map((channelRows ?? []).map((r) => [r.name.toLowerCase(), r.id]));

  // Normalizar nombres de ejecutivos: matchear por short_name, full_name o email
  function findSalespersonId(raw: string): string | null {
    const v = raw.trim().toLowerCase();
    if (!v) return null;
    for (const p of profileRows ?? []) {
      if (
        p.email?.toLowerCase() === v ||
        p.full_name?.toLowerCase() === v ||
        p.short_name?.toLowerCase() === v ||
        p.full_name?.toLowerCase().includes(v) ||
        v.includes((p.short_name ?? "").toLowerCase())
      ) return p.id;
    }
    return null;
  }

  // RUTs existentes
  const rutBodies: number[] = [];
  for (const row of rows) {
    const r = parseRut(row[cRut] as string);
    if (r) rutBodies.push(r.body);
  }
  const { data: existingClients } = await supabase
    .from("clients")
    .select("id, rut_body")
    .in("rut_body", rutBodies);
  const existingRutSet = new Set((existingClients ?? []).map((c) => c.rut_body));

  let inserted = 0, updated = 0;
  const errors: string[] = [];
  const unknownSalespeople = new Set<string>();

  for (const row of rows) {
    const r = parseRut(row[cRut] as string);
    if (!r) {
      errors.push(`Fila con RUT inválido: ${JSON.stringify(row[cRut])}`);
      continue;
    }
    const name = String(row[cName] ?? "").trim();
    if (!name) {
      errors.push(`RUT ${r.body}: sin nombre, omitido.`);
      continue;
    }

    const payTermName = cPayTerm && row[cPayTerm] ? String(row[cPayTerm]).trim() : null;
    const salespName = cSalesp && row[cSalesp] ? String(row[cSalesp]).trim() : null;
    const channelName = cChannel && row[cChannel] ? String(row[cChannel]).trim() : null;

    const salesp_id = salespName ? findSalespersonId(salespName) : null;
    if (salespName && !salesp_id) unknownSalespeople.add(salespName);

    const payload = {
      rut_body: r.body,
      rut_dv: r.dv,
      name,
      address: cAddr && row[cAddr] ? String(row[cAddr]).trim() : null,
      commune: cCommune && row[cCommune] ? String(row[cCommune]).trim() : null,
      city: cCity && row[cCity] ? String(row[cCity]).trim() : null,
      email: cEmail && row[cEmail] ? String(row[cEmail]).trim() : null,
      phone: cPhone && row[cPhone] ? String(row[cPhone]).trim() : null,
      payment_term_id: payTermName ? ptMap.get(payTermName) ?? null : null,
      salesperson_id: salesp_id,
      channel_id: channelName ? channelMap.get(channelName.toLowerCase()) ?? null : null,
      credit_line_clp: cCreditLine ? toClpInt(row[cCreditLine]) : 0,
    };

    if (existingRutSet.has(r.body)) {
      const { error } = await supabase.from("clients").update(payload).eq("rut_body", r.body);
      if (error) errors.push(`RUT ${r.body}: ${error.message}`);
      else updated++;
    } else {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) errors.push(`RUT ${r.body}: ${error.message}`);
      else inserted++;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/cargadores/clientes");

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    inserted, updated, errors,
    newPaymentTerms,
    unknownSalespeople: Array.from(unknownSalespeople),
  };
}
