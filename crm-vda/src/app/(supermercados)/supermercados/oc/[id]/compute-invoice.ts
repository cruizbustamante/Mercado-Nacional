/**
 * Cálculo de facturación supermercados.
 *
 * Fórmula general (igual para todas las cadenas):
 *   neto + log + ILA + IVA = bruto
 *   ILA = neto × ila_rate (variable por SKU; 20.5% vinos, 31.5% licores fuertes, etc.)
 *   IVA = (neto + log) × iva_rate (19%)
 *
 * Diferencia por cadena:
 *  - Cencosud/Tottus/etc: OC trae `unit_price` en NETO por caja → usar directo.
 *  - Walmart: OC trae `unit_price` en BRUTO por caja (con ILA + IVA + log embebida).
 *    Hay que "desbrutar" antes de calcular la factura:
 *       neto_caja = (bruto_caja - log_caja × (1 + iva)) / (1 + ila + iva)
 */

export const DEFAULT_LOGISTICS_PER_UNIT = 360;
export const DEFAULT_ILA_RATE = 0.205;
export const DEFAULT_IVA_RATE = 0.19;

/** ¿La cadena entrega la OC con precio bruto (todo incluido)? */
export function chainSendsGross(chainName: string | null | undefined): boolean {
  if (!chainName) return false;
  const n = chainName.toLowerCase();
  return n.includes("walmart") || n.includes("lider") || n.includes("líder") || n.includes("acuenta");
}

export interface ComputeLineInput {
  boxes: number;
  unitsPerPack: number;
  ocUnitPrice: number;        // por caja, según viene en la OC (neto o bruto según cadena)
  logisticsCostPerUnit: number; // CLP/unidad de venta
  ilaRate: number;
  ivaRate: number;
  isGrossSource: boolean;     // true si ocUnitPrice viene bruto (Walmart)
}

export interface ComputedLine {
  boxes: number;
  unitsPerPack: number;
  unitPriceNet: number;       // precio neto por caja (calculado o = ocUnitPrice según cadena)
  netProduct: number;         // boxes × unitPriceNet
  logisticsTotal: number;     // boxes × unitsPerPack × logisticsCostPerUnit
  ila: number;                // netProduct × ilaRate
  iva: number;                // (netProduct + logisticsTotal) × ivaRate
  grossTotal: number;         // neto + log + ila + iva
}

/**
 * Calcula los totales por línea aplicando desbrutación si la cadena envía bruto.
 *
 * Para cadenas que envían bruto (Walmart), el unit_price de la OC ya incluye
 * ILA + IVA + logística por caja, así que despejamos el neto:
 *   bruto = neto×(1+ila+iva) + log×(1+iva)
 *   neto  = (bruto - log×(1+iva)) / (1+ila+iva)
 */
export function computeLine(input: ComputeLineInput): ComputedLine {
  const { boxes, unitsPerPack, ocUnitPrice, logisticsCostPerUnit, ilaRate, ivaRate, isGrossSource } = input;
  const unitsTotal = boxes * unitsPerPack;
  const logisticsTotal = unitsTotal * logisticsCostPerUnit;
  const logPerBox = unitsPerPack * logisticsCostPerUnit;

  let unitPriceNet: number;
  if (isGrossSource) {
    // Desbrutación: neto por caja = (bruto - log_caja×(1+iva)) / (1+ila+iva)
    const denom = 1 + ilaRate + ivaRate;
    unitPriceNet = denom > 0 ? (ocUnitPrice - logPerBox * (1 + ivaRate)) / denom : 0;
    if (unitPriceNet < 0) unitPriceNet = 0;
  } else {
    unitPriceNet = ocUnitPrice;
  }

  const netProduct = Math.round(boxes * unitPriceNet);
  const ila = Math.round(netProduct * ilaRate);
  const iva = Math.round((netProduct + logisticsTotal) * ivaRate);
  const grossTotal = netProduct + logisticsTotal + ila + iva;

  return {
    boxes,
    unitsPerPack,
    unitPriceNet: Math.round(unitPriceNet),
    netProduct,
    logisticsTotal,
    ila,
    iva,
    grossTotal,
  };
}
