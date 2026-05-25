/**
 * Stats live + acciones por módulo para los cards del home.
 * Cada módulo trae lo más accionable: 2-3 KPIs y 1-2 acciones primarias.
 */

import { createClient } from "@/lib/supabase/server";

export interface Stat {
  val: string | number;
  key: string;
  tone?: "ok" | "warn" | "danger";
}

export interface Action {
  label: string;
  href: string;
  primary?: boolean;
}

export interface Alert {
  text: string;
  tone: "warn" | "danger" | "info";
  href?: string;
}

export interface ModuleStats {
  stats: Stat[];
  alert?: Alert;
  actions: Action[];
}

const fmtMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1_000
      ? `$${Math.round(n / 1_000)}K`
      : `$${n}`;

const fmtNum = (n: number) => new Intl.NumberFormat("es-CL").format(n);

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  return { start, end };
}

/* ============ Por módulo ============ */

async function statsForEmisorNv(): Promise<ModuleStats> {
  const supabase = await createClient();
  const { start, end } = monthRange();

  const [{ count: nvMes }, { count: pendientes }, { data: monto }] = await Promise.all([
    supabase
      .from("sales_notes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${start}T00:00:00`)
      .lte("created_at", `${end}T23:59:59`),
    supabase
      .from("sales_notes")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDIENTE"),
    supabase
      .from("sales_notes")
      .select("total_net")
      .gte("created_at", `${start}T00:00:00`)
      .lte("created_at", `${end}T23:59:59`),
  ]);

  const totalMes = (monto ?? []).reduce((s, r) => s + (r.total_net ?? 0), 0);

  return {
    stats: [
      { val: nvMes ?? 0, key: "NV este mes" },
      { val: fmtMoney(totalMes), key: "Neto mes" },
      { val: pendientes ?? 0, key: "Pendientes", tone: (pendientes ?? 0) > 0 ? "warn" : "ok" },
    ],
    alert: (pendientes ?? 0) > 0
      ? { text: `${pendientes} NV esperando aprobación`, tone: "warn", href: "/nota-venta?filtro=pendiente" }
      : undefined,
    actions: [
      { label: "+ Nueva NV", href: "/nota-venta/nueva", primary: true },
      { label: "Ver listado", href: "/nota-venta" },
    ],
  };
}

async function statsForSupermercados(): Promise<ModuleStats> {
  const supabase = await createClient();
  const { start, end } = monthRange();

  const [{ count: ocMes }, { data: monto }, { count: huerfanas }, { count: totalLineas }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .gte("order_date", start)
      .lte("order_date", end),
    supabase
      .from("purchase_orders")
      .select("total_amount")
      .gte("order_date", start)
      .lte("order_date", end),
    supabase
      .from("purchase_order_items")
      .select("id", { count: "exact", head: true })
      .is("product_id", null),
    supabase
      .from("purchase_order_items")
      .select("id", { count: "exact", head: true }),
  ]);

  const totalMes = (monto ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const cobertura = (totalLineas ?? 0) > 0
    ? Math.round((((totalLineas ?? 0) - (huerfanas ?? 0)) / (totalLineas ?? 0)) * 100)
    : 0;

  return {
    stats: [
      { val: ocMes ?? 0, key: "OC del mes" },
      { val: fmtMoney(totalMes), key: "OC mes" },
      { val: `${cobertura}%`, key: "Líneas mapeadas", tone: cobertura >= 90 ? "ok" : cobertura >= 70 ? "warn" : "danger" },
    ],
    alert: (huerfanas ?? 0) > 0
      ? { text: `${huerfanas} líneas sin SKU mapeado`, tone: "warn", href: "/admin/mapeo-upc" }
      : undefined,
    actions: [
      { label: "+ Cargar OC", href: "/admin/cargadores/oc-supermercados", primary: true },
      { label: "Ver dashboard", href: "/supermercados" },
    ],
  };
}

async function statsForDespacho(): Promise<ModuleStats> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { count: hoy } = await supabase
    .from("dispatches")
    .select("id", { count: "exact", head: true })
    .eq("dispatch_date", today);

  return {
    stats: [
      { val: hoy ?? 0, key: "Despachos hoy" },
      { val: "—", key: "Pendientes" },
    ],
    alert: { text: "Módulo en construcción", tone: "info" },
    actions: [{ label: "Ver despachos", href: "/despacho" }],
  };
}

async function statsForStock(): Promise<ModuleStats> {
  const supabase = await createClient();
  const { count: skus } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  return {
    stats: [
      { val: fmtNum(skus ?? 0), key: "SKUs activos" },
      { val: "—", key: "Sin stock" },
    ],
    alert: { text: "Sin integración de inventario aún", tone: "info" },
    actions: [{ label: "Ver stock", href: "/stock" }],
  };
}

async function statsForFinanzas(): Promise<ModuleStats> {
  const supabase = await createClient();

  const [{ count: clientes }, { data: creditos }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("clients").select("insurer_credit_line_clp").is("deleted_at", null).not("insurer_credit_line_clp", "is", null),
  ]);

  const totalCredito = (creditos ?? []).reduce((s, r) => s + (r.insurer_credit_line_clp ?? 0), 0);
  const conCredito = (creditos ?? []).filter((r) => (r.insurer_credit_line_clp ?? 0) > 0).length;

  return {
    stats: [
      { val: clientes ?? 0, key: "Clientes activos" },
      { val: conCredito, key: "Con línea seguro" },
      { val: fmtMoney(totalCredito), key: "Crédito total" },
    ],
    actions: [
      { label: "Control financiero", href: "/finanzas", primary: true },
      { label: "Ver clientes", href: "/admin/clientes" },
    ],
  };
}

/* ============ Entry point ============ */

const FETCHERS: Record<string, () => Promise<ModuleStats>> = {
  emisor_nv: statsForEmisorNv,
  oc_supermercados: statsForSupermercados,
  despacho: statsForDespacho,
  stock: statsForStock,
  finanzas: statsForFinanzas,
};

export async function getModuleStats(moduleName: string): Promise<ModuleStats> {
  const fn = FETCHERS[moduleName];
  if (!fn) {
    return {
      stats: [],
      alert: { text: "Sin datos configurados", tone: "info" },
      actions: [],
    };
  }
  try {
    return await fn();
  } catch (e) {
    return {
      stats: [],
      alert: { text: `Error: ${(e as Error).message.slice(0, 80)}`, tone: "danger" },
      actions: [],
    };
  }
}
