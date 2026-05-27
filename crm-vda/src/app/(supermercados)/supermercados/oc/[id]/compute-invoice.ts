/**
 * Cálculo de facturación supermercados.
 *
 * Fórmula general (igual para todas las cadenas):
 *   neto + log + ILA + IVA = bruto
 *   ILA = neto × ila_rate (variable por SKU; 20.5% vinos, 31.5% licores fuertes, etc.)
 *   IVA = (neto + log) × iva_rate (19%)
 *
 * Todas las cadenas (Cencosud, Walmart, Tottus, SMU, etc.) traen `unit_price`
 * en NETO POR CAJA. Walmart y Cencosud comparten esa semántica — el "Importe
 * Total" del documento Walmart sí está en bruto, pero el precio por línea
 * es neto. Se factura directo sobre `unit_price`.
 */

export const DEFAULT_LOGISTICS_PER_UNIT = 360;
export const DEFAULT_ILA_RATE = 0.205;
export const DEFAULT_IVA_RATE = 0.19;

/** Compatibilidad: ninguna cadena envía bruto a nivel de línea. */
export function chainSendsGross(_chainName: string | null | undefined): boolean {
  return false;
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
  unitPriceNet: number;       // precio neto por caja (entero CLP)
  unitPriceNetPerUnit: number; // precio neto por unidad de venta (puede tener decimales)
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

  // Paso 1: obtener precio neto por CAJA según cadena
  let unitPriceNetBoxRaw: number;
  if (isGrossSource) {
    // Desbrutación: neto por caja = (bruto - log_caja×(1+iva)) / (1+ila+iva)
    const denom = 1 + ilaRate + ivaRate;
    unitPriceNetBoxRaw = denom > 0 ? (ocUnitPrice - logPerBox * (1 + ivaRate)) / denom : 0;
    if (unitPriceNetBoxRaw < 0) unitPriceNetBoxRaw = 0;
  } else {
    unitPriceNetBoxRaw = ocUnitPrice;
  }

  // Paso 2: convertir a precio neto por UNIDAD redondeado (entero CLP).
  // Todos los cálculos posteriores derivan de este unitario redondeado
  // para que la factura impresa cuadre: cantidad_unidades × precio_unit = neto_línea.
  const unitPriceNetPerUnit = unitsPerPack > 0
    ? Math.round(unitPriceNetBoxRaw / unitsPerPack)
    : 0;

  // Paso 3: derivar todo desde el unitario redondeado
  const netProduct = unitsTotal * unitPriceNetPerUnit;
  const unitPriceNet = unitPriceNetPerUnit * unitsPerPack; // neto por caja recalculado
  const ila = Math.round(netProduct * ilaRate);
  const iva = Math.round((netProduct + logisticsTotal) * ivaRate);
  const grossTotal = netProduct + logisticsTotal + ila + iva;

  return {
    boxes,
    unitsPerPack,
    unitPriceNet,
    unitPriceNetPerUnit,
    netProduct,
    logisticsTotal,
    ila,
    iva,
    grossTotal,
  };
}
