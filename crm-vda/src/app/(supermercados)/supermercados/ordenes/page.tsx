import { createClient } from "@/lib/supabase/server";
import { OrdenesView, type OrdenRow, type ChainGroup } from "./OrdenesView";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function chainBg(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud") || n.includes("jumbo") || n.includes("santa isabel")) return "bg-ch-cencosud";
  if (n === "alvi" || n.includes("alvi")) return "bg-orange";
  if (n === "rendic" || n.includes("rendic")) return "bg-info";
  if (n === "scpd") return "bg-warn";
  if (n.includes("smu") || n.includes("unimarc")) return "bg-ch-smu";
  if (n.includes("tottus") || n.includes("falabella")) return "bg-ch-tottus";
  if (n.includes("walmart") || n.includes("lider") || n.includes("líder") || n.includes("acuenta")) return "bg-ch-walmart";
  return "bg-ch-other";
}
function chainSubtitle(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud")) return "Jumbo · Santa Isabel · Spid 35";
  if (n === "alvi") return "Alvi mayorista";
  if (n === "rendic") return "CD Coquimbo · Transición";
  if (n === "scpd") return "Cadena independiente";
  if (n.includes("smu")) return "Unimarc · OK Market · Mayorista 10";
  if (n.includes("tottus")) return "Falabella retail";
  if (n.includes("walmart")) return "Líder · Ekono · aCuenta";
  return "";
}

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; chain?: string }>;
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
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  const { data: ordersData } = await supabase
    .from("purchase_orders")
    .select(`
      id, order_number, order_date, cancellation_date, total_amount, status, buyer, source_pdf,
      chain:supermarket_chains(id, name),
      items:purchase_order_items(id, line_amount, quantity_boxes),
      invoices:oc_invoices(oc_invoice_items(amount_invoiced, boxes_invoiced))
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
    buyer: string | null;
    source_pdf: string | null;
    chain: { id: string; name: string } | null;
    items: { id: string; line_amount: number; quantity_boxes: number }[];
    invoices: { oc_invoice_items: { amount_invoiced: number; boxes_invoiced: number }[] }[];
  };
  const all = (ordersData ?? []) as unknown as Row[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orders: OrdenRow[] = all
    .filter((o) => !!o.chain)
    .map((o) => {
      const facturado = o.invoices.reduce(
        (acc, inv) => acc + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0),
        0
      );
      const boxes_invoiced = o.invoices.reduce(
        (acc, inv) => acc + inv.oc_invoice_items.reduce((a, it) => a + (it.boxes_invoiced || 0), 0),
        0
      );
      const boxes_total = o.items.reduce((acc, it) => acc + (it.quantity_boxes || 0), 0);
      const issueDate = new Date(o.order_date);
      issueDate.setHours(0, 0, 0, 0);
      const age_days = Math.max(0, Math.floor((today.getTime() - issueDate.getTime()) / 86400000));

      let oc_status: OrdenRow["oc_status"] = "al_dia";
      let days_overdue = 0;
      if (o.cancellation_date) {
        const venc = new Date(o.cancellation_date);
        venc.setHours(0, 0, 0, 0);
        const diff = Math.floor((today.getTime() - venc.getTime()) / 86400000);
        if (diff > 0 && o.status !== "COMPLETADA") {
          oc_status = "vencida";
          days_overdue = diff;
        } else if (diff > -3 && diff <= 0) {
          oc_status = "por_vencer";
          days_overdue = diff;
        }
      }
      return {
        id: o.id,
        order_number: o.order_number,
        order_date: o.order_date,
        cancellation_date: o.cancellation_date,
        total_amount: o.total_amount,
        facturado,
        pendiente: Math.max(0, o.total_amount - facturado),
        status: o.status,
        items_count: o.items.length,
        boxes_total,
        boxes_invoiced,
        age_days,
        source_pdf: o.source_pdf,
        buyer: o.buyer,
        chain_id: o.chain!.id,
        chain_name: o.chain!.name,
        oc_status,
        days_overdue,
      };
    });

  // Filtrar por chain si vino en URL (para usar como filtro inicial)
  // No alteramos `orders` aquí — OrdenesView aplica filtros en cliente.

  // Cadenas: tomar todas las que aparecen en el período + total de OC sin filtro
  const chainMap = new Map<string, ChainGroup>();
  const totalMontoGlobal = orders.reduce((s, o) => s + o.total_amount, 0);

  for (const o of orders) {
    const existing = chainMap.get(o.chain_id);
    if (existing) {
      existing.ocCount++;
      existing.ocCountTotal++;
      existing.monto += o.total_amount;
      existing.facturado += o.facturado;
      existing.lineasTotal += o.items_count;
      existing.lineasFacturadas += o.facturado > 0 ? o.items_count : 0;
      if (o.oc_status === "vencida") existing.vencidas++;
      if (o.oc_status === "por_vencer") existing.porVencer++;
    } else {
      chainMap.set(o.chain_id, {
        id: o.chain_id,
        name: o.chain_name,
        subtitle: chainSubtitle(o.chain_name),
        bg: chainBg(o.chain_name),
        ocCount: 1,
        ocCountTotal: 1,
        monto: o.total_amount,
        facturado: o.facturado,
        cumpl: 0,
        vencidas: o.oc_status === "vencida" ? 1 : 0,
        porVencer: o.oc_status === "por_vencer" ? 1 : 0,
        lineasTotal: o.items_count,
        lineasFacturadas: o.facturado > 0 ? o.items_count : 0,
        cobertura: 0,
        deltaPp: 0,
      });
    }
  }
  const chainGroups = Array.from(chainMap.values())
    .map((c) => ({
      ...c,
      cumpl: c.monto > 0 ? c.facturado / c.monto : 0,
      cobertura: totalMontoGlobal > 0 ? (c.monto / totalMontoGlobal) * 100 : 0,
    }))
    .sort((a, b) => b.monto - a.monto);

  const totalOc = orders.length;
  const totalMonto = totalMontoGlobal;
  const totalFacturado = orders.reduce((s, o) => s + o.facturado, 0);
  const totalVencidas = orders.filter((o) => o.oc_status === "vencida").length;
  const totalVencidasMonto = orders.filter((o) => o.oc_status === "vencida").reduce((s, o) => s + Math.max(0, o.total_amount - o.facturado), 0);
  const totalLineas = orders.reduce((s, o) => s + o.items_count, 0);
  const totalLineasFacturadas = orders.filter((o) => o.facturado > 0).reduce((s, o) => s + o.items_count, 0);
  const fillRate = totalMonto > 0 ? totalFacturado / totalMonto : 0;

  // Mes anterior (para Δ pp)
  const prevStart = new Date(year, month - 2, 1).toISOString().split("T")[0];
  const prevEnd = new Date(year, month - 1, 0).toISOString().split("T")[0];
  const { data: prevData } = await supabase
    .from("purchase_orders")
    .select(`total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))`)
    .gte("order_date", prevStart)
    .lte("order_date", prevEnd)
    .limit(500);
  const prev = (prevData ?? []) as unknown as { total_amount: number; invoices: { oc_invoice_items: { amount_invoiced: number }[] }[] }[];
  const prevMonto = prev.reduce((s, o) => s + o.total_amount, 0);
  const prevFact = prev.reduce((s, o) => s + o.invoices.reduce((a, inv) => a + inv.oc_invoice_items.reduce((aa, it) => aa + (it.amount_invoiced || 0), 0), 0), 0);
  const prevFill = prevMonto > 0 ? prevFact / prevMonto : 0;
  const deltaFillPp = Math.round((fillRate - prevFill) * 100);

  const prevMesDate = new Date(year, month - 2, 1);
  const nextMesDate = new Date(year, month, 1);
  const fmtMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <OrdenesView
      orders={orders}
      chainGroups={chainGroups}
      monthLabel={monthLabel}
      prevMesParam={fmtMes(prevMesDate)}
      nextMesParam={fmtMes(nextMesDate)}
      totalOc={totalOc}
      totalMonto={totalMonto}
      totalFacturado={totalFacturado}
      totalVencidas={totalVencidas}
      totalVencidasMonto={totalVencidasMonto}
      totalLineas={totalLineas}
      totalLineasFacturadas={totalLineasFacturadas}
      fillRate={fillRate}
      deltaFillPp={deltaFillPp}
      prevFillPct={Math.round(prevFill * 100)}
    />
  );
}
