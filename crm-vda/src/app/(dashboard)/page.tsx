import Link from "next/link";
import { redirect } from "next/navigation";
import { Inter } from "next/font/google";
import { getCurrentProfile, getUserModules } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const revalidate = 60;

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

const monthLabel = (d: Date) => new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(d);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const todayLabel = () => new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(new Date());

interface AttentionItem {
  id: string;
  module: "supermercados" | "finanzas" | "nv" | "configuracion";
  moduleLabel: string;
  severity: "critica" | "alta" | "media" | "reciente";
  title: string;
  detail: string;
  amount: number;
  href: string;
}

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const userModules = await getUserModules(profile.id, profile.role_id);
  const userModuleNames = new Set(userModules.map((m) => m.name));

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayIso = now.toISOString().split("T")[0];

  // === KPI DATA ===
  const [
    { data: nvMonth },
    { data: nvPrev },
    { data: nvYtd },
    { data: ocMonth },
    { data: ocPrev },
    { data: debts },
    { data: ocOverdue },
  ] = await Promise.all([
    supabase.from("sales_notes")
      .select("total_amount, status")
      .gte("issue_date", monthStart)
      .lte("issue_date", monthEnd)
      .neq("status", "RECHAZADO"),
    supabase.from("sales_notes")
      .select("total_amount, status")
      .gte("issue_date", prevMonthStart)
      .lte("issue_date", prevMonthEnd)
      .neq("status", "RECHAZADO"),
    supabase.from("sales_notes")
      .select("total_amount")
      .gte("issue_date", yearStart)
      .neq("status", "RECHAZADO"),
    supabase.from("purchase_orders")
      .select("total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))")
      .gte("order_date", monthStart)
      .lte("order_date", monthEnd),
    supabase.from("purchase_orders")
      .select("total_amount, invoices:oc_invoices(oc_invoice_items(amount_invoiced))")
      .gte("order_date", prevMonthStart)
      .lte("order_date", prevMonthEnd),
    supabase.from("client_debts")
      .select("amount_due"),
    supabase.from("purchase_orders")
      .select(`
        id, order_number, total_amount, cancellation_date, status, buyer,
        chain:supermarket_chains(name),
        invoices:oc_invoices(oc_invoice_items(amount_invoiced))
      `)
      .not("cancellation_date", "is", null)
      .lt("cancellation_date", todayIso)
      .neq("status", "COMPLETADA")
      .order("cancellation_date", { ascending: true })
      .limit(200),
  ]);

  // Facturación mes
  const factMonth = (nvMonth ?? []).reduce((s, n) => s + (n.total_amount || 0), 0);
  const factPrev = (nvPrev ?? []).reduce((s, n) => s + (n.total_amount || 0), 0);
  const factYtd = (nvYtd ?? []).reduce((s, n) => s + (n.total_amount || 0), 0);
  const factDelta = factPrev > 0 ? ((factMonth - factPrev) / factPrev) * 100 : 0;

  // Cumplimiento OC mes
  type OcRow = { total_amount: number; invoices: { oc_invoice_items: { amount_invoiced: number }[] }[] };
  const ocMonthRows = (ocMonth ?? []) as unknown as OcRow[];
  const ocMontoMonth = ocMonthRows.reduce((s, o) => s + o.total_amount, 0);
  const ocFactMonth = ocMonthRows.reduce((s, o) => s + o.invoices.reduce((a, inv) => a + inv.oc_invoice_items.reduce((aa, it) => aa + (it.amount_invoiced || 0), 0), 0), 0);
  const ocFillMonth = ocMontoMonth > 0 ? ocFactMonth / ocMontoMonth : 0;
  const ocPrevRows = (ocPrev ?? []) as unknown as OcRow[];
  const ocMontoPrev = ocPrevRows.reduce((s, o) => s + o.total_amount, 0);
  const ocFactPrev = ocPrevRows.reduce((s, o) => s + o.invoices.reduce((a, inv) => a + inv.oc_invoice_items.reduce((aa, it) => aa + (it.amount_invoiced || 0), 0), 0), 0);
  const ocFillPrev = ocMontoPrev > 0 ? ocFactPrev / ocMontoPrev : 0;
  const fillDeltaPp = Math.round((ocFillMonth - ocFillPrev) * 100);

  // Deuda total
  const totalDebt = (debts ?? []).reduce((s, d) => s + (d.amount_due || 0), 0);
  const debtClients = (debts ?? []).filter((d) => (d.amount_due || 0) > 0).length;

  // OC vencidas — agrupar para los items de atención
  type OverdueRow = {
    id: string; order_number: string; total_amount: number; cancellation_date: string;
    status: string; buyer: string | null;
    chain: { name: string } | null;
    invoices: { oc_invoice_items: { amount_invoiced: number }[] }[];
  };
  const overdueRaw = (ocOverdue ?? []) as unknown as OverdueRow[];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueWithDays = overdueRaw.map((o) => {
    const venc = new Date(o.cancellation_date);
    venc.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - venc.getTime()) / 86400000);
    const fact = o.invoices.reduce((a, inv) => a + inv.oc_invoice_items.reduce((aa, it) => aa + (it.amount_invoiced || 0), 0), 0);
    const pendiente = Math.max(0, o.total_amount - fact);
    return { ...o, days, pendiente };
  }).filter((o) => o.pendiente > 0);

  const overdueCount = overdueWithDays.length;
  const overdueMonto = overdueWithDays.reduce((s, o) => s + o.pendiente, 0);
  const overdueOldestDays = overdueWithDays.length > 0 ? Math.max(...overdueWithDays.map((o) => o.days)) : 0;
  const overduePctOfMonth = ocMonthRows.length > 0 ? Math.round((overdueCount / ocMonthRows.length) * 100) : 0;

  // Items de atención (agrupados por severidad)
  const criticas = overdueWithDays.filter((o) => o.days > 30);
  const altas = overdueWithDays.filter((o) => o.days > 14 && o.days <= 30);
  const medias = overdueWithDays.filter((o) => o.days > 7 && o.days <= 14);
  const recientes = overdueWithDays.filter((o) => o.days >= 1 && o.days <= 7);

  const attention: AttentionItem[] = [];
  if (criticas.length > 0) {
    attention.push({
      id: "ov-critica",
      module: "supermercados",
      moduleLabel: "Supermercados",
      severity: "critica",
      title: `${criticas.length} OC vencida${criticas.length !== 1 ? "s" : ""} hace más de 30 días`,
      detail: criticas.slice(0, 2).map((c) => `${c.chain?.name ?? ""} · OC ${c.order_number}`).join(" · "),
      amount: criticas.reduce((s, c) => s + c.pendiente, 0),
      href: "/supermercados/alertas",
    });
  }
  if (altas.length > 0) {
    attention.push({
      id: "ov-alta",
      module: "supermercados",
      moduleLabel: "Supermercados",
      severity: "alta",
      title: `${altas.length} OC vencida${altas.length !== 1 ? "s" : ""} entre 15-30 días sin facturar`,
      detail: "Revisar stock y mapeo de SKUs · escalamiento con cadena",
      amount: altas.reduce((s, c) => s + c.pendiente, 0),
      href: "/supermercados/alertas",
    });
  }
  if (medias.length > 0) {
    attention.push({
      id: "ov-media",
      module: "supermercados",
      moduleLabel: "Supermercados",
      severity: "media",
      title: `${medias.length} OC vencida${medias.length !== 1 ? "s" : ""} entre 8-14 días`,
      detail: "Aún recuperables · priorizar asignación de facturas",
      amount: medias.reduce((s, c) => s + c.pendiente, 0),
      href: "/supermercados/alertas",
    });
  }
  if (recientes.length > 0) {
    attention.push({
      id: "ov-reciente",
      module: "supermercados",
      moduleLabel: "Supermercados",
      severity: "reciente",
      title: `${recientes.length} OC vencida${recientes.length !== 1 ? "s" : ""} entre 1-7 días · acción inmediata`,
      detail: "Pueden recuperarse si se factura en próximos días hábiles",
      amount: recientes.reduce((s, c) => s + c.pendiente, 0),
      href: "/supermercados/alertas",
    });
  }
  const totalAttention = attention.reduce((s, a) => s + a.amount, 0);

  // === MÓDULOS ===
  interface ModuleCard {
    id: string;
    label: string;
    desc: string;
    href: string;
    icon: React.ReactNode;
    status: "active" | "coming_soon" | "highlight";
    badge?: { text: string; tone: "neg" | "warn" };
  }

  const supermercadosBadge = overdueCount > 0
    ? { text: `${overdueCount} alerta${overdueCount !== 1 ? "s" : ""}`, tone: "neg" as const }
    : undefined;

  const operacionesModules: ModuleCard[] = [
    {
      id: "nota_venta",
      label: "Nota de Venta",
      desc: "Crear y gestionar NV",
      href: "/nota-venta",
      status: userModuleNames.has("emisor_nv") ? "active" : "active",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      ),
    },
    {
      id: "finanzas",
      label: "Control Financiero",
      desc: "Crédito y deuda clientes",
      href: "/finanzas",
      status: userModuleNames.has("finanzas") ? "active" : "active",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      id: "oc_supermercados",
      label: "Supermercados",
      desc: "OC cadenas retail",
      href: "/supermercados",
      status: "highlight",
      badge: supermercadosBadge,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      ),
    },
    {
      id: "despacho",
      label: "Control Despacho",
      desc: "Gestión de envíos",
      href: "/despacho",
      status: "coming_soon",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="3" width="15" height="13" />
          <path d="M16 8h4l3 3v5h-7" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      id: "stock",
      label: "Stock Mercado",
      desc: "Control de inventario",
      href: "/stock",
      status: "coming_soon",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      ),
    },
  ];

  const gestionModules: ModuleCard[] = [
    {
      id: "configuracion",
      label: "Configuración",
      desc: "Parámetros del sistema",
      href: "/configuracion",
      status: "active",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: "cargadores",
      label: "Cargadores y Mapeos",
      desc: "Importación de datos",
      href: "/admin/cargadores",
      status: "active",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
      ),
    },
    {
      id: "costos",
      label: "Costos y Rappel",
      desc: "Costos y descuentos",
      href: "/costos",
      status: "active",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
  ];

  function ModuleCardComponent({ m }: { m: ModuleCard }) {
    if (m.status === "coming_soon") {
      return (
        <div className="bg-bg-surface border border-line rounded-md p-4 relative">
          <div className="absolute top-3 right-3">
            <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-warn-soft text-warn font-medium tracking-wider uppercase">Pronto</span>
          </div>
          <div className="flex items-start justify-between">
            <div className="w-9 h-9 rounded-md bg-bg-muted border border-line flex items-center justify-center text-ink-3 opacity-60">
              {m.icon}
            </div>
          </div>
          <div className="text-sm font-medium text-ink-2 mt-3">{m.label}</div>
          <div className="text-[11px] text-ink-3 mt-1">{m.desc}</div>
        </div>
      );
    }
    const isHighlight = m.status === "highlight";
    return (
      <Link
        href={m.href}
        prefetch
        className={`bg-bg-surface ${isHighlight ? "border border-wine" : "border border-line"} rounded-md p-4 hover:border-line-2 hover:bg-bg-subtle transition group relative block`}
      >
        {m.badge && (
          <div className="absolute top-3 right-3">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium tabular ${m.badge.tone === "neg" ? "bg-neg-soft text-neg" : "bg-warn-soft text-warn"}`}>
              {m.badge.text}
            </span>
          </div>
        )}
        <div className="flex items-start justify-between">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center ${isHighlight ? "bg-wine text-white" : "bg-bg-muted border border-line text-ink-2 group-hover:bg-bg-surface"}`}>
            {m.icon}
          </div>
          {!m.badge && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-3 group-hover:text-ink-2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          )}
        </div>
        <div className="text-sm font-medium text-ink mt-3">{m.label}</div>
        <div className="text-[11px] text-ink-2 mt-1">{m.desc}</div>
      </Link>
    );
  }

  function SeverityBadge({ severity }: { severity: AttentionItem["severity"] }) {
    if (severity === "critica") return <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-wine text-white font-medium tabular w-fit ml-auto">CRÍTICA</span>;
    if (severity === "alta") return <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-neg-soft text-neg font-medium tabular w-fit ml-auto">ALTA</span>;
    if (severity === "media") return <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-orange-soft text-orange font-medium tabular w-fit ml-auto">MEDIA</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-warn-soft text-warn font-medium tabular w-fit ml-auto">RECIENTE</span>;
  }

  function SeverityDot({ severity }: { severity: AttentionItem["severity"] }) {
    const cls = severity === "critica" ? "bg-wine" : severity === "alta" ? "bg-neg" : severity === "media" ? "bg-orange" : "bg-warn";
    return <span className={`w-2 h-2 rounded-full ${cls}`} />;
  }

  return (
    <div className={`${inter.variable}`} style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif" }}>
      <div className="max-w-[1280px] mx-auto px-8 py-6">

        {/* PageHeader */}
        <div className="flex justify-between items-start pb-5 border-b border-line">
          <div>
            <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1.5">
              Sistema de gestión comercial · Bodegas y Viñedos de Aguirre
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">Mercado Nacional</h2>
            <p className="text-xs text-ink-2 mt-1">
              Centro de comando · {userModules.length} módulos disponibles · cierre al {todayLabel()}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/nota-venta/nueva"
              className="text-xs px-3 py-1.5 border border-line rounded-md bg-bg-surface hover:bg-bg-muted text-ink-2 inline-flex items-center gap-1.5"
              prefetch
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
              Nueva NV
            </Link>
            <Link
              href="/admin/cargadores/oc-supermercados"
              className="text-xs px-3 py-1.5 rounded-md bg-wine text-white hover:bg-wine-2 inline-flex items-center gap-1.5 font-medium"
              prefetch
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              Cargar OC
            </Link>
          </div>
        </div>

        {/* PULSO DEL NEGOCIO */}
        <div className="mt-6">
          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">01</div>
            <div className="text-xs font-medium text-ink">Pulso del negocio</div>
            <div className="text-[10px] text-ink-3">— métricas clave del mes en curso ({capitalize(monthLabel(now))})</div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {/* KPI 1 — Facturación del mes */}
            <div className="bg-bg-surface border border-line rounded-md p-4">
              <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Facturación del mes</div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="text-2xl font-semibold tracking-tight tabular text-ink leading-none">{fmtClpCompact(factMonth)}</div>
                {factPrev > 0 && (
                  <span className={`text-[10px] font-medium tabular ${factDelta >= 0 ? "text-pos" : "text-neg"}`}>
                    {factDelta >= 0 ? "+" : ""}{Math.round(factDelta)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-ink-2 mt-2 tabular">
                vs mes ant. {fmtClpCompact(factPrev)} · YTD {fmtClpCompact(factYtd)}
              </div>
            </div>

            {/* KPI 2 — Cumplimiento OC */}
            <div className="bg-bg-surface border border-line rounded-md p-4">
              <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Cumplimiento OC</div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="text-2xl font-semibold tracking-tight tabular text-ink leading-none">
                  {Math.round(ocFillMonth * 100)}<span className="text-base text-ink-2 font-normal">%</span>
                </div>
                {ocFillPrev > 0 && (
                  <span className={`text-[10px] font-medium tabular ${fillDeltaPp >= 0 ? "text-pos" : "text-neg"}`}>
                    {fillDeltaPp >= 0 ? "+" : ""}{fillDeltaPp} pp
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${ocFillMonth >= 0.85 ? "bg-pos" : ocFillMonth >= 0.5 ? "bg-warn" : "bg-neg"}`}
                  style={{ width: `${Math.round(ocFillMonth * 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-ink-2 mt-1 tabular">
                meta 85% · mes ant. {Math.round(ocFillPrev * 100)}%
              </div>
            </div>

            {/* KPI 3 — Deuda total */}
            <div className="bg-bg-surface border border-line rounded-md p-4">
              <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Deuda total clientes</div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="text-2xl font-semibold tracking-tight tabular text-ink leading-none">{fmtClpCompact(totalDebt)}</div>
              </div>
              <div className="text-[10px] text-ink-2 mt-2 tabular">{debtClients} cliente{debtClients !== 1 ? "s" : ""} con saldo</div>
            </div>

            {/* KPI 4 — Vencidas (wine card) */}
            <div className="bg-wine rounded-md p-4 text-wine-text">
              <div className="text-[10px] tracking-[0.05em] uppercase text-wine-text-2 font-medium">OC vencidas sin facturar</div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="text-2xl font-semibold tracking-tight tabular text-white leading-none">{overdueCount}</div>
                {overduePctOfMonth > 0 && (
                  <span className="text-[10px] text-wine-text-2 tabular">{overduePctOfMonth}% del mes</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                <span className="text-wine-text tabular">
                  {fmtClpCompact(overdueMonto)}{overdueOldestDays > 0 ? ` · más antigua ${overdueOldestDays}d` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MÓDULOS */}
        <div className="mt-8">
          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">02</div>
            <div className="text-xs font-medium text-ink">Módulos del sistema</div>
            <div className="text-[10px] text-ink-3">— acceso rápido por área operativa</div>
          </div>

          <div className="text-[9px] uppercase tracking-[0.15em] text-ink-3 font-medium mb-2 mt-1">Operaciones</div>
          <div className="grid grid-cols-5 gap-3 mb-5">
            {operacionesModules.map((m) => <ModuleCardComponent key={m.id} m={m} />)}
          </div>

          <div className="text-[9px] uppercase tracking-[0.15em] text-ink-3 font-medium mb-2">Gestión y administración</div>
          <div className="grid grid-cols-5 gap-3">
            {gestionModules.map((m) => <ModuleCardComponent key={m.id} m={m} />)}
            <div className="bg-bg-subtle border border-dashed border-line rounded-md p-4 flex items-center justify-center col-span-2">
              <div className="text-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9B9B96" strokeWidth="1.5" className="mx-auto"><path d="M12 5v14M5 12h14"/></svg>
                <div className="text-[10px] text-ink-3 mt-1.5 tracking-wider uppercase">Espacio para próximos módulos</div>
              </div>
            </div>
          </div>
        </div>

        {/* REQUIERE ATENCIÓN */}
        {attention.length > 0 && (
          <div className="mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">03</div>
                <div className="text-xs font-medium text-ink">Requiere atención hoy</div>
                <div className="text-[10px] text-ink-3">— items priorizados del día por severidad</div>
              </div>
              <div className="text-[10px] text-ink-2 tabular">{attention.length} {attention.length === 1 ? "item activo" : "items activos"} · {todayLabel()}</div>
            </div>

            <div className="bg-bg-surface border border-line rounded-md overflow-hidden">
              <div className="grid grid-cols-[120px_28px_1fr_120px_100px_24px] gap-3 px-4 py-2 bg-bg-subtle border-b border-line text-[9px] uppercase tracking-wider text-ink-3 font-medium">
                <div>Módulo</div>
                <div></div>
                <div>Detalle</div>
                <div className="text-right">Monto</div>
                <div className="text-right">Severidad</div>
                <div></div>
              </div>

              {attention.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch
                  className="grid grid-cols-[120px_28px_1fr_120px_100px_24px] gap-3 px-4 py-2.5 hover:bg-bg-subtle border-b border-line last:border-b-0 items-center group"
                >
                  <div className="text-[11px] text-ink-2 inline-flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-3 flex-shrink-0">
                      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                    {item.moduleLabel}
                  </div>
                  <SeverityDot severity={item.severity} />
                  <div className="min-w-0">
                    <div className="text-xs text-ink truncate">{item.title}</div>
                    <div className="text-[10px] text-ink-3 mt-0.5 truncate">{item.detail}</div>
                  </div>
                  <span className="text-[11px] tabular text-right text-ink font-medium">{fmtClpCompact(item.amount)}</span>
                  <SeverityBadge severity={item.severity} />
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-3 group-hover:text-ink-2"><path d="M9 6l6 6-6 6"/></svg>
                </Link>
              ))}

              <div className="px-4 py-2 bg-bg-subtle border-t border-line flex justify-between items-center text-[10px]">
                <div className="flex gap-3 text-ink-3">
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-wine"></span>Crítica</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-neg"></span>Alta</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange"></span>Media</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warn"></span>Reciente</span>
                </div>
                <div className="text-ink-2 tabular">Total expuesto: <span className="text-neg font-medium">{fmtClpCompact(totalAttention)}</span></div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
