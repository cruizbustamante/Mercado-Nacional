import { createClient } from "@/lib/supabase/server";
import type { Profile, SalesChannel } from "@/lib/types/database";
import { FichaEjecutivos } from "./FichaEjecutivos";

export const dynamic = "force-dynamic";

interface RoleRow {
  id: string;
  name: string;
  display_name: string;
}

interface SPChannel {
  profile_id: string;
  channel_id: string;
}

export default async function EjecutivosPage() {
  const supabase = await createClient();

  const [{ data: rawProfiles }, { data: rawRoles }, { data: rawChannels }, { data: rawSPChannels }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*, role:roles(id,name,display_name)")
        .order("full_name"),
      supabase.from("roles").select("id,name,display_name").order("display_name"),
      supabase.from("sales_channels").select("*").eq("is_active", true).order("display_name"),
      supabase.from("salesperson_channels").select("profile_id,channel_id"),
    ]);

  const profiles = (rawProfiles ?? []) as unknown as (Profile & { role: RoleRow })[];
  const roles = (rawRoles ?? []) as RoleRow[];
  const channels = (rawChannels ?? []) as SalesChannel[];
  const spChannels = (rawSPChannels ?? []) as SPChannel[];

  const channelMap: Record<string, string[]> = {};
  for (const sc of spChannels) {
    if (!channelMap[sc.profile_id]) channelMap[sc.profile_id] = [];
    channelMap[sc.profile_id].push(sc.channel_id);
  }

  return (
    <FichaEjecutivos
      profiles={profiles}
      roles={roles}
      channels={channels}
      spChannelMap={channelMap}
    />
  );
}
