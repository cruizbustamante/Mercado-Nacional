"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readSheet, pickCol, toClpInt } from "@/lib/xlsx-utils";

interface FormState {
  ok: boolean;
  error: string | null;
}

export interface ImportResult {
  ok: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  unmatchedSkus: string[];
}

const QUARTER_MAP: Record<string, { quarter: string; start: string }> = {};
for (let y = 2023; y <= 2030; y++) {
  const y2 = String(y).slice(2);
  QUARTER_MAP[`ene-mar ${y2}`] = { quarter: `${y}-Q1`, start: `${y}-01-01` };
  QUARTER_MAP[`abr-jun ${y2}`] = { quarter: `${y}-Q2`, start: `${y}-04-01` };
  QUARTER_MAP[`jul-sep ${y2}`] = { quarter: `${y}-Q3`, start: `${y}-07-01` };
  QUARTER_MAP[`oct-dic ${y2}`] = { quarter: `${y}-Q4`, start: `${y}-10-01` };
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

/* ── Save single cost cell ──────────────────────────────────────── */

export async function saveCost(fd: FormData): Promise<FormState> {
  const product_id = (fd.get("product_id") as string)?.trim();
  const quarter = (fd.get("quarter") as string)?.trim();
  const costRaw = fd.get("unit_cost_net") as string;

  if (!product_id || !quarter) return { ok: false, error: "Faltan campos." };

  const unit_cost_net = Math.round(Number(costRaw));
  if (isNaN(unit_cost_net) || unit_cost_net < 0)
    return { ok: false, error: "Costo inválido." };

  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return { ok: false, error: "Trimestre inválido." };
  const [, yr, q] = match;
  const quarter_start = `${yr}-${String((Number(q) - 1) * 3 + 1).padStart(2, "0")}-01`;

  const supabase = await createClient();

  const { error } = await supabase
    .from("product_costs")
    .upsert(
      { product_id, quarter, quarter_start, unit_cost_net },
      { onConflict: "product_id,quarter" },
    );

  if (error) return { ok: false, error: error.message };

  if (quarter === getCurrentQuarter()) {
    await supabase
      .from("products")
      .update({ unit_cost_net, unit_cost_updated_at: new Date().toISOString() })
      .eq("id", product_id);
  }

  revalidatePath("/admin/costos");
  return { ok: true, error: null };
}

/* ── Import costs from Excel ────────────────────────────────────── */

export async function importCosts(fd: FormData): Promise<ImportResult> {
  const file = fd.get("file") as File | null;
  if (!file)
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: ["No se seleccionó archivo."], unmatchedSkus: [] };

  const buf = await file.arrayBuffer();
  let rows: Record<string, unknown>[];
  try {
    rows = readSheet(buf);
  } catch (e) {
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: [`Error leyendo archivo: ${(e as Error).message}`], unmatchedSkus: [] };
  }

  if (rows.length === 0)
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: ["Archivo vacío."], unmatchedSkus: [] };

  const sample = rows[0];
  const cSku = pickCol(sample, ["Código Producto", "SKU", "Código", "Cod. Producto", "Cod Producto"]);
  if (!cSku)
    return { ok: false, totalRows: rows.length, inserted: 0, updated: 0, skipped: 0, errors: ["No se encontró columna de SKU/Código Producto."], unmatchedSkus: [] };

  const quarterCols: { key: string; quarter: string; start: string }[] = [];
  for (const key of Object.keys(sample)) {
    const norm = key.normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    const stripped = norm.replace(/^costo\s+/, "");
    const mapped = QUARTER_MAP[stripped] ?? QUARTER_MAP[norm];
    if (mapped) quarterCols.push({ key, ...mapped });
  }

  if (quarterCols.length === 0)
    return { ok: false, totalRows: rows.length, inserted: 0, updated: 0, skipped: 0, errors: ["No se encontraron columnas de trimestres (Ene-Mar 25, Abr-Jun 25, etc.)."], unmatchedSkus: [] };

  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, sku")
    .is("deleted_at", null);

  const skuMap = new Map<string, string>();
  for (const p of products ?? []) {
    skuMap.set(p.sku.trim().toLowerCase(), p.id);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const unmatchedSkus: string[] = [];
  const currentQ = getCurrentQuarter();
  const productUpdates = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const skuRaw = String(row[cSku] ?? "").trim();
    if (!skuRaw) { skipped++; continue; }

    const productId = skuMap.get(skuRaw.toLowerCase());
    if (!productId) {
      if (!unmatchedSkus.includes(skuRaw)) unmatchedSkus.push(skuRaw);
      skipped++;
      continue;
    }

    for (const qc of quarterCols) {
      const val = toClpInt(row[qc.key]);
      if (!val || val <= 0) continue;

      const { data: existing } = await supabase
        .from("product_costs")
        .select("id")
        .eq("product_id", productId)
        .eq("quarter", qc.quarter)
        .maybeSingle();

      if (existing) {
        const { error: err } = await supabase
          .from("product_costs")
          .update({ unit_cost_net: val, quarter_start: qc.start })
          .eq("id", existing.id);
        if (err) errors.push(`Fila ${i + 2}, ${qc.quarter}: ${err.message}`);
        else updated++;
      } else {
        const { error: err } = await supabase
          .from("product_costs")
          .insert({ product_id: productId, quarter: qc.quarter, quarter_start: qc.start, unit_cost_net: val });
        if (err) errors.push(`Fila ${i + 2}, ${qc.quarter}: ${err.message}`);
        else inserted++;
      }

      if (qc.quarter === currentQ) {
        productUpdates.set(productId, val);
      }
    }
  }

  for (const [pid, cost] of productUpdates) {
    await supabase
      .from("products")
      .update({ unit_cost_net: cost, unit_cost_updated_at: new Date().toISOString() })
      .eq("id", pid);
  }

  revalidatePath("/admin/costos");
  revalidatePath("/admin");
  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    inserted,
    updated,
    skipped,
    errors,
    unmatchedSkus,
  };
}

/* ── Import costs by single quarter (SKU + Costo) ──────────────── */

export async function importCostsByQuarter(fd: FormData): Promise<ImportResult> {
  const file = fd.get("file") as File | null;
  const quarter = (fd.get("quarter") as string)?.trim();
  if (!file)
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: ["No se seleccionó archivo."], unmatchedSkus: [] };
  if (!quarter || !/^\d{4}-Q[1-4]$/.test(quarter))
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: ["Periodo inválido."], unmatchedSkus: [] };

  const buf = await file.arrayBuffer();
  let rows: Record<string, unknown>[];
  try {
    rows = readSheet(buf);
  } catch (e) {
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: [`Error leyendo archivo: ${(e as Error).message}`], unmatchedSkus: [] };
  }

  if (rows.length === 0)
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, skipped: 0, errors: ["Archivo vacío."], unmatchedSkus: [] };

  const sample = rows[0];
  const cSku = pickCol(sample, ["SKU", "Código", "Codigo", "Código Producto", "Cod Producto"]);
  const cCost = pickCol(sample, ["Costo Neto", "Costo", "Costo Unitario", "Unit Cost", "Precio Compra", "Cost"]);
  if (!cSku)
    return { ok: false, totalRows: rows.length, inserted: 0, updated: 0, skipped: 0, errors: ["No se encontró columna SKU."], unmatchedSkus: [] };
  if (!cCost)
    return { ok: false, totalRows: rows.length, inserted: 0, updated: 0, skipped: 0, errors: ["No se encontró columna de costo."], unmatchedSkus: [] };

  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match)
    return { ok: false, totalRows: rows.length, inserted: 0, updated: 0, skipped: 0, errors: ["Periodo inválido."], unmatchedSkus: [] };
  const [, yr, q] = match;
  const quarter_start = `${yr}-${String((Number(q) - 1) * 3 + 1).padStart(2, "0")}-01`;

  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("id, sku").is("deleted_at", null);
  const skuMap = new Map<string, string>();
  for (const p of products ?? []) skuMap.set(p.sku.trim().toLowerCase(), p.id);

  let inserted = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  const unmatchedSkus: string[] = [];
  const currentQ = getCurrentQuarter();
  const productUpdates = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const skuRaw = String(row[cSku] ?? "").trim();
    if (!skuRaw) { skipped++; continue; }

    const productId = skuMap.get(skuRaw.toLowerCase());
    if (!productId) {
      if (!unmatchedSkus.includes(skuRaw)) unmatchedSkus.push(skuRaw);
      skipped++;
      continue;
    }

    const val = toClpInt(row[cCost]);
    if (!val || val <= 0) { skipped++; continue; }

    const { data: existing } = await supabase
      .from("product_costs").select("id")
      .eq("product_id", productId).eq("quarter", quarter).maybeSingle();

    if (existing) {
      const { error: err } = await supabase
        .from("product_costs").update({ unit_cost_net: val, quarter_start }).eq("id", existing.id);
      if (err) errors.push(`Fila ${i + 2}: ${err.message}`);
      else updated++;
    } else {
      const { error: err } = await supabase
        .from("product_costs").insert({ product_id: productId, quarter, quarter_start, unit_cost_net: val });
      if (err) errors.push(`Fila ${i + 2}: ${err.message}`);
      else inserted++;
    }

    if (quarter === currentQ) productUpdates.set(productId, val);
  }

  for (const [pid, cost] of productUpdates) {
    await supabase.from("products")
      .update({ unit_cost_net: cost, unit_cost_updated_at: new Date().toISOString() })
      .eq("id", pid);
  }

  revalidatePath("/admin/costos");
  revalidatePath("/configuracion/productos");
  return { ok: errors.length === 0, totalRows: rows.length, inserted, updated, skipped, errors, unmatchedSkus };
}

/* ── Save logistic cost setting ────────────────────────────────── */

export async function saveLogisticCost(prev: FormState, fd: FormData): Promise<FormState> {
  const costRaw = fd.get("cost_net_per_unit") as string;
  const cost = Math.round(Number(costRaw));
  if (isNaN(cost) || cost < 0) return { ok: false, error: "Costo logístico inválido." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("logistics_costs")
    .select("id")
    .is("product_id", null)
    .is("warehouse_id", null)
    .is("client_id", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("logistics_costs")
      .update({ cost_net_per_unit: cost })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("logistics_costs")
      .insert({ cost_net_per_unit: cost, iva_rate: 0.19, valid_from: new Date().toISOString().slice(0, 10) });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/costos");
  return { ok: true, error: null };
}

/* ── Rappel CRUD ────────────────────────────────────────────────── */

export async function saveRappel(prev: FormState, fd: FormData): Promise<FormState> {
  const id = (fd.get("id") as string)?.trim() || null;
  const chain_id = (fd.get("chain_id") as string)?.trim();
  if (!chain_id) return { ok: false, error: "Cadena es obligatoria." };

  const label = (fd.get("label") as string)?.trim() || null;
  const rappel_pct = Number(fd.get("rappel_pct") ?? 0);
  const centralizacion_pct = Number(fd.get("centralizacion_pct") ?? 0);
  const merma_pct = Number(fd.get("merma_pct") ?? 0);
  const reposicion_pct = Number(fd.get("reposicion_pct") ?? 0);
  const total_pct = Number(fd.get("total_pct") ?? 0);

  const extraNetMode = fd.get("extra_net_mode") as string;
  const extra_net_pct = extraNetMode === "pct" ? Number(fd.get("extra_net_pct") ?? 0) : null;
  const extra_net_fixed = extraNetMode === "fixed" ? ((fd.get("extra_net_fixed") as string)?.trim() || null) : null;

  const fecha_acuerdo = (fd.get("fecha_acuerdo") as string)?.trim() || null;
  const fecha_actualizacion = (fd.get("fecha_actualizacion") as string)?.trim() || null;

  const payload = {
    chain_id,
    label,
    rappel_pct,
    centralizacion_pct,
    merma_pct,
    extra_net_pct,
    extra_net_fixed,
    reposicion_pct,
    total_pct,
    fecha_acuerdo,
    fecha_actualizacion,
  };

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("rappel_agreements").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("rappel_agreements").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/costos");
  return { ok: true, error: null };
}

export async function deleteRappel(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("rappel_agreements").delete().eq("id", id);
  revalidatePath("/admin/costos");
}
