"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readSheet, pickCol } from "@/lib/xlsx-utils";
import { canonUpc, variantesUpc } from "@/lib/upc";
import { getCurrentProfile } from "@/lib/auth";

export interface UpcMappingFormState { ok: boolean; error: string | null }

export interface UpcImportResult {
  ok: boolean;
  totalRows: number;
  variantsGenerated: number;
  inserted: number;
  updated: number;
  productsMatched: number;
  productsMissing: string[]; // SKUs en Excel que no existen en products
  errors: string[];
}

export async function importUpcMapping(formData: FormData): Promise<UpcImportResult> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, totalRows: 0, variantsGenerated: 0, inserted: 0, updated: 0, productsMatched: 0, productsMissing: [], errors: ["Selecciona un archivo Excel."] };
  }

  const buf = await file.arrayBuffer();
  let rows: Record<string, unknown>[];
  try {
    rows = readSheet(buf);
  } catch (e) {
    return { ok: false, totalRows: 0, variantsGenerated: 0, inserted: 0, updated: 0, productsMatched: 0, productsMissing: [], errors: [`Error leyendo Excel: ${(e as Error).message}`] };
  }
  if (rows.length === 0) {
    return { ok: false, totalRows: 0, variantsGenerated: 0, inserted: 0, updated: 0, productsMatched: 0, productsMissing: [], errors: ["El archivo no tiene filas."] };
  }

  const sample = rows[0];
  const cUpc = pickCol(sample, ["Cod_UPC", "UPC", "Codigo_UPC", "codigo_upc", "EAN", "DUN"]);
  const cSku = pickCol(sample, ["sku", "SKU", "Codigo", "Código"]);
  const cProd = pickCol(sample, ["producto", "Producto", "descripcion", "Descripción", "nombre", "Nombre"]);
  const cCat = pickCol(sample, ["categoria", "Categoría", "Categoria"]);
  const cBrand = pickCol(sample, ["marca", "Marca"]);

  if (!cUpc || !cSku) {
    return { ok: false, totalRows: rows.length, variantsGenerated: 0, inserted: 0, updated: 0, productsMatched: 0, productsMissing: [], errors: ["No se encontraron columnas obligatorias: Cod_UPC (o UPC) y sku."] };
  }

  const supabase = await createClient();
  const profile = await getCurrentProfile();

  // Cargar productos para hacer match por SKU
  const skus = Array.from(new Set(rows.map((r) => String(r[cSku] ?? "").trim()).filter(Boolean)));
  const { data: products } = await supabase.from("products").select("id, sku").in("sku", skus).is("deleted_at", null);
  const productMap = new Map((products ?? []).map((p) => [p.sku, p.id]));
  const productsMissing = skus.filter((s) => !productMap.has(s));

  // Preparar payloads expandiendo variantes
  const seen = new Set<string>();
  const payloads: Array<{ upc: string; product_id: string | null; product_name_oc: string | null; category_name: string | null; brand_name: string | null; created_by: string | null }> = [];

  for (const row of rows) {
    const upcRaw = canonUpc(row[cUpc] as string);
    if (!upcRaw) continue;
    const sku = String(row[cSku] ?? "").trim();
    const product_id = productMap.get(sku) ?? null;
    const product_name_oc = cProd && row[cProd] ? String(row[cProd]).trim() : null;
    const category_name = cCat && row[cCat] ? String(row[cCat]).trim() : null;
    const brand_name = cBrand && row[cBrand] ? String(row[cBrand]).trim() : null;
    for (const variant of variantesUpc(upcRaw)) {
      if (seen.has(variant)) continue;
      seen.add(variant);
      payloads.push({ upc: variant, product_id, product_name_oc, category_name, brand_name, created_by: profile?.id ?? null });
    }
  }

  // Upsert en batches
  const errors: string[] = [];
  let inserted = 0, updated = 0;
  const batchSize = 500;
  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    const { error, data } = await supabase
      .from("sku_upc_mapping")
      .upsert(batch, { onConflict: "upc", ignoreDuplicates: false })
      .select("id");
    if (error) errors.push(`Batch ${i}: ${error.message}`);
    else inserted += data?.length ?? 0;
  }
  // Para distinguir inserted vs updated requeriría tracking previo; aquí inserted = total upserted
  updated = 0;

  revalidatePath("/admin/mapeo-upc");
  revalidatePath("/admin");

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    variantsGenerated: payloads.length,
    inserted, updated,
    productsMatched: payloads.filter((p) => p.product_id).length,
    productsMissing,
    errors,
  };
}

export async function saveUpcMapping(prev: UpcMappingFormState, fd: FormData): Promise<UpcMappingFormState> {
  const id = fd.get("id") as string | null;
  const upcRaw = (fd.get("upc") as string)?.trim() ?? "";
  const upc = canonUpc(upcRaw);
  if (!upc) return { ok: false, error: "UPC obligatorio (solo dígitos)." };

  const product_id = (fd.get("product_id") as string)?.trim() || null;
  const product_name_oc = ((fd.get("product_name_oc") as string) ?? "").trim() || null;
  const category_name = ((fd.get("category_name") as string) ?? "").trim() || null;
  const brand_name = ((fd.get("brand_name") as string) ?? "").trim() || null;
  const notes = ((fd.get("notes") as string) ?? "").trim() || null;

  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const payload = { upc, product_id, product_name_oc, category_name, brand_name, notes, created_by: profile?.id ?? null };

  if (id) {
    const { error } = await supabase.from("sku_upc_mapping").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("sku_upc_mapping").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/mapeo-upc");
  return { ok: true, error: null };
}

export async function deleteUpcMapping(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("sku_upc_mapping").delete().eq("id", id);
  revalidatePath("/admin/mapeo-upc");
}
