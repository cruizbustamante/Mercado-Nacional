import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, role:roles(name, display_name, grupo)")
    .eq("auth_user_id", user.id)
    .single();

  return profile as Profile | null;
}

export interface UserModule {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  can_edit: boolean;
}

export async function getUserModules(
  profileId: string,
  roleId: string
): Promise<UserModule[]> {
  const supabase = await createClient();

  const [{ data: roleModules }, { data: overrides }] = await Promise.all([
    supabase
      .from("role_module_permissions")
      .select("can_edit, module:modules(id, name, display_name, description, icon, color, sort_order)")
      .eq("role_id", roleId),
    supabase
      .from("user_module_overrides")
      .select("granted, can_edit, module:modules(id, name, display_name, description, icon, color, sort_order)")
      .eq("profile_id", profileId),
  ]);

  const map = new Map<string, UserModule>();

  for (const row of roleModules ?? []) {
    const m = row.module as unknown as UserModule;
    if (!m) continue;
    map.set(m.id, { ...m, can_edit: row.can_edit });
  }

  for (const row of overrides ?? []) {
    const m = row.module as unknown as UserModule;
    if (!m) continue;
    if (row.granted) {
      map.set(m.id, { ...m, can_edit: row.can_edit });
    } else {
      map.delete(m.id);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}
