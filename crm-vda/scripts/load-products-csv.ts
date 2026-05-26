/**
 * Carga masiva de productos desde CSV (formato "Nueva Version - Lista Productos").
 *
 * Uso:  npx tsx scripts/load-products-csv.ts <ruta-al-csv>
 *
 * Lee .env.local para NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * RLS está deshabilitado en products/product_categories/brands.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// CSV parser (RFC 4180 — maneja campos con comillas y comas internas)
// ---------------------------------------------------------------------------
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function readCSV(filePath: string): Record<string, string>[] {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Parseo de números formato CL (todo string, nunca pre-parseado)
// ---------------------------------------------------------------------------
function parseClNum(v: string): number | null {
  const s = v.trim().replace(/^\$\s*/, "");
  if (!s) return null;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function toInt(v: string): number {
  const n = parseClNum(v);
  return n === null ? 0 : Math.round(n);
}

function parsePct(v: string): number {
  const s = v.trim().replace(/%$/, "");
  const n = parseClNum(s);
  return n === null ? 0 : n;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Uso: npx tsx scripts/load-products-csv.ts <ruta-csv>");
    process.exit(1);
  }

  console.log(`Leyendo ${csvPath}...`);
  const rows = readCSV(resolve(csvPath));
  console.log(`${rows.length} filas leídas.`);

  // --- Recolectar categorías y marcas únicas ---
  const catSet = new Set<string>();
  const brandSet = new Set<string>();
  for (const r of rows) {
    const cat = r["Categoria"]?.trim();
    const brand = r["Marca"]?.trim();
    if (cat) catSet.add(cat);
    if (brand) brandSet.add(brand);
  }

  // --- Crear categorías faltantes ---
  if (catSet.size > 0) {
    const { data: existingCats } = await supabase
      .from("product_categories")
      .select("name")
      .in("name", Array.from(catSet));
    const existSet = new Set((existingCats ?? []).map((r) => r.name));
    const newCats = Array.from(catSet).filter((c) => !existSet.has(c));
    if (newCats.length > 0) {
      const { error } = await supabase
        .from("product_categories")
        .insert(newCats.map((name) => ({ name })));
      if (error) console.error("Error creando categorías:", error.message);
      else console.log(`${newCats.length} categorías nuevas: ${newCats.join(", ")}`);
    }
  }

  // --- Crear marcas faltantes ---
  if (brandSet.size > 0) {
    const { data: existingBrands } = await supabase
      .from("brands")
      .select("name")
      .in("name", Array.from(brandSet));
    const existSet = new Set((existingBrands ?? []).map((r) => r.name));
    const newBrands = Array.from(brandSet).filter((b) => !existSet.has(b));
    if (newBrands.length > 0) {
      const { error } = await supabase
        .from("brands")
        .insert(newBrands.map((name) => ({ name })));
      if (error) console.error("Error creando marcas:", error.message);
      else console.log(`${newBrands.length} marcas nuevas: ${newBrands.join(", ")}`);
    }
  }

  // --- Mapas de FK ---
  const [{ data: catRows }, { data: brandRows }] = await Promise.all([
    supabase.from("product_categories").select("id, name"),
    supabase.from("brands").select("id, name"),
  ]);
  const catMap = new Map((catRows ?? []).map((r) => [r.name, r.id]));
  const brandMap = new Map((brandRows ?? []).map((r) => [r.name, r.id]));

  // --- Preparar payloads ---
  const payloads: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const name = row["PRODUCTO"]?.trim() ?? "";
    const sku = row["SKU"]?.trim() ?? "";
    if (!sku || !name) {
      errors.push(`Fila sin SKU/nombre: ${name || "(vacío)"}`);
      continue;
    }

    const unitsPerBox = Math.max(1, toInt(row["Unidades Por Caja"]) || 12);
    const baseNet = toInt(row["Precio Neto"]);
    const baseGross = toInt(row["Precio Total"]);
    const ivaPct = parsePct(row["% IVA"]);
    const ilaPct = parsePct(row["% ILA"]);
    const discountPct = parsePct(row["Descuento Maximo a Aplicar Sobre Valor Neto"]);

    const ivaRate = ivaPct / 100;
    const ilaRate = ilaPct / 100;
    const maxDiscountPct = Math.round(discountPct);
    const minPriceNet = Math.round(baseNet * (1 - discountPct / 100));

    const catName = row["Categoria"]?.trim() || null;
    const brandName = row["Marca"]?.trim() || null;
    const wineLine = row["Linea vino"]?.trim() || null;
    const grape = row["Cepa"]?.trim() || null;

    payloads.push({
      sku,
      name,
      units_per_box: unitsPerBox,
      base_price_net: baseNet,
      base_price_gross: baseGross,
      iva_rate: ivaRate,
      ila_rate: ilaRate,
      max_discount_pct: maxDiscountPct,
      min_price_net: minPriceNet,
      category_id: catName ? catMap.get(catName) ?? null : null,
      brand_id: brandName ? brandMap.get(brandName) ?? null : null,
      wine_line: wineLine || null,
      grape: grape || null,
      is_active: true,
    });
  }

  // Debug: mostrar primer producto
  if (payloads.length > 0) {
    console.log("Ejemplo primer producto:", JSON.stringify(payloads[0], null, 2));
  }

  console.log(`${payloads.length} productos a cargar, ${errors.length} errores de parseo.`);
  if (errors.length > 0) {
    console.warn("Errores de parseo:");
    errors.forEach((e) => console.warn(`  - ${e}`));
  }

  // --- Upsert en lotes de 50 ---
  const BATCH = 50;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < payloads.length; i += BATCH) {
    const batch = payloads.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "sku", ignoreDuplicates: false })
      .select("id");

    if (error) {
      console.error(`\nError lote ${i / BATCH + 1}: ${error.message}`);
      failed += batch.length;
    } else {
      processed += data?.length ?? batch.length;
      process.stdout.write(`\r  Lote ${Math.floor(i / BATCH) + 1}/${Math.ceil(payloads.length / BATCH)} — ${processed} productos procesados`);
    }
  }

  console.log(`\n\nResumen:`);
  console.log(`  Procesados: ${processed}`);
  console.log(`  Fallidos:   ${failed}`);
  console.log(`  Categorías: ${catSet.size} (${catMap.size} en DB)`);
  console.log(`  Marcas:     ${brandSet.size} (${brandMap.size} en DB)`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
