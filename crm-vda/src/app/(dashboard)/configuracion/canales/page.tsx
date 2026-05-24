import { createClient } from "@/lib/supabase/server";
import type { SalesChannel } from "@/lib/types/database";
import { FichaCanales } from "./FichaCanales";

export const dynamic = "force-dynamic";

export default async function CanalesPage() {
  const supabase = await createClient();

  const { data: rawChannels } = await supabase
    .from("sales_channels")
    .select("*")
    .order("display_name");

  const channels = (rawChannels ?? []) as SalesChannel[];

  return <FichaCanales channels={channels} />;
}
