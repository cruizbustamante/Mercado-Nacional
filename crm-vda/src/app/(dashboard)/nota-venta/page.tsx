import { createClient } from "@/lib/supabase/server";
import { NvListModule, type NvListRow, type NvListItem, type ChannelOption } from "./NvListModule";

export const dynamic = "force-dynamic";

export default async function NotaVentaPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    channel?: string;
    year?: string;
    month?: string;
    q?: string;
    facturado?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  /* ── Parallel queries ── */
  const [notesRes, channelsRes, productsRes] = await Promise.all([
    supabase
      .from("sales_notes")
      .select(
        `id, nv_number, nv_date, status, total_net, total_amount, total_boxes, total_units, invoice_number,
         client:clients(name, rut_body, rut_dv),
         salesperson:profiles!sales_notes_salesperson_id_fkey(full_name, short_name, initials),
         warehouse:warehouses(name),
         payment_term:payment_terms(name, days),
         channel:sales_channels(name, display_name),
         items:sales_note_items(product_id, product_sku, product_name, quantity_boxes, quantity_units, line_net, line_total)`
      )
      .order("nv_date", { ascending: false })
      .limit(2000),

    supabase
      .from("sales_channels")
      .select("id, name, display_name")
      .eq("is_active", true)
      .order("display_name"),

    supabase
      .from("products")
      .select("id, unit_cost_net")
      .not("unit_cost_net", "is", null),
  ]);

  /* ── Type casts ── */
  type RawNote = {
    id: string;
    nv_number: string;
    nv_date: string;
    status: string;
    total_net: number;
    total_amount: number;
    total_boxes: number;
    total_units: number;
    invoice_number: string | null;
    client: { name: string; rut_body: number | null; rut_dv: string | null } | null;
    salesperson: { full_name: string; short_name: string | null; initials: string | null } | null;
    warehouse: { name: string } | null;
    payment_term: { name: string; days: number } | null;
    channel: { name: string; display_name: string } | null;
    items: NvListItem[];
  };

  const notes = (notesRes.data ?? []) as unknown as RawNote[];
  const channels = (channelsRes.data ?? []) as unknown as ChannelOption[];
  const costMap = new Map<string, number>();
  for (const p of (productsRes.data ?? []) as unknown as { id: string; unit_cost_net: number }[]) {
    costMap.set(p.id, p.unit_cost_net);
  }

  /* ── Compute margin per NV ── */
  const rows: NvListRow[] = notes.map((n) => {
    let margin_pct: number | null = null;
    let margin_clp: number | null = null;

    if (n.items && n.items.length > 0) {
      let totalCost = 0;
      let allHaveCost = true;

      for (const it of n.items) {
        const cost = costMap.get(it.product_id);
        if (cost !== undefined) {
          totalCost += it.quantity_units * cost;
        } else {
          allHaveCost = false;
        }
      }

      if (allHaveCost && n.total_net > 0) {
        margin_clp = n.total_net - totalCost;
        margin_pct = (margin_clp / n.total_net) * 100;
      }
    }

    return {
      id: n.id,
      nv_number: n.nv_number,
      nv_date: n.nv_date,
      status: n.status,
      total_net: n.total_net,
      total_amount: n.total_amount,
      total_boxes: n.total_boxes,
      total_units: n.total_units,
      invoice_number: n.invoice_number,
      client: n.client,
      salesperson: n.salesperson,
      warehouse: n.warehouse,
      payment_term: n.payment_term,
      channel: n.channel,
      items: n.items ?? [],
      margin_pct: margin_pct !== null ? Math.round(margin_pct * 10) / 10 : null,
      margin_clp: margin_clp !== null ? Math.round(margin_clp) : null,
    };
  });

  /* ── Determine available years ── */
  const yearsSet = new Set<number>();
  for (const r of rows) {
    yearsSet.add(parseInt(r.nv_date.slice(0, 4), 10));
  }
  const now = new Date();
  yearsSet.add(now.getFullYear());
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  /* ── Parse URL params for initial state ── */
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const initialYear = sp.year ? parseInt(sp.year, 10) : currentYear;
  const initialMonth = sp.month === "all" ? null : sp.month ? parseInt(sp.month, 10) : currentMonth;
  const initialStatus = sp.status ?? null;
  const initialChannel = sp.channel ?? null;
  const initialSearch = sp.q ?? "";
  const initialFacturado = sp.facturado ?? null;

  return (
    <NvListModule
      rows={rows}
      channels={channels}
      availableYears={availableYears}
      initialYear={initialYear}
      initialMonth={initialMonth}
      initialStatus={initialStatus}
      initialChannel={initialChannel}
      initialSearch={initialSearch}
      initialFacturado={initialFacturado}
    />
  );
}
