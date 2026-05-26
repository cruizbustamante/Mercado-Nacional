"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface FormState {
  ok: boolean;
  error: string | null;
}

export async function saveLogisticRule(prev: FormState, fd: FormData): Promise<FormState> {
  const id = (fd.get("id") as string)?.trim() || null;
  const brandId = (fd.get("brand_id") as string)?.trim() || null;
  const chainId = (fd.get("chain_id") as string)?.trim() || null;
  const costRaw = fd.get("cost_per_unit") as string;
  const cost = Math.round(Number(costRaw));
  const isDefault = !brandId && !chainId;

  if (isNaN(cost) || cost < 0) return { ok: false, error: "Costo por unidad inválido." };

  const supabase = await createClient();

  if (id) {
    // Update existing
    const { error } = await supabase
      .from("supermarket_logistics_costs")
      .update({
        brand_id: brandId,
        chain_id: chainId,
        cost_per_unit: cost,
        is_default: isDefault,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    // Insert new
    const { error } = await supabase
      .from("supermarket_logistics_costs")
      .insert({
        brand_id: brandId,
        chain_id: chainId,
        cost_per_unit: cost,
        is_default: isDefault,
      });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Ya existe una regla para esa combinación marca/cadena." };
      }
      return { ok: false, error: error.message };
    }
  }

  revalidatePath("/admin/logistica-super");
  return { ok: true, error: null };
}

export async function deleteLogisticRule(id: string): Promise<FormState> {
  const supabase = await createClient();

  // Prevent deleting the default row
  const { data: row } = await supabase
    .from("supermarket_logistics_costs")
    .select("is_default")
    .eq("id", id)
    .maybeSingle();

  if ((row as unknown as { is_default: boolean } | null)?.is_default) {
    return { ok: false, error: "No se puede eliminar la regla por defecto. Edite su valor en su lugar." };
  }

  const { error } = await supabase
    .from("supermarket_logistics_costs")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/logistica-super");
  return { ok: true, error: null };
}
