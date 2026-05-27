import { createClient } from "@/lib/supabase/server";
import { OrdenesView, type OrdenRow, type ChainCard } from "./OrdenesView";

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const now = new Date();
  const mesParam = params.mes ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearStr, monthStr] = mesParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const end = new Date(year, month, 0).toISOString().split("T")[0];

  const { data: ordersData } = await supabase
    .from("purchase_orders")
    .select(`
      id, order_number, order_date, cancellation_date, total_amount, status,
      chain:supermarket_chains(id, name),
      items:purchase_order_items(id),
      invoices:oc_invoices(oc_invoice_items(amount_invoiced))
    `)
    .gte("order_date", start)
    .lte("order_date", end)
    .order("order_date", { ascending: false })
    .limit(500);

  type Row = {
    id: string;
    order_number: string;
    order_date: string;
    cancellation_date: string | null;
    total_amount: number;
    status: string;
    chain: { id: string; name: string } | null;
    items: { id: string }[];
    invoices: { oc_invoice_items: { amount_invoiced: number }[] }[];
  };
  const all = (ordersData ?? []) as unknown as Row[];

  const orders: OrdenRow[] = all.map((o) => {
    const facturado = o.invoices.reduce(
      (acc, inv) => acc + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0),
      0
    );
    const vencida = !!o.cancellation_date && new Date(o.cancellation_date) < now && o.status !== "COMPLETADA";
    return {
      id: o.id,
      order_number: o.order_number,
      order_date: o.order_date,
      cancellation_date: o.cancellation_date,
      total_amount: o.total_amount,
      facturado,
      status: o.status,
      items_count: o.items.length,
      chain_id: o.chain?.id ?? "sin-cadena",
      chain_name: o.chain?.name ?? "Sin cadena",
      is_vencida: vencida,
    };
  });

  // Cards por cadena (solo con OC > 0)
  const chainMap = new Map<string, ChainCard>();
  for (const o of orders) {
    const existing = chainMap.get(o.chain_id);
    if (existing) {
      existing.ocCount++;
      existing.totalOc += o.total_amount;
      existing.totalFacturado += o.facturado;
      if (o.is_vencida) existing.vencidas++;
    } else {
      chainMap.set(o.chain_id, {
        id: o.chain_id,
        name: o.chain_name,
        ocCount: 1,
        totalOc: o.total_amount,
        totalFacturado: o.facturado,
        vencidas: o.is_vencida ? 1 : 0,
        fillRate: 0,
      });
    }
  }
  const chainCards = Array.from(chainMap.values())
    .map((c) => ({ ...c, fillRate: c.totalOc > 0 ? c.totalFacturado / c.totalOc : 0 }))
    .sort((a, b) => b.ocCount - a.ocCount);

  const totalVencidas = orders.filter((o) => o.is_vencida).length;
  const totalVencidasMonto = orders
    .filter((o) => o.is_vencida)
    .reduce((s, o) => s + Math.max(0, o.total_amount - o.facturado), 0);

  // Navegación de meses
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const fmtMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const fmtMesLabel = (d: Date) =>
    d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const monthLabel = fmtMesLabel(new Date(year, month - 1, 1));

  return (
    <OrdenesView
      orders={orders}
      chainCards={chainCards}
      mesParam={mesParam}
      monthLabel={monthLabel}
      prevMesParam={fmtMes(prev)}
      nextMesParam={fmtMes(next)}
      prevLabel={fmtMesLabel(prev)}
      nextLabel={fmtMesLabel(next)}
      totalVencidas={totalVencidas}
      totalVencidasMonto={totalVencidasMonto}
    />
  );
}
