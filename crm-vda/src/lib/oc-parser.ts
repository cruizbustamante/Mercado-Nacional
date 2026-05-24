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
function parseMarkitdownOC(text: string, chain: SuperChain): ParsedOc {
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

  // Líneas: patrón "| N | UPC | descripción | X,XX Cajas | X,XX Unid. | $precio (...) | ..."
  // El campo "Cajas" puede tener variantes: "Cajas", "Cajas de carton", etc.
  const lines: ParsedOcLine[] = [];
  const lineRe = /\|\s*(\d+)\s*\|\s*(\d{10,14})\s*\|\s*([^|]+?)\s*\|\s*([\d.,]+)\s*Cajas[^|]*\|\s*([\d.,]+)\s*Unid\.?\s*\|\s*\$([\d.,]+)(?:\s*\([^)]*\))?\s*\|[^|]*\|[^|]*\|\s*\$?([\d.,]*)\s*\|\s*\$([\d.,]+)\s*\|/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const [, lineNum, upc, name, cajasStr, unidStr, precioStr, , totalStr] = m;
    lines.push({
      line_number: parseInt(lineNum, 10),
      upc_code: canonUpc(upc),
      product_name_oc: name.trim(),
      quantity_boxes: Math.round(clNumber(cajasStr)),
      units_per_pack: Math.round(clNumber(unidStr)),
      unit_price: clpToInt(precioStr),
      line_amount: clpToInt(totalStr),
    });
  }

  // Fallback más simple si el regex anterior no matcheó nada
  if (lines.length === 0) {
    const simpleRe = /\|\s*(\d+)\s*\|\s*(\d{10,14})\s*\|\s*([^|]+?)\s*\|\s*([\d.,]+)\s*Cajas[^|]*\|\s*([\d.,]+)\s*Unid\.?\s*\|\s*\$([\d.,]+)/gi;
    let m2: RegExpExecArray | null;
    while ((m2 = simpleRe.exec(text)) !== null) {
      const [, lineNum, upc, name, cajasStr, unidStr, precioStr] = m2;
      const cajas = Math.round(clNumber(cajasStr));
      const unidPack = Math.round(clNumber(unidStr));
      const precio = clpToInt(precioStr);
      lines.push({
        line_number: parseInt(lineNum, 10),
        upc_code: canonUpc(upc),
        product_name_oc: name.trim(),
        quantity_boxes: cajas,
        units_per_pack: unidPack,
        unit_price: precio,
        line_amount: cajas * unidPack * precio,
      });
    }
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

// ---------- Walmart (pendiente ejemplo PDF) ----------
function parseWalmart(text: string): ParsedOc {
  // TODO: implementar cuando tenga el PDF de Walmart parseado
  // Por ahora intenta el genérico
  return parseMarkitdownOC(text, "Walmart");
}

// ---------- Entry point ----------
export function parseOc(text: string): ParsedOc {
  const chain = detectChain(text);
  if (chain === "Walmart") return parseWalmart(text);
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
