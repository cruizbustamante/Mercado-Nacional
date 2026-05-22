/**
 * Cálculo de línea de Nota de Venta.
 * Replica y mejora la lógica de _prepararDatosNV() del Apps Script.
 */

export interface NVLineInput {
  quantity_boxes: number;
  units_per_box: number;
  price_net_per_unit: number;
  iva_rate: number;
  ila_rate: number;
  logistics_cost_net_per_unit: number;
  logistics_iva_rate: number;
  min_price_net: number;
  vb_tolerance_clp: number;
}

export interface NVLineResult {
  quantity_units: number;
  price_net_final: number;
  price_gross_final: number;
  logistics_net: number;
  logistics_iva: number;
  line_net: number;
  line_iva: number;
  line_ila: number;
  line_total: number;
  requires_vb_financiero: boolean;
}

export function calculateNVLine(input: NVLineInput): NVLineResult {
  const quantity_units = input.quantity_boxes * input.units_per_box;

  const price_net_final = input.price_net_per_unit;
  const price_gross_final = Math.round(
    price_net_final * (1 + input.iva_rate + input.ila_rate)
  );

  const logistics_net = quantity_units * input.logistics_cost_net_per_unit;
  const logistics_iva = Math.round(logistics_net * input.logistics_iva_rate);

  const line_net = quantity_units * price_net_final;
  const line_iva = Math.round(line_net * input.iva_rate);
  const line_ila = Math.round(line_net * input.ila_rate);
  const line_total = line_net + line_iva + line_ila + logistics_net + logistics_iva;

  const requires_vb_financiero =
    price_net_final < input.min_price_net - input.vb_tolerance_clp;

  return {
    quantity_units,
    price_net_final,
    price_gross_final,
    logistics_net,
    logistics_iva,
    line_net,
    line_iva,
    line_ila,
    line_total,
    requires_vb_financiero,
  };
}

export interface NVTotalsInput {
  lines: NVLineResult[];
}

export interface NVTotals {
  total_base_net: number;
  total_discount: number;
  total_net: number;
  total_iva: number;
  total_ila: number;
  total_logistics: number;
  total_amount: number;
  total_boxes: number;
  total_units: number;
  requires_vb_financiero: boolean;
}

export function calculateNVTotals(
  lines: NVLineResult[],
  boxes: number[]
): NVTotals {
  let total_net = 0;
  let total_iva = 0;
  let total_ila = 0;
  let total_logistics = 0;
  let total_units = 0;
  let total_boxes_sum = 0;
  let requires_vb = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    total_net += line.line_net;
    total_iva += line.line_iva;
    total_ila += line.line_ila;
    total_logistics += line.logistics_net + line.logistics_iva;
    total_units += line.quantity_units;
    total_boxes_sum += boxes[i] ?? 0;
    if (line.requires_vb_financiero) requires_vb = true;
  }

  return {
    total_base_net: total_net,
    total_discount: 0,
    total_net,
    total_iva,
    total_ila,
    total_logistics,
    total_amount: total_net + total_iva + total_ila + total_logistics,
    total_boxes: total_boxes_sum,
    total_units,
    requires_vb_financiero: requires_vb,
  };
}
