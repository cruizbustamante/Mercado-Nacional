import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the supermarket logistics cost per unit for a given brand + chain.
 * Priority: brand+chain > brand-only > chain-only > default (is_default=true) > 360 hardcoded.
 */
export async function getLogisticsCost(
  brandId: string | null,
  chainId: string | null
): Promise<number> {
  const supabase = await createClient();

  // Fetch all potentially matching rows in one query
  const { data: rows } = await supabase
    .from("supermarket_logistics_costs")
    .select("brand_id, chain_id, cost_per_unit, is_default")
    .or(
      [
        "brand_id.is.null",
        ...(brandId ? [`brand_id.eq.${brandId}`] : []),
      ].join(",")
    )
    .or(
      [
        "chain_id.is.null",
        ...(chainId ? [`chain_id.eq.${chainId}`] : []),
      ].join(",")
    );

  if (!rows || rows.length === 0) return 360;

  // Score each row: brand match = 2, chain match = 1
  type Row = { brand_id: string | null; chain_id: string | null; cost_per_unit: number; is_default: boolean };
  const scored = (rows as unknown as Row[])
    .filter((r) => {
      // Only include rows where every non-null dimension matches the requested value
      if (r.brand_id && r.brand_id !== brandId) return false;
      if (r.chain_id && r.chain_id !== chainId) return false;
      return true;
    })
    .map((r) => ({
      ...r,
      score: (r.brand_id ? 2 : 0) + (r.chain_id ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return 360;
  return scored[0].cost_per_unit;
}

/**
 * Batch version: resolves logistics cost for multiple brand IDs against one chain.
 * Returns a Map of brandId -> cost_per_unit.
 */
export async function getLogisticsCostMap(
  brandIds: string[],
  chainId: string | null
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const unique = [...new Set(brandIds.filter(Boolean))];

  // Fetch all relevant rows at once
  const { data: rows } = await supabase
    .from("supermarket_logistics_costs")
    .select("brand_id, chain_id, cost_per_unit, is_default")
    .or(
      [
        "brand_id.is.null",
        ...(unique.length > 0
          ? [`brand_id.in.(${unique.join(",")})`]
          : []),
      ].join(",")
    )
    .or(
      [
        "chain_id.is.null",
        ...(chainId ? [`chain_id.eq.${chainId}`] : []),
      ].join(",")
    );

  type Row = { brand_id: string | null; chain_id: string | null; cost_per_unit: number; is_default: boolean };
  const allRows = (rows ?? []) as unknown as Row[];

  // Find the default cost (is_default=true or both nulls)
  const defaultRow = allRows.find((r) => r.is_default) ?? allRows.find((r) => !r.brand_id && !r.chain_id);
  const defaultCost = defaultRow?.cost_per_unit ?? 360;

  const result = new Map<string, number>();

  for (const bid of unique) {
    // Filter to rows applicable for this brand
    const applicable = allRows
      .filter((r) => {
        if (r.brand_id && r.brand_id !== bid) return false;
        if (r.chain_id && r.chain_id !== chainId) return false;
        return true;
      })
      .map((r) => ({
        ...r,
        score: (r.brand_id ? 2 : 0) + (r.chain_id ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    result.set(bid, applicable.length > 0 ? applicable[0].cost_per_unit : defaultCost);
  }

  return result;
}

/**
 * Loads all logistics cost rules with brand/chain names for admin UI.
 */
export async function getAllLogisticsCostRules(): Promise<
  Array<{
    id: string;
    brand_id: string | null;
    brand_name: string | null;
    chain_id: string | null;
    chain_name: string | null;
    cost_per_unit: number;
    is_default: boolean;
  }>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supermarket_logistics_costs")
    .select("id, brand_id, chain_id, cost_per_unit, is_default, brand:brands(name), chain:supermarket_chains(name)")
    .order("is_default", { ascending: false })
    .order("cost_per_unit", { ascending: true });

  type RawRow = {
    id: string;
    brand_id: string | null;
    chain_id: string | null;
    cost_per_unit: number;
    is_default: boolean;
    brand: { name: string } | null;
    chain: { name: string } | null;
  };

  return ((data ?? []) as unknown as RawRow[]).map((r) => ({
    id: r.id,
    brand_id: r.brand_id,
    brand_name: r.brand?.name ?? null,
    chain_id: r.chain_id,
    chain_name: r.chain?.name ?? null,
    cost_per_unit: r.cost_per_unit,
    is_default: r.is_default,
  }));
}
