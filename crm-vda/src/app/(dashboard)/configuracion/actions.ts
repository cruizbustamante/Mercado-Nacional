"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface FormState { ok: boolean; error: string | null }

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.toString().trim();
  return s ? s : null;
}

function toIntOrNull(v: FormDataEntryValue | null): number | null {
  const s = (v as string | null)?.toString().trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function toIntOrZero(v: FormDataEntryValue | null): number {
  return toIntOrNull(v) ?? 0;
}

function toNumberOrNull(v: FormDataEntryValue | null): number | null {
  const s = (v as string | null)?.toString().trim();
  if (!s) return null;
  // Aceptar coma o punto decimal
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

/* ── PRODUCTO ───────────────────────────────────────────────────── */

export async function saveProduct(prev: FormState, fd: FormData): Promise<FormState> {
  const id = emptyToNull(fd.get("id"));
  const sku = (fd.get("sku") as string)?.trim();
  if (!sku) return { ok: false, error: "SKU es obligatorio." };

  const name = (fd.get("name") as string)?.trim();
  if (!name) return { ok: false, error: "Nombre es obligatorio." };

  const categoryName = emptyToNull(fd.get("category"));
  const brandName = emptyToNull(fd.get("brand"));
  const supplier = emptyToNull(fd.get("supplier"));
  const cc_vinos = emptyToNull(fd.get("cc_vinos"));
  const wine_line = emptyToNull(fd.get("wine_line"));
  const grape = emptyToNull(fd.get("grape"));
  const units_per_box = toIntOrNull(fd.get("units_per_box")) ?? 12;
  const base_price_net = toIntOrZero(fd.get("base_price_net"));
  const base_price_gross = toIntOrZero(fd.get("base_price_gross"));
  const min_price_net = toIntOrZero(fd.get("min_price_net"));
  const unit_cost_net = toIntOrNull(fd.get("unit_cost_net"));
  const ila_rate = toNumberOrNull(fd.get("ila_rate"));
  const iva_rate = toNumberOrNull(fd.get("iva_rate"));
  const is_active = fd.get("is_active") === "on" || fd.get("is_active") === "true";

  const supabase = await createClient();

  let category_id: string | null = null;
  if (categoryName) {
    const { data: existing } = await supabase
      .from("product_categories").select("id").eq("name", categoryName).maybeSingle();
    if (existing) {
      category_id = existing.id;
    } else {
      const { data: created, error: catErr } = await supabase
        .from("product_categories").insert({ name: categoryName }).select("id").single();
      if (catErr || !created) {
        return { ok: false, error: `No se pudo crear la categoría "${categoryName}": ${catErr?.message ?? "error desconocido"}` };
      }
      category_id = created.id;
    }
  }

  let brand_id: string | null = null;
  if (brandName) {
    const { data: existing } = await supabase
      .from("brands").select("id").eq("name", brandName).maybeSingle();
    if (existing) {
      brand_id = existing.id;
    } else {
      const { data: created, error: brandErr } = await supabase
        .from("brands").insert({ name: brandName }).select("id").single();
      if (brandErr || !created) {
        return { ok: false, error: `No se pudo crear la marca "${brandName}": ${brandErr?.message ?? "error desconocido"}` };
      }
      brand_id = created.id;
    }
  }

  const payload: Record<string, unknown> = {
    sku, name, category_id, brand_id, supplier, cc_vinos, wine_line, grape,
    units_per_box, base_price_net, base_price_gross, min_price_net,
    unit_cost_net, is_active,
  };
  if (ila_rate !== null) payload.ila_rate = ila_rate;
  if (iva_rate !== null) payload.iva_rate = iva_rate;

  if (id) {
    const { error } = await supabase.from("products").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("products").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/configuracion/productos");
  return { ok: true, error: null };
}

export async function deleteProduct(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/configuracion/productos");
}

/* ── CLIENTE ────────────────────────────────────────────────────── */

export async function saveClient(prev: FormState, fd: FormData): Promise<FormState> {
  const id = emptyToNull(fd.get("id"));
  const name = (fd.get("name") as string)?.trim();
  if (!name) return { ok: false, error: "Razón social es obligatoria." };

  const rutRaw = (fd.get("rut") as string)?.trim();
  let rut_body: number | null = null;
  let rut_dv: string | null = null;
  if (rutRaw) {
    const cleaned = rutRaw.replace(/\./g, "").replace(/-/g, "");
    rut_dv = cleaned.slice(-1).toUpperCase();
    rut_body = parseInt(cleaned.slice(0, -1), 10);
    if (isNaN(rut_body)) return { ok: false, error: "RUT inválido." };
  }

  const address = emptyToNull(fd.get("address"));
  const commune = emptyToNull(fd.get("commune"));
  const city = emptyToNull(fd.get("city"));
  const phone = emptyToNull(fd.get("phone"));
  const email = emptyToNull(fd.get("email"));
  const payment_term_id = emptyToNull(fd.get("payment_term_id"));
  const salesperson_id = emptyToNull(fd.get("salesperson_id"));
  const credit_line_clp = toIntOrZero(fd.get("credit_line_clp"));
  const channelIds = fd.getAll("channels").map((v) => String(v));

  const supabase = await createClient();

  const payload = {
    name, rut_body, rut_dv, address, commune, city, phone, email,
    payment_term_id, salesperson_id, credit_line_clp,
    channel_id: channelIds[0] ?? null,
  };

  let clientId = id;
  if (id) {
    const { error } = await supabase.from("clients").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("clients").insert(payload).select("id").single();
    if (error || !created) return { ok: false, error: error?.message ?? "Error creando cliente." };
    clientId = created.id;
  }

  if (clientId) {
    await supabase.from("client_channels").delete().eq("client_id", clientId);
    if (channelIds.length > 0) {
      await supabase.from("client_channels").insert(
        channelIds.map((ch) => ({ client_id: clientId!, channel_id: ch }))
      );
    }
  }

  revalidatePath("/configuracion/clientes");
  return { ok: true, error: null };
}

export async function deleteClient(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/configuracion/clientes");
}

/* ── EJECUTIVO ──────────────────────────────────────────────────── */

export async function saveEjecutivo(prev: FormState, fd: FormData): Promise<FormState> {
  const id = emptyToNull(fd.get("id"));
  const full_name = (fd.get("full_name") as string)?.trim();
  if (!full_name) return { ok: false, error: "Nombre es obligatorio." };

  const email = (fd.get("email") as string)?.trim();
  if (!email) return { ok: false, error: "Email es obligatorio." };

  const short_name = emptyToNull(fd.get("short_name"));
  const role_id = emptyToNull(fd.get("role_id"));
  if (!role_id) return { ok: false, error: "Rol es obligatorio." };

  const is_active = fd.get("is_active") === "on" || fd.get("is_active") === "true";
  const channelIds = fd.getAll("channels").map((v) => String(v));

  const words = full_name.split(/\s+/);
  const initials = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  const supabase = await createClient();

  let profileId = id;
  if (id) {
    const { error } = await supabase
      .from("profiles").update({ full_name, email, short_name, initials, role_id, is_active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("profiles").insert({ full_name, email, short_name, initials, role_id, is_active })
      .select("id").single();
    if (error || !created) return { ok: false, error: error?.message ?? "Error." };
    profileId = created.id;
  }

  if (profileId) {
    await supabase.from("salesperson_channels").delete().eq("profile_id", profileId);
    if (channelIds.length > 0) {
      await supabase.from("salesperson_channels").insert(
        channelIds.map((ch) => ({ profile_id: profileId!, channel_id: ch }))
      );
    }
  }

  revalidatePath("/configuracion/ejecutivos");
  return { ok: true, error: null };
}

export async function deactivateEjecutivo(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: false }).eq("id", id);
  revalidatePath("/configuracion/ejecutivos");
}

/* ── CANAL DE VENTA ─────────────────────────────────────────────── */

export async function saveChannel(prev: FormState, fd: FormData): Promise<FormState> {
  const id = emptyToNull(fd.get("id"));
  const name = (fd.get("name") as string)?.trim().toLowerCase().replace(/\s+/g, "_");
  if (!name) return { ok: false, error: "Slug es obligatorio." };

  const display_name = (fd.get("display_name") as string)?.trim();
  if (!display_name) return { ok: false, error: "Nombre a mostrar es obligatorio." };

  const nv_prefix = (fd.get("nv_prefix") as string)?.trim().toUpperCase();
  if (!nv_prefix || nv_prefix.length < 2 || nv_prefix.length > 4 || !/^[A-Z]+$/.test(nv_prefix))
    return { ok: false, error: "Prefijo NV: 2-4 letras mayúsculas." };

  const is_active = fd.get("is_active") === "on" || fd.get("is_active") === "true";

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("sales_channels").update({ name, display_name, nv_prefix, is_active }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("sales_channels").insert({ name, display_name, nv_prefix, is_active });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/configuracion/canales");
  return { ok: true, error: null };
}

export async function deactivateChannel(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("sales_channels").update({ is_active: false }).eq("id", id);
  revalidatePath("/configuracion/canales");
}
