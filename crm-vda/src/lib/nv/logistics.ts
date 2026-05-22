import { createClient } from "@/lib/supabase/server";

interface LogisticsCostParams {
  product_id?: string;
  warehouse_id?: string;
  client_id?: string;
}

interface LogisticsCostResult {
  cost_net_per_unit: number;
  iva_rate: number;
}

/**
 * Resuelve el costo logístico aplicable según prioridad:
 * producto+bodega+cliente > producto+cliente > producto+bodega > cliente > producto > bodega > global
 */
export async function resolveLogisticsCost(
  params: LogisticsCostParams
): Promise<LogisticsCostResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: costs } = await supabase
    .from("logistics_costs")
    .select("product_id, warehouse_id, client_id, cost_net_per_unit, iva_rate")
    .or(
      `product_id.is.null,product_id.eq.${params.product_id ?? "00000000-0000-0000-0000-000000000000"}`
    )
    .or(
      `warehouse_id.is.null,warehouse_id.eq.${params.warehouse_id ?? "00000000-0000-0000-0000-000000000000"}`
    )
    .or(
      `client_id.is.null,client_id.eq.${params.client_id ?? "00000000-0000-0000-0000-000000000000"}`
    )
    .lte("valid_from", today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("valid_from", { ascending: false });

  if (!costs || costs.length === 0) {
    return { cost_net_per_unit: 360, iva_rate: 0.19 };
  }

  const scored = costs.map((c) => ({
    ...c,
    score:
      (c.product_id ? 4 : 0) +
      (c.warehouse_id ? 2 : 0) +
      (c.client_id ? 1 : 0),
  }));

  scored.sort((a, b) => b.score - a.score);

  return {
    cost_net_per_unit: scored[0].cost_net_per_unit,
    iva_rate: Number(scored[0].iva_rate),
  };
}
