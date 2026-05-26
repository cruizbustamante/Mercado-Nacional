import { createClient } from "@/lib/supabase/server";
import type { Period } from "./period";
import { previousPeriod } from "./period";

/* ============= Tipos shared ============= */

export interface DashboardKpis {
  ocCount: number;
  totalOc: number;          // monto OC en CLP
  totalFacturado: number;   // monto facturado en CLP
  totalPerdido: number;     // OC - facturado en OC vencidas
  totalPendiente: number;   // OC - facturado en OC vigentes
  fillRate: number;         // 0..1
  orphanLines: number;      // líneas sin SKU mapeado
  totalLines: number;
  marginAmount: number;     // margen $ aproximado en facturado (donde hay costo)
  marginRate: number;       // 0..1
  marginCoverage: number;   // % facturado con costo conocido
}

export interface ChainRow {
  id: string;
  name: string;
  ocCount: number;
  totalOc: number;
  totalFacturado: number;
  totalPendiente: number;
  fillRate: number;
  marginAmount: number;
  marginRate: number;
}

export interface TopSkuRow {
  product_id: string | null;
  sku: string | null;
  name: string;        // nombre o nombre OC si no hay producto
  units: number;
  boxes: number;
  totalOc: number;
  totalFacturado: number;
  marginAmount: number | null;   // null si falta costo
}

/* ============= Tipos internos para joins de Supabase ============= */

interface InvoiceItemRow { amount_invoiced: number; boxes_invoiced: number }
interface InvoiceRow { id: string; oc_invoice_items: InvoiceItemRow[] }
interface LineRow {
  id: string;
  product_id: string | null;
  upc_code: string | null;
  product_name_oc: string | null;
  quantity_boxes: number;
  quantity_units: number;
  unit_price: number;
  line_amount: number;
  product: {
    sku: string;
    name: string;
    unit_cost_net: number | null;
    category: { name: string } | null;
    brand: { name: string } | null;
  } | null;
}
interface OcRow {
  id: string;
  total_amount: number;
  order_date: string;
  cancellation_date: string | null;
  status: string;
  chain: { id: string; name: string } | null;
  items: LineRow[];
  invoices: InvoiceRow[];
}

function ocFacturado(o: OcRow): number {
  return o.invoices.reduce(
    (s, inv) => s + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0),
    0
  );
}

function isVencida(o: OcRow, today: string): boolean {
  if (!o.cancellation_date) return false;
  return o.cancellation_date < today && o.status !== "COMPLETADA";
}

/* ============= Carga base ============= */

async function loadOrders(period: Period): Promise<OcRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select(`
      id, total_amount, order_date, cancellation_date, status,
      chain:supermarket_chains(id, name),
      items:purchase_order_items(
        id, product_id, upc_code, product_name_oc,
        quantity_boxes, quantity_units, unit_price, line_amount,
        product:products(
          sku, name, unit_cost_net,
          category:product_categories(name),
          brand:brands(name)
        )
      ),
      invoices:oc_invoices(id, oc_invoice_items(amount_invoiced, boxes_invoiced))
    `)
    .gte("order_date", period.start)
    .lte("order_date", period.end)
    .order("order_date", { ascending: false })
    .limit(2000);

  return (data ?? []) as unknown as OcRow[];
}

/* ============= Dashboard KPIs ============= */

export async function getDashboardKpis(period: Period): Promise<DashboardKpis> {
  const orders = await loadOrders(period);
  const today = new Date().toISOString().split("T")[0];

  let totalOc = 0, totalFacturado = 0, totalPerdido = 0, totalPendiente = 0;
  let totalLines = 0, orphanLines = 0;
  let marginAmount = 0;
  let facturadoConCosto = 0;

  for (const o of orders) {
    const fact = ocFacturado(o);
    totalOc += o.total_amount;
    totalFacturado += fact;
    const gap = Math.max(0, o.total_amount - fact);
    if (isVencida(o, today)) totalPerdido += gap;
    else totalPendiente += gap;

    for (const it of o.items) {
      totalLines++;
      if (!it.product_id) orphanLines++;
      if (it.product?.unit_cost_net && it.product.unit_cost_net > 0) {
        const margenLinea = (it.unit_price - it.product.unit_cost_net) * it.quantity_units;
        marginAmount += margenLinea;
        facturadoConCosto += it.line_amount;
      }
    }
  }

  const fillRate = totalOc > 0 ? totalFacturado / totalOc : 0;
  const marginRate = facturadoConCosto > 0 ? marginAmount / facturadoConCosto : 0;
  const marginCoverage = totalFacturado > 0 ? facturadoConCosto / totalFacturado : 0;

  return {
    ocCount: orders.length,
    totalOc,
    totalFacturado,
    totalPerdido,
    totalPendiente,
    fillRate,
    orphanLines,
    totalLines,
    marginAmount,
    marginRate,
    marginCoverage,
  };
}

/* ============= Tabla por cadena ============= */

export async function getChainBreakdown(period: Period): Promise<ChainRow[]> {
  const orders = await loadOrders(period);
  const map = new Map<string, ChainRow>();

  for (const o of orders) {
    const ch = o.chain;
    if (!ch) continue;
    if (!map.has(ch.id)) {
      map.set(ch.id, {
        id: ch.id, name: ch.name,
        ocCount: 0, totalOc: 0, totalFacturado: 0, totalPendiente: 0,
        fillRate: 0, marginAmount: 0, marginRate: 0,
      });
    }
    const row = map.get(ch.id)!;
    const fact = ocFacturado(o);
    row.ocCount++;
    row.totalOc += o.total_amount;
    row.totalFacturado += fact;
    row.totalPendiente += Math.max(0, o.total_amount - fact);

    for (const it of o.items) {
      if (it.product?.unit_cost_net && it.product.unit_cost_net > 0) {
        row.marginAmount += (it.unit_price - it.product.unit_cost_net) * it.quantity_units;
      }
    }
  }

  for (const row of map.values()) {
    row.fillRate = row.totalOc > 0 ? row.totalFacturado / row.totalOc : 0;
    row.marginRate = row.totalFacturado > 0 ? row.marginAmount / row.totalFacturado : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.totalOc - a.totalOc);
}

/* ============= Top SKUs ============= */

export async function getTopSkus(period: Period, limit = 10): Promise<TopSkuRow[]> {
  const orders = await loadOrders(period);
  const map = new Map<string, TopSkuRow>();

  for (const o of orders) {
    for (const it of o.items) {
      const key = it.product_id ?? `upc:${it.upc_code ?? "?"}:${it.product_name_oc ?? ""}`;
      if (!map.has(key)) {
        map.set(key, {
          product_id: it.product_id,
          sku: it.product?.sku ?? null,
          name: it.product?.name ?? it.product_name_oc ?? "Sin nombre",
          units: 0, boxes: 0, totalOc: 0, totalFacturado: 0,
          marginAmount: it.product?.unit_cost_net ? 0 : null,
        });
      }
      const row = map.get(key)!;
      row.units += it.quantity_units;
      row.boxes += it.quantity_boxes;
      row.totalOc += it.line_amount;

      // Distribución de facturado por línea: proporcional al monto OC de esta línea sobre total OC
      const fact = ocFacturado(o);
      const linePart = o.total_amount > 0 ? (it.line_amount / o.total_amount) * fact : 0;
      row.totalFacturado += linePart;

      if (it.product?.unit_cost_net && it.product.unit_cost_net > 0) {
        const margen = (it.unit_price - it.product.unit_cost_net) * it.quantity_units;
        row.marginAmount = (row.marginAmount ?? 0) + margen;
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalOc - a.totalOc)
    .slice(0, limit);
}

/* ============= Detalle de una OC ============= */

export interface OcDetailLine {
  id: string;
  line_number: number;
  upc_code: string | null;
  product_name_oc: string | null;
  quantity_boxes: number;
  units_per_pack: number | null;
  unit_price: number;
  line_amount: number;
  product: {
    id: string;
    sku: string;
    name: string;
    base_price_net: number;
    unit_cost_net: number | null;
    brand_id: string | null;
    category_id: string | null;
  } | null;
  // Asignación actual (al menos 1 si está asignada)
  assignment: {
    invoice_id: string;
    invoice_number: string;
    invoice_date: string | null;
    boxes_invoiced: number;
    amount_invoiced: number;
  } | null;
  // Venta perdida marcada manualmente
  lost_sale_reason: string | null;
  lost_sale_marked_at: string | null;
}

export interface OcAssignedInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number;
  total_boxes: number;
  line_count: number;
}

export interface OcDetail {
  id: string;
  order_number: string;
  order_date: string;
  cancellation_date: string | null;
  total_amount: number;
  status: string;
  source_pdf: string | null;
  buyer: string | null;
  issuer: string | null;
  chain: { id: string; name: string } | null;
  items: OcDetailLine[];
  invoices: OcAssignedInvoice[];
  totalFacturado: number;
  totalLostSale: number;  // monto $ en líneas marcadas como venta perdida
  cumplim: number;        // 0..100
  daysSinceIssue: number; // días desde order_date
  isVencida: boolean;
}

export async function loadOcDetail(id: string): Promise<OcDetail | null> {
  const supabase = await createClient();

  const [{ data: oc, error: ocErr }, { data: invoices }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(`
        id, order_number, order_date, cancellation_date, total_amount, status,
        source_pdf, buyer, issuer,
        chain:supermarket_chains(id, name),
        items:purchase_order_items(
          id, line_number, upc_code, product_name_oc, quantity_boxes,
          units_per_pack, unit_price, line_amount,
          lost_sale_reason, lost_sale_marked_at,
          product:products(id, sku, name, base_price_net, unit_cost_net, brand_id, category_id)
        )
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("oc_invoices")
      .select(`
        id, invoice_number, invoice_date,
        items:oc_invoice_items(id, purchase_order_item_id, boxes_invoiced, amount_invoiced)
      `)
      .eq("purchase_order_id", id),
  ]);

  if (ocErr) console.error("[loadOcDetail] query error:", ocErr.message, ocErr.details, ocErr.hint);
  if (!oc) return null;

  // Mapear assignment por línea (1 OC line → 1 assignment según la regla legacy)
  const assignmentByLine = new Map<string, OcDetailLine["assignment"]>();
  const assignedInvoices: OcAssignedInvoice[] = [];

  type InvWithItems = {
    id: string;
    invoice_number: string;
    invoice_date: string | null;
    items: Array<{ id: string; purchase_order_item_id: string; boxes_invoiced: number; amount_invoiced: number }>;
  };
  for (const inv of ((invoices ?? []) as unknown as InvWithItems[])) {
    let invTotalAmount = 0;
    let invTotalBoxes = 0;
    for (const it of inv.items ?? []) {
      invTotalAmount += it.amount_invoiced || 0;
      invTotalBoxes += it.boxes_invoiced || 0;
      assignmentByLine.set(it.purchase_order_item_id, {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        boxes_invoiced: it.boxes_invoiced,
        amount_invoiced: it.amount_invoiced,
      });
    }
    if ((inv.items ?? []).length > 0) {
      assignedInvoices.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        total_amount: invTotalAmount,
        total_boxes: invTotalBoxes,
        line_count: (inv.items ?? []).length,
      });
    }
  }

  const itemsRaw = (oc.items ?? []) as unknown as Array<Omit<OcDetailLine, "assignment">>;
  const items: OcDetailLine[] = itemsRaw
    .map((it) => ({ ...it, assignment: assignmentByLine.get(it.id) ?? null }))
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

  assignedInvoices.sort((a, b) => (a.invoice_date ?? "").localeCompare(b.invoice_date ?? ""));

  const totalFacturado = items.reduce((s, it) => s + (it.assignment?.amount_invoiced ?? 0), 0);
  const totalLostSale = items
    .filter((it) => it.lost_sale_reason)
    .reduce((s, it) => s + Math.max(0, (it.line_amount || 0) - (it.assignment?.amount_invoiced ?? 0)), 0);

  const cumplim = oc.total_amount > 0 ? Math.round((totalFacturado / oc.total_amount) * 100) : 0;
  const today = new Date();
  const issueDate = new Date(oc.order_date);
  const daysSinceIssue = Math.floor((today.getTime() - issueDate.getTime()) / 86400000);
  const isVencida = !!oc.cancellation_date && new Date(oc.cancellation_date) < today && oc.status !== "COMPLETADA";

  return {
    id: oc.id as string,
    order_number: oc.order_number as string,
    order_date: oc.order_date as string,
    cancellation_date: oc.cancellation_date as string | null,
    total_amount: oc.total_amount as number,
    status: oc.status as string,
    source_pdf: oc.source_pdf as string | null,
    buyer: oc.buyer as string | null,
    issuer: oc.issuer as string | null,
    chain: oc.chain as unknown as { id: string; name: string } | null,
    items,
    invoices: assignedInvoices,
    totalFacturado,
    totalLostSale,
    cumplim,
    daysSinceIssue,
    isVencida,
  };
}

/* ============= Alertas accionables ============= */

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface AlertItem {
  id: string;
  label: string;        // ej. "OC 78079142 · Rendic"
  detail?: string;      // ej. "Vencida hace 5 días · $274K pendiente"
  href: string;
}

export interface AlertGroup {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  count: number;
  owner: string;        // a quién dirigir la acción
  items: AlertItem[];   // primeros N items para preview (max 8)
  hasMore: boolean;
  cta?: { label: string; href: string };
}

const fmtClpAlert = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

export async function getAlerts(): Promise<AlertGroup[]> {
  const supabase = await createClient();
  const todayIso = new Date().toISOString().split("T")[0];
  const groups: AlertGroup[] = [];

  // 1. OC vencidas sin facturar al 100%
  const { data: ocs } = await supabase
    .from("purchase_orders")
    .select(`
      id, order_number, order_date, cancellation_date, total_amount, status,
      chain:supermarket_chains(name),
      invoices:oc_invoices(oc_invoice_items(amount_invoiced))
    `)
    .not("cancellation_date", "is", null)
    .lt("cancellation_date", todayIso)
    .neq("status", "COMPLETADA")
    .order("cancellation_date", { ascending: true })
    .limit(50);

  type OcAlert = {
    id: string; order_number: string; order_date: string;
    cancellation_date: string; total_amount: number; status: string;
    chain: { name: string }[] | null;
    invoices: { oc_invoice_items: { amount_invoiced: number }[] }[];
  };
  const vencidas = ((ocs ?? []) as unknown as OcAlert[])
    .map((o) => {
      const facturado = o.invoices.reduce(
        (s, inv) => s + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0),
        0
      );
      const pendiente = Math.max(0, o.total_amount - facturado);
      const daysLate = Math.floor(
        (new Date(todayIso).getTime() - new Date(o.cancellation_date).getTime()) / 86400000
      );
      const chainName = Array.isArray(o.chain) ? o.chain[0]?.name : "—";
      return { o, facturado, pendiente, daysLate, chainName };
    })
    .filter((x) => x.pendiente > 0);

  if (vencidas.length > 0) {
    const totalPerdido = vencidas.reduce((s, v) => s + v.pendiente, 0);
    groups.push({
      id: "oc-vencidas",
      title: "OC vencidas sin facturar",
      description: `${vencidas.length} OC con fecha de entrega vencida y monto pendiente · $${fmtClpAlert(totalPerdido).slice(1)} en juego`,
      severity: "critical",
      count: vencidas.length,
      owner: "Operaciones / KAM",
      items: vencidas.slice(0, 8).map((v) => ({
        id: v.o.id,
        label: `OC ${v.o.order_number} · ${v.chainName}`,
        detail: `Vencida hace ${v.daysLate}d · ${fmtClpAlert(v.pendiente)} pendiente`,
        href: `/supermercados/oc/${v.o.id}`,
      })),
      hasMore: vencidas.length > 8,
      cta: { label: "Ver todas en Órdenes", href: "/supermercados/ordenes" },
    });
  }

  // 2. Líneas OC sin SKU mapeado
  const { count: huerfanasCount } = await supabase
    .from("purchase_order_items")
    .select("id", { count: "exact", head: true })
    .is("product_id", null)
    .not("upc_code", "is", null);

  const { data: huerfanasSample } = await supabase
    .from("purchase_order_items")
    .select("id, upc_code, product_name_oc, purchase_order_id")
    .is("product_id", null)
    .not("upc_code", "is", null)
    .limit(8);

  if ((huerfanasCount ?? 0) > 0) {
    const uniqueDuns = new Set((huerfanasSample ?? []).map((l) => l.upc_code));
    groups.push({
      id: "dun-sin-mapear",
      title: "DUN sin mapear",
      description: `${huerfanasCount} líneas de OC con código de barras sin SKU asignado · el dashboard subestima totales reales`,
      severity: "high",
      count: huerfanasCount ?? 0,
      owner: "Maestro de datos",
      items: (huerfanasSample ?? []).map((l) => ({
        id: l.id,
        label: `DUN ${l.upc_code}`,
        detail: l.product_name_oc ?? "—",
        href: `/supermercados/oc/${l.purchase_order_id}`,
      })),
      hasMore: uniqueDuns.size < (huerfanasCount ?? 0),
      cta: { label: "Resolver en Mapeo Supermercados", href: "/admin/mapeo-upc" },
    });
  }

  // 3. OC sin facturar > 14 días desde emisión
  const cutoff14d = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  const { data: oldOcs } = await supabase
    .from("purchase_orders")
    .select(`
      id, order_number, order_date, total_amount, status,
      chain:supermarket_chains(name),
      invoices:oc_invoices(oc_invoice_items(amount_invoiced))
    `)
    .lte("order_date", cutoff14d)
    .neq("status", "COMPLETADA")
    .order("order_date", { ascending: true })
    .limit(50);

  const stale = ((oldOcs ?? []) as unknown as OcAlert[])
    .map((o) => {
      const facturado = o.invoices.reduce(
        (s, inv) => s + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0),
        0
      );
      const days = Math.floor(
        (new Date(todayIso).getTime() - new Date(o.order_date).getTime()) / 86400000
      );
      const chainName = Array.isArray(o.chain) ? o.chain[0]?.name : "—";
      return { o, facturado, days, chainName };
    })
    .filter((x) => x.facturado === 0);

  if (stale.length > 0) {
    groups.push({
      id: "oc-sin-facturar",
      title: "OC sin facturar > 14 días",
      description: `${stale.length} OC abiertas con cero facturas asignadas · DSO en riesgo`,
      severity: "high",
      count: stale.length,
      owner: "Facturación / KAM",
      items: stale.slice(0, 8).map((v) => ({
        id: v.o.id,
        label: `OC ${v.o.order_number} · ${v.chainName}`,
        detail: `Emitida hace ${v.days}d · ${fmtClpAlert(v.o.total_amount)}`,
        href: `/supermercados/oc/${v.o.id}`,
      })),
      hasMore: stale.length > 8,
    });
  }

  // 4. Cadena dormida (sin OC en últimos 21 días pero tuvo OC mes anterior)
  const cutoff21d = new Date(Date.now() - 21 * 86400000).toISOString().split("T")[0];
  const cutoff60d = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];

  const [{ data: recentOrders }, { data: olderOrders }, { data: allChains }] = await Promise.all([
    supabase.from("purchase_orders").select("chain_id").gte("order_date", cutoff21d).not("chain_id", "is", null),
    supabase.from("purchase_orders").select("chain_id").gte("order_date", cutoff60d).lt("order_date", cutoff21d).not("chain_id", "is", null),
    supabase.from("supermarket_chains").select("id, name").eq("is_active", true),
  ]);

  const recentSet = new Set((recentOrders ?? []).map((r) => r.chain_id));
  const olderSet = new Set((olderOrders ?? []).map((r) => r.chain_id));
  const dormant = (allChains ?? []).filter((ch) => !recentSet.has(ch.id) && olderSet.has(ch.id));

  if (dormant.length > 0) {
    groups.push({
      id: "cadena-dormida",
      title: "Cadenas sin actividad reciente",
      description: `${dormant.length} cadena(s) sin OC nuevas en 21 días que sí tuvieron actividad antes`,
      severity: "medium",
      count: dormant.length,
      owner: "KAM / Gerente Comercial",
      items: dormant.map((ch) => ({
        id: ch.id,
        label: ch.name,
        detail: "Sin OC en 21 días",
        href: `/supermercados/ordenes?chain=${ch.id}`,
      })),
      hasMore: false,
    });
  }

  // Ordenar por severidad
  const sevOrder: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  groups.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return groups;
}

/* ============= Análisis comercial: ranking por dimensión + comparativa MoM ============= */

export type Dimension = "marca" | "categoria" | "sku" | "cadena";

export interface RankingRow {
  key: string;            // id estable para comparación
  label: string;          // nombre humano
  ocCount: number;        // OC distintas que contienen este ítem (solo para cadena: # OC)
  boxes: number;
  units: number;
  totalOc: number;
  totalFacturado: number;
  fillRate: number;
  marginAmount: number | null;
  marginRate: number | null;
  costCoverage: number;   // 0..1 → % del facturado que tiene costo conocido
  // Comparativa con período anterior
  deltaOcPct: number | null;       // delta % del monto OC
  deltaFactPct: number | null;     // delta % del facturado
}

interface AggBucket {
  key: string;
  label: string;
  ocIds: Set<string>;
  boxes: number;
  units: number;
  totalOc: number;
  totalFacturado: number;
  marginAmount: number;
  facturadoConCosto: number;
}

function bucketKey(it: LineRow, dim: Dimension, chainName: string | null, chainId: string | null): { key: string; label: string } | null {
  switch (dim) {
    case "marca": {
      const name = it.product?.brand?.name ?? null;
      if (!name) return { key: "__sin_marca__", label: "(sin marca)" };
      return { key: name, label: name };
    }
    case "categoria": {
      const name = it.product?.category?.name ?? null;
      if (!name) return { key: "__sin_cat__", label: "(sin categoría)" };
      return { key: name, label: name };
    }
    case "sku": {
      if (it.product_id && it.product) return { key: it.product_id, label: `${it.product.sku} · ${it.product.name}` };
      return { key: `upc:${it.upc_code ?? "?"}`, label: it.product_name_oc ?? `UPC ${it.upc_code ?? "?"}` };
    }
    case "cadena": {
      if (!chainId) return { key: "__sin_cadena__", label: "(sin cadena)" };
      return { key: chainId, label: chainName ?? "—" };
    }
  }
}

function aggregateRanking(orders: OcRow[], dim: Dimension): Map<string, AggBucket> {
  const buckets = new Map<string, AggBucket>();
  for (const o of orders) {
    const ocFact = ocFacturado(o);
    const ocTotal = o.total_amount || 0;
    for (const it of o.items) {
      const bk = bucketKey(it, dim, o.chain?.name ?? null, o.chain?.id ?? null);
      if (!bk) continue;
      if (!buckets.has(bk.key)) {
        buckets.set(bk.key, {
          key: bk.key, label: bk.label,
          ocIds: new Set(), boxes: 0, units: 0,
          totalOc: 0, totalFacturado: 0,
          marginAmount: 0, facturadoConCosto: 0,
        });
      }
      const b = buckets.get(bk.key)!;
      b.ocIds.add(o.id);
      b.boxes += it.quantity_boxes;
      b.units += it.quantity_units;
      b.totalOc += it.line_amount;
      // Facturado por línea: proporcional al peso de la línea en la OC
      const linePart = ocTotal > 0 ? (it.line_amount / ocTotal) * ocFact : 0;
      b.totalFacturado += linePart;
      if (it.product?.unit_cost_net && it.product.unit_cost_net > 0) {
        b.marginAmount += (it.unit_price - it.product.unit_cost_net) * it.quantity_units;
        b.facturadoConCosto += linePart;
      }
    }
  }
  return buckets;
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? null : 0;     // no comparable si antes era 0 y ahora hay
  return (curr - prev) / prev;
}

export async function getRanking(period: Period, dim: Dimension): Promise<RankingRow[]> {
  const prevP = previousPeriod(period);
  const [orders, prevOrders] = await Promise.all([
    loadOrders(period),
    loadOrders(prevP),
  ]);

  const curr = aggregateRanking(orders, dim);
  const prev = aggregateRanking(prevOrders, dim);

  const rows: RankingRow[] = [];
  for (const b of curr.values()) {
    const p = prev.get(b.key);
    const fillRate = b.totalOc > 0 ? b.totalFacturado / b.totalOc : 0;
    const marginRate = b.facturadoConCosto > 0 ? b.marginAmount / b.facturadoConCosto : null;
    const costCoverage = b.totalFacturado > 0 ? b.facturadoConCosto / b.totalFacturado : 0;
    rows.push({
      key: b.key,
      label: b.label,
      ocCount: b.ocIds.size,
      boxes: b.boxes,
      units: b.units,
      totalOc: b.totalOc,
      totalFacturado: b.totalFacturado,
      fillRate,
      marginAmount: b.facturadoConCosto > 0 ? b.marginAmount : null,
      marginRate,
      costCoverage,
      deltaOcPct: p ? deltaPct(b.totalOc, p.totalOc) : null,
      deltaFactPct: p ? deltaPct(b.totalFacturado, p.totalFacturado) : null,
    });
  }

  rows.sort((a, b) => b.totalOc - a.totalOc);
  return rows;
}

