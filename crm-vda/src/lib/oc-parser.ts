/**
 * Parser de OC de supermercados desde PDF/Word/Markdown.
 * Cada cadena tiene su parser específico — detección automática por contenido.
 */

import { canonUpc } from "./upc";

export type SuperChain = "Cencosud" | "Walmart" | "Tottus" | "Rendic" | "Alvi" | "SCPD" | "Otro";

export interface ParsedOcLine {
  line_number: number;
  upc_code: string;
  product_name_oc: string;
  quantity_boxes: number;
  units_per_pack: number;
  unit_price: number;
  line_amount: number;
}

export interface ParsedOc {
  chain: SuperChain;
  order_number: string;
  order_date: string | null; // ISO yyyy-mm-dd
  cancellation_date: string | null;
  issuer: string;
  buyer: string;
  delivery_place: string | null;
  total_amount: number;
  payment_terms: string | null;
  lines: ParsedOcLine[];
  raw_excerpt: string; // primeras 500 chars del texto para debug
}

// ---------- Helpers ----------
function clpToInt(s: string): number {
  const cleaned = s.replace(/\$/g, "").replace(/\./g, "").replace(/,\d+$/g, "").replace(/[^\d-]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function clNumber(s: string): number {
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function dmyToIso(s: string): string | null {
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ---------- Detector ----------
export function detectChain(text: string): SuperChain {
  const u = text.toUpperCase();
  if (u.includes("CENCOSUD") || u.includes("SANTA ISABEL") || u.includes("JUMBO") || u.includes("EASY")) return "Cencosud";
  if (u.includes("WALMART") || u.includes("LIDER") || u.includes("LÍDER") || u.includes("ACUENTA")) return "Walmart";
  if (u.includes("TOTTUS") || u.includes("FALABELLA")) return "Tottus";
  if (u.includes("RENDIC")) return "Rendic";
  if (u.includes("ALVI")) return "Alvi";
  if (u.includes("SCPD")) return "SCPD";
  return "Otro";
}

// ---------- Parser genérico para MarkItDown ----------
// Funciona para Cencosud, Tottus, Rendic, Alvi, SCPD (todas exportan a mismo formato)
function parseMarkitdownOC(textRaw: string, chain: SuperChain): ParsedOc {
  // Normalizar: colapsar todos los newlines a espacios (para que regex funcione
  // tanto sobre el .md original como sobre el .doc HTML convertido).
  // Mantener doble espacio entre celdas para que `|` los separe.
  const text = textRaw.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ");

  const find = (re: RegExp): string => {
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };

  const order_number = find(/N[úu]mero de Orden de Compra:\s*\|?\s*([\d]+)/i);
  const order_date_raw = find(/Fecha generaci[óo]n Mensaje:\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/i);
  // "Fecha de Entrega" suele ser la fecha de despacho/recepción.
  // "Fecha de Vencimiento" o "Fecha Cancelación" cuando existe.
  const cancel_date_raw =
    find(/Fecha de Vencimiento:\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
    find(/Fecha de Entrega:\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const issuer = find(/Emisor:\s*\|?\s*([^|]+?)\s*(?:\||Receptor:)/i) || chain;
  const buyer = find(/Informaci[óo]n Comprador\s*\|?\s*([^|]+?)\s*\|/i) || chain;
  const delivery_place = find(/Por cuenta del (?:vendedor|comprador)\s*\|\s*([^|]+?)\s*\|/i) || null;
  const payment_terms = find(/Condiciones de Pago:\s*\|?\s*([^|]+?)\s*\|/i) || null;
  const total_str = find(/TOTAL\s*\|\s*\$([\d.,]+)/i);
  const total_amount = clpToInt(total_str);

  // Líneas: el formato es "N | UPC | descripción | X,XX Cajas | X,XX Unid. | $precio (Precio lista) | ..."
  // El número puede estar al inicio o precedido por texto (Monto, etc.). El UPC tiene 10-14 dígitos.
  // Cajas puede tener variantes: "Cajas", "Cajas de carton".
  // Después del precio puede venir "(Precio lista)" + cargos/descuentos + monto total al final.
  const lines: ParsedOcLine[] = [];
  // Captura: número, UPC, descripción, cantidad cajas, unid/pack, precio unitario
  const lineRe = /(?:^|\||\s)(\d{1,3})\s*\|\s*(\d{10,14})\s*\|\s*([^|]+?)\s*\|\s*([\d.,]+)\s*Cajas[^|]*\|\s*([\d.,]+)\s*Unid\.?\s*\|\s*\$([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const [, lineNum, upc, name, cajasStr, unidStr, precioStr] = m;
    const cajas = Math.round(clNumber(cajasStr));
    const unidPack = Math.round(clNumber(unidStr));
    const precio = clpToInt(precioStr);

    // Buscar el monto total de la línea: el último $XXX antes del siguiente número de línea o "TOTAL"
    // Empezamos desde donde terminó el match y buscamos $XXX
    const afterIdx = m.index + m[0].length;
    const restToScan = text.slice(afterIdx, afterIdx + 400);
    // Tomar el último $monto antes del próximo "| N |" o "TOTAL"
    const cutMatch = restToScan.match(/\|\s*(?:\d{1,3}\s*\||TOTAL)/);
    const segment = cutMatch ? restToScan.slice(0, cutMatch.index) : restToScan;
    const amounts = [...segment.matchAll(/\$\s*([\d.,]+)/g)].map((a) => clpToInt(a[1]));
    const lineAmount = amounts.length > 0 ? amounts[amounts.length - 1] : cajas * unidPack * precio;

    lines.push({
      line_number: parseInt(lineNum, 10),
      upc_code: canonUpc(upc),
      product_name_oc: name.trim(),
      quantity_boxes: cajas,
      units_per_pack: unidPack,
      unit_price: precio,
      line_amount: lineAmount,
    });
  }

  return {
    chain,
    order_number,
    order_date: order_date_raw ? dmyToIso(order_date_raw) : null,
    cancellation_date: cancel_date_raw ? dmyToIso(cancel_date_raw) : null,
    issuer,
    buyer,
    delivery_place,
    total_amount,
    payment_terms,
    lines,
    raw_excerpt: text.slice(0, 500),
  };
}

// ---------- Walmart (Comercionet ORD_WM en HTML) ----------
// Cada celda de la tabla queda en su propia línea tras file-to-text.ts.
// Formato de línea de producto (11 campos consecutivos seguidos de "Descripción" + nombre):
//   Linea | UPC | ITEM | Cod.Prov | Talla/UM | Color/Desc | Cantidad | Precio | Unid/Emp | Empaques | Importe
//   Descripción
//   NOMBRE PRODUCTO
function parseWalmart(textRaw: string): ParsedOc {
  // Colapsar todo a una sola línea con pipes consistentes.
  // Cada celda del HTML viene en su propia línea con "X |" al final, así que al
  // unir con " | " se producen pipes duplicados que hay que colapsar.
  const text = textRaw
    .replace(/\r?\n+/g, " | ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/(\|\s*){2,}/g, "| ")
    .replace(/\s{2,}/g, " ");

  const find = (re: RegExp): string => {
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };

  const order_number = find(/N[úu]mero de Orden de Compra:\s*\|?\s*(\d+)/i);
  const order_date_raw = find(/Fecha generaci[óo]n Mensaje:\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const cancel_date_raw =
    find(/Fecha de Cancelacion:?\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
    find(/Fecha de Embarque:?\s*\|?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const issuer = find(/Emisor:\s*\|?\s*([^|]+?)\s*\|/i) || "Walmart Chile S.A";
  const buyer = find(/Receptor:\s*\|?\s*([^|]+?)\s*\|/i) || "";
  const delivery_place = find(/Lugar de Entrega:\s*\|?\s*([^|]+?)\s*\|/i) || null;
  const payment_terms_raw = find(/Condiciones de Pago:\s*\|?\s*([^|]+?)\s*\|/i);
  const payment_terms = payment_terms_raw ? payment_terms_raw.replace(/\s+/g, " ") : null;
  const total_str = find(/Importe Total\s*\|?\s*\$\s*([\d.,]+)/i);
  const total_amount = clpToInt(total_str);

  // Línea de producto: 11 campos numéricos/cortos + "Descripción" + nombre
  // UPC Walmart tiene 12-14 dígitos. Cantidad y Empaques con coma decimal (44,00).
  // Precio e Importe con punto como separador de miles (18.172, 989.648).
  // Unid/Emp es entero pequeño (6, 12, 24).
  const lineRe =
    /(\d{1,3})\s*\|\s*(\d{12,14})\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*(\d+)\s*\|\s*([\d.,]+)\s*\|\s*([\d.,]+)\s*\|\s*Descripci[óo]n\s*\|?\s*([^|]+?)\s*\|/gi;

  const lines: ParsedOcLine[] = [];
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const [, lineNum, upc, , , , , cantidadStr, precioStr, unidEmpStr, empaquesStr, importeStr, descRaw] = m;
    const empaques = Math.round(clNumber(empaquesStr));
    const cantidad = Math.round(clNumber(cantidadStr));
    const unitsPerPack = parseInt(unidEmpStr, 10);
    const precio = clpToInt(precioStr);
    const importe = clpToInt(importeStr);
    // Walmart usa "Cantidad" y "Empaques" generalmente iguales (cajas pedidas).
    // Preferimos "Empaques" como quantity_boxes; fallback a cantidad si difiere.
    const cajas = empaques > 0 ? empaques : cantidad;
    // Limpiar descripción: "NOMBRE LARGO.....NOMBRE CORTO" → "NOMBRE LARGO"
    const name = descRaw.split(/\.{3,}/)[0].trim();

    lines.push({
      line_number: parseInt(lineNum, 10),
      upc_code: canonUpc(upc),
      product_name_oc: name,
      quantity_boxes: cajas,
      units_per_pack: unitsPerPack,
      unit_price: precio,
      line_amount: importe,
    });
  }

  return {
    chain: "Walmart",
    order_number,
    order_date: order_date_raw ? dmyToIso(order_date_raw) : null,
    cancellation_date: cancel_date_raw ? dmyToIso(cancel_date_raw) : null,
    issuer,
    buyer,
    delivery_place,
    total_amount,
    payment_terms,
    lines,
    raw_excerpt: text.slice(0, 500),
  };
}

// ---------- Entry point ----------
export function parseOc(text: string): ParsedOc {
  const chain = detectChain(text);
  if (chain === "Walmart" || /Comercionet,\s*ORD_WM/i.test(text)) return parseWalmart(text);
  if (chain === "Otro") {
    return {
      chain, order_number: "", order_date: null, cancellation_date: null,
      issuer: "", buyer: "", delivery_place: null, total_amount: 0,
      payment_terms: null, lines: [], raw_excerpt: text.slice(0, 500),
    };
  }
  // Cencosud, Tottus, Rendic, Alvi, SCPD comparten formato MarkItDown
  return parseMarkitdownOC(text, chain);
}
