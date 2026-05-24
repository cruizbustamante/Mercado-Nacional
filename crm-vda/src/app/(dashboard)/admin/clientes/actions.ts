"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseRut } from "@/lib/rut";

interface FormState { ok: boolean; error: string | null }

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = (v as string | null)?.toString().trim();
  return s ? s : null;
}

function toIntOrZero(v: FormDataEntryValue | null): number {
  const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

export async function saveClient(prev: FormState, fd: FormData): Promise<FormState> {
  const id = fd.get("id") as string | null;
  const rutRaw = fd.get("rut") as string;
  const r = parseRut(rutRaw);
  if (!r) return { ok: false, error: "RUT inválido." };

  const name = (fd.get("name") as string)?.trim();
  if (!name) return { ok: false, error: "Razón social es obligatoria." };

  const payload = {
    rut_body: r.body,
    rut_dv: r.dv,
    name,
    address: emptyToNull(fd.get("address")),
    commune: emptyToNull(fd.get("commune")),
    city: emptyToNull(fd.get("city")),
    phone: emptyToNull(fd.get("phone")),
    email: emptyToNull(fd.get("email")),
    payment_term_id: emptyToNull(fd.get("payment_term_id")),
    salesperson_id: emptyToNull(fd.get("salesperson_id")),
    channel_id: emptyToNull(fd.get("channel_id")),
    credit_line_clp: toIntOrZero(fd.get("credit_line_clp")),
    insurer_name: emptyToNull(fd.get("insurer_name")),
    insurer_credit_line_clp: toIntOrZero(fd.get("insurer_credit_line_clp")),
  };

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from("clients").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("clients").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/clientes");
  return { ok: true, error: null };
}

export async function deleteClient(fd: FormData): Promise<void> {
  const id = fd.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/clientes");
}
