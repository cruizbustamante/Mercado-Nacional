import * as XLSX from "xlsx";

/**
 * Lee un buffer xlsx, devuelve la primera hoja como objetos
 * cuyas keys son los headers de la fila 1 normalizados.
 */
export function readSheet(buffer: ArrayBuffer | Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
}

/**
 * Normaliza header: lowercase, sin acentos, sin espacios extra.
 */
export function normHeader(s: string): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Resuelve nombre de columna entre candidatos (acepta variaciones).
 */
export function pickCol(row: Record<string, unknown>, candidates: string[]): string | null {
  const headerMap = new Map<string, string>();
  for (const key of Object.keys(row)) {
    headerMap.set(normHeader(key), key);
  }
  for (const cand of candidates) {
    const k = normHeader(cand);
    const found = headerMap.get(k);
    if (found) return found;
  }
  for (const cand of candidates) {
    const k = normHeader(cand);
    for (const [norm, orig] of headerMap) {
      if (norm.startsWith(k)) return orig;
    }
  }
  return null;
}

/**
 * Parsea número chileno: "1.234,56" → 1234.56. Acepta number directo.
 */
export function parseClNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Convierte número CL a entero CLP (redondeo). */
export function toClpInt(v: unknown): number {
  const n = parseClNumber(v);
  return n === null ? 0 : Math.round(n);
}

/** Parsea fecha tolerante (Date, ISO, dd/mm/yyyy, serial Excel). */
export function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  const s = String(v).trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(s);
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
  }
  return null;
}
