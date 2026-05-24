"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface FormState { ok: boolean; error: string | null }

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.toString().trim();
  return s ? s : null;
}

function toInt(v: FormDataEntryValue | null, def = 0): number {
  const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? def : n;
}

export async function saveProduct(prev: FormState, fd: FormData): Promise<FormState> {
  const id = fd.get("id") as string | null;
  const sku = (fd.get("sku") as string)?.trim();
  const name = (fd.get("name") as string)?.trim();
  if (!sku) return { ok: false, error: "SKU es obligatorio." };
  if (!name) return { ok: false, error: "Nombre es obligatorio." };

  const supabase = await createClient();
  const catName = emptyToNull(fd.get("category_name"));
  const brandName = emptyToNull(fd.get("brand_name"));

  let category_id: string | null = null;
  if (catName) {
    const { data: existing } = await supabase.from("product_categories").select("id").eq("name", catName).maybeSingle();
    if (existing) category_id = existing.id;
    else {
      const { data: created } = await supabase.from("product_categories").insert({ name: catName }).select("id").single();
      category_id = created?.id ?? null;
    }
  }

  let brand_id: string | null = null;
  if (brandName) {
    const { data: existing } = await supabase.from("brands").select("id").eq("name", brandName).maybeSingle();
    if (existing) brand_id = existing.id;
    else {
      const { data: created } = await supabase.from("brands").insert({ name: brandName }).select("id").single();
      brand_id = created?.id ?? null;
    }
  }

  const costRaw = (fd.get("unit_cost_net") as string | null)?.trim() ?? "";
  const cost = costRaw === "" ? null : toInt(costRaw);

  const payload: Record<string, unknown> = {
    sku, name, category_id, brand_id,
    units_per_box: Math.max(1, toInt(fd.get("units_per_box"), 12)),
    base_price_net: toInt(fd.get("base_price_net")),
    base_price_gross: toInt(fd.get("base_price_gross")),
    min_price_net: toInt(fd.get("min_price_net")),
    is_active: fd.get("is_active") === "on",
  };
  if (cost !== null) {
    payload.unit_cost_net = cost > 0 ? cost : null;
    if (cost > 0) payload.unit_cost_updated_at = new Date().toISOString();
  }

  if (id) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("products").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/productos");
  revalidatePath("/admin");
  return { ok: true, error: null };
}

export async function deleteProduct(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/productos");
  revalidatePath("/admin");
}
