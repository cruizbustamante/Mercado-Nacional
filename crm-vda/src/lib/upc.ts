/**
 * Port de variantes_upc() del Python (PDF Supermercado/Mapeo_sku.py).
 * Genera todas las variantes posibles de un código UPC/EAN para hacer match
 * tolerante a las diferencias de codificación entre cadenas.
 */

export function canonUpc(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().replace(/[^\d]/g, "");
}

export function variantesUpc(u: string): string[] {
  if (!u) return [];
  const v: string[] = [u];

  // Si empieza con "0", agregar sin el "0"
  if (u.startsWith("0")) v.push(u.replace(/^0+/, ""));

  // Si empieza con "1", agregar sin el "1"
  if (u.startsWith("1")) v.push(u.slice(1));

  // Para códigos de 12 dígitos, agregar con "0" y "1" al inicio
  if (u.length === 12) v.push("0" + u, "1" + u);

  // Para códigos de 13 dígitos, agregar con "0" y "1" al inicio
  if (u.length === 13) v.push("0" + u, "1" + u);

  // Si tiene más de 13 dígitos, tomar los últimos 13
  if (u.length > 13) v.push(u.slice(-13));

  // Si tiene más de 12 dígitos, tomar los últimos 12
  if (u.length > 12) v.push(u.slice(-12));

  // Eliminar duplicados y vacíos preservando orden
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (x && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}
