import { createClient } from "@/lib/supabase/server";
import type { Client, SalesChannel, PaymentTerm, Profile } from "@/lib/types/database";
import { FichaClientes } from "./FichaClientes";

export const dynamic = "force-dynamic";

interface ClientChannel {
  client_id: string;
  channel_id: string;
}

export default async function ClientesPage() {
  const supabase = await createClient();

  const [
    { data: rawClients },
    { data: rawChannels },
    { data: rawTerms },
    { data: rawSalespeople },
    { data: rawClientChannels },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "*, payment_term:payment_terms(id,name,days), salesperson:profiles!salesperson_id(id,full_name,short_name), channel:sales_channels(id,name,display_name)"
      )
      .is("deleted_at", null)
      .order("name"),
    supabase.from("sales_channels").select("*").eq("is_active", true).order("display_name"),
    supabase.from("payment_terms").select("*").eq("is_active", true).order("days"),
    supabase
      .from("profiles")
      .select("id,full_name,short_name,is_active")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("client_channels").select("client_id,channel_id"),
  ]);

  const clients = (rawClients ?? []) as unknown as Client[];
  const channels = (rawChannels ?? []) as SalesChannel[];
  const paymentTerms = (rawTerms ?? []) as PaymentTerm[];
  const salespeople = (rawSalespeople ?? []) as Profile[];
  const clientChannels = (rawClientChannels ?? []) as ClientChannel[];

  const channelMap: Record<string, string[]> = {};
  for (const cc of clientChannels) {
    if (!channelMap[cc.client_id]) channelMap[cc.client_id] = [];
    channelMap[cc.client_id].push(cc.channel_id);
  }

  return (
    <FichaClientes
      clients={clients}
      channels={channels}
      paymentTerms={paymentTerms}
      salespeople={salespeople}
      clientChannelMap={channelMap}
    />
  );
}
