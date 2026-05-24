"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readSheet, pickCol, parseClNumber, toClpInt } from "@/lib/xlsx-utils";

export interface ImportResult {
  ok: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  errors: string[];
  newCategories: string[];
  newBrands: string[];
}

export async function importProducts(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file") as File | null;
  if (!file) {
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, errors: ["No se recibió archivo."], newCategories: [], newBrands: [] };
  }

  const buf = await file.arrayBuffer();
  let rows: Record<string, unknown>[];
  try {
    rows = readSheet(buf);
  } catch (e) {
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, errors: [`Error leyendo Excel: ${(e as Error).message}`], newCategories: [], newBrands: [] };
  }

  if (rows.length === 0) {
    return { ok: false, totalRows: 0, inserted: 0, updated: 0, errors: ["El archivo no tiene filas."], newCategories: [], newBrands: [] };
  }

  const sample = rows[0];
  const cSku = pickCol(sample, ["SKU", "Código", "Codigo", "Cód. Producto"]);
  const cName = pickCol(sample, ["Nombre", "Descripción", "Descripcion", "Producto"]);
  const cCat = pickCol(sample, ["Categoría", "Categoria"]);
  const cBrand = pickCol(sample, ["Marca", "Brand"]);
  const cSupplier = pickCol(sample, ["Proveedor", "Supplier"]);
  const cUpb = pickCol(sample, ["Un x Caja", "Unidades por Caja", "UnxCaja", "UPB", "Uds/Caja"]);
  const cBaseNet = pickCol(sample, ["Precio Neto Base", "Neto Base", "Precio Neto"]);
  const cBaseGross = pickCol(sample, ["Precio Bruto Base", "Bruto Base", "Precio Bruto"]);
  const cMinNet = pickCol(sample, ["Precio Mínimo Neto", "Neto Final", "Precio Mínimo", "Min Neto"]);
  const cCost = pickCol(sample, ["Costo Neto", "Costo", "Costo Unitario", "Precio Compra"]);
  const cIva = pickCol(sample, ["IVA %", "IVA", "Tasa IVA"]);
  const cIla = pickCol(sample, ["ILA %", "ILA", "Tasa ILA"]);
  const cCcVinos = pickCol(sample, ["CC Vinos", "CC"]);
  const cWineLine = pickCol(sample, ["Línea Vino", "Linea Vino", "Línea", "Wine Line"]);
  const cGrape = pickCol(sample, ["Cepa", "Grape", "Varietal"]);
  const cActive = pickCol(sample, ["Activo", "Estado", "Active"]);

  if (!cSku || !cName) {
    return {
      ok: false, totalRows: rows.length, inserted: 0, updated: 0,
      errors: ["No se encontraron columnas obligatorias: SKU y Nombre."],
      newCategories: [], newBrands: [],
    };
  }

  const supabase = await createClient();

  const categories = new Set<string>();
  const brands = new Set<string>();
  for (const row of rows) {
    if (cCat && row[cCat]) categories.add(String(row[cCat]).trim());
    if (cBrand && row[cBrand]) brands.add(String(row[cBrand]).trim());
  }

  const newCategories: string[] = [];
  const newBrands: string[] = [];

  if (categories.size > 0) {
    const { data: existing } = await supabase
      .from("product_categories").select("name").in("name", Array.from(categories));
    const existingSet = new Set((existing ?? []).map((r) => r.name));
    const toInsert = Array.from(categories).filter((c) => !existingSet.has(c));
    if (toInsert.length > 0) {
      await supabase.from("product_categories").insert(toInsert.map((name) => ({ name })));
      newCategories.push(...toInsert);
    }
  }

  if (brands.size > 0) {
    const { data: existing } = await supabase
      .from("brands").select("name").in("name", Array.from(brands));
    const existingSet = new Set((existing ?? []).map((r) => r.name));
    const toInsert = Array.from(brands).filter((b) => !existingSet.has(b));
    if (toInsert.length > 0) {
      await supabase.from("brands").insert(toInsert.map((name) => ({ name })));
      newBrands.push(...toInsert);
    }
  }

  const [{ data: catRows }, { data: brandRows }] = await Promise.all([
    supabase.from("product_categories").select("id, name"),
    supabase.from("brands").select("id, name"),
  ]);
  const catMap = new Map((catRows ?? []).map((r) => [r.name, r.id]));
  const brandMap = new Map((brandRows ?? []).map((r) => [r.name, r.id]));

  const skus = rows.map((r) => String(r[cSku] ?? "").trim()).filter(Boolean);
  const { data: existingProducts } = await supabase
    .from("products").select("id, sku").in("sku", skus);
  const existingSkuSet = new Set((existingProducts ?? []).map((p) => p.sku));

  let inserted = 0, updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const sku = String(row[cSku] ?? "").trim();
    if (!sku) continue;
    const name = String(row[cName] ?? "").trim();
    if (!name) { errors.push(`SKU ${sku}: sin nombre, omitido.`); continue; }

    const catName = cCat && row[cCat] ? String(row[cCat]).trim() : null;
    const brandName = cBrand && row[cBrand] ? String(row[cBrand]).trim() : null;
    const upb = cUpb ? Math.max(1, Math.round(parseClNumber(row[cUpb]) ?? 12)) : 12;
    const baseNet = cBaseNet ? toClpInt(row[cBaseNet]) : 0;
    const baseGross = cBaseGross ? toClpInt(row[cBaseGross]) : 0;
    const minNet = cMinNet ? toClpInt(row[cMinNet]) : 0;
    const costRaw = cCost ? parseClNumber(row[cCost]) : null;
    const cost = costRaw !== null ? Math.round(costRaw) : null;
    const ivaRaw = cIva ? parseClNumber(row[cIva]) : null;
    const ilaRaw = cIla ? parseClNumber(row[cIla]) : null;
    const supplier = cSupplier && row[cSupplier] ? String(row[cSupplier]).trim() : null;
    const cc_vinos = cCcVinos && row[cCcVinos] ? String(row[cCcVinos]).trim() : null;
    const wine_line = cWineLine && row[cWineLine] ? String(row[cWineLine]).trim() : null;
    const grape = cGrape && row[cGrape] ? String(row[cGrape]).trim() : null;

    let is_active = true;
    if (cActive && row[cActive] != null) {
      const v = String(row[cActive]).trim().toLowerCase();
      is_active = v === "sí" || v === "si" || v === "true" || v === "1" || v === "activo";
    }

    const payload: Record<string, unknown> = {
      sku, name,
      category_id: catName ? catMap.get(catName) ?? null : null,
      brand_id: brandName ? brandMap.get(brandName) ?? null : null,
      supplier, cc_vinos, wine_line, grape,
      units_per_box: upb,
      base_price_net: baseNet,
      base_price_gross: baseGross,
      min_price_net: minNet,
      is_active,
    };
    if (ivaRaw !== null) payload.iva_rate = ivaRaw;
    if (ilaRaw !== null) payload.ila_rate = ilaRaw;
    if (cost !== null && cost > 0) {
      payload.unit_cost_net = cost;
      payload.unit_cost_updated_at = new Date().toISOString();
    }

    if (existingSkuSet.has(sku)) {
      const { error } = await supabase.from("products").update(payload).eq("sku", sku);
      if (error) errors.push(`SKU ${sku}: ${error.message}`);
      else updated++;
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) errors.push(`SKU ${sku}: ${error.message}`);
      else inserted++;
    }
  }

  revalidatePath("/configuracion/productos");
  return { ok: errors.length === 0, totalRows: rows.length, inserted, updated, errors, newCategories, newBrands };
}
