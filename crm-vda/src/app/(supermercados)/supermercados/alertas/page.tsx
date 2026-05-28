import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TabsNav } from "../_components/TabsNav";

export const revalidate = 60;

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

type Severity = "critica" | "alta" | "media" | "reciente";

interface AlertItem {
  oc_id: string;
  order_number: string;
  chain_name: string;
  buyer: string | null;
  items_count: number;
  cancellation_date: string;
  total_amount: number;
  facturado: number;
  days: number;
  severity: Severity;
}

function getSeverity(days: number): Severity {
  if (days > 30) return "critica";
  if (days > 14) return "alta";
  if (days > 7 || days < -1) return "media";
  return "reciente";
}

const monthAbbr = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  const m = parts[1];
  const d = parts[2];
  return `${String(d).padStart(2, "0")}-${monthAbbr[m - 1]}`;
};

export default async function AlertasPage() {
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizonIso = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];

  const { data } = await supabase
    .from("purchase_orders")
    .select(`
      id, order_number, total_amount, status, cancellation_date, buyer,
      chain:supermarket_chains(name),
      items:purchase_order_items(id),
      invoices:oc_invoices(oc_invoice_items(amount_invoiced))
    `)
    .not("cancellation_date", "is", null)
    .lte("cancellation_date", horizonIso)
    .neq("status", "COMPLETADA")
    .order("cancellation_date", { ascending: true })
    .limit(200);

  type Row = {
    id: string;
    order_number: string;
    total_amount: number;
    status: string;
    cancellation_date: string;
    buyer: string | null;
    chain: { name: string } | null;
    items: { id: string }[];
    invoices: { oc_invoice_items: { amount_invoiced: number }[] }[];
  };
  const raw = (data ?? []) as unknown as Row[];

  const alerts: AlertItem[] = raw
    .filter((r) => !!r.chain)
    .map((r) => {
      const venc = new Date(r.cancellation_date);
      venc.setHours(0, 0, 0, 0);
      const days = Math.floor((today.getTime() - venc.getTime()) / 86400000);
      const facturado = r.invoices.reduce((s, inv) => s + inv.oc_invoice_items.reduce((a, it) => a + (it.amount_invoiced || 0), 0), 0);
      if (facturado >= r.total_amount && r.total_amount > 0) return null;
      return {
        oc_id: r.id,
        order_number: r.order_number,
        chain_name: r.chain!.name,
        buyer: r.buyer,
        items_count: r.items.length,
        cancellation_date: r.cancellation_date,
        total_amount: r.total_amount,
        facturado,
        days,
        severity: getSeverity(days),
      };
    })
    .filter((a): a is AlertItem => a !== null)
    .sort((a, b) => b.days - a.days);

  const criticas = alerts.filter((a) => a.severity === "critica");
  const altas = alerts.filter((a) => a.severity === "alta");
  const medias = alerts.filter((a) => a.severity === "media");
  const recientes = alerts.filter((a) => a.severity === "reciente");

  const sumMonto = (arr: AlertItem[]) => arr.reduce((s, a) => s + Math.max(0, a.total_amount - a.facturado), 0);

  return (
    <>
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 pb-4 border-b border-line">
        <div>
          <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1">
            BVDA · Mercado Nacional · Supermercados
          </div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">Alertas · Lo accionable hoy</h2>
          <p className="text-xs text-ink-2 mt-0.5">
            Cola priorizada · {alerts.length} {alerts.length === 1 ? "alerta activa" : "alertas activas"}
            {criticas.length > 0 && <span className="text-neg font-medium"> · {criticas.length} crítica{criticas.length !== 1 ? "s" : ""}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href="/admin/cargadores/oc-supermercados"
            className="text-xs px-3 py-1.5 rounded-md bg-wine text-white hover:bg-wine-2 inline-flex items-center gap-1.5 font-medium"
            prefetch
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            <span className="hidden sm:inline">Cargar OC</span>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 mb-4">
        <TabsNav alertasCount={alerts.length} />
      </div>

      {/* Resumen de alertas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <div className="bg-bg-surface border border-line rounded-md p-3 border-l-[3px] border-l-wine">
          <div className="text-[10px] uppercase tracking-wider text-wine font-medium">Críticas</div>
          <div className="text-xl font-semibold tabular text-wine mt-1">{criticas.length}</div>
          <div className="text-[10px] text-ink-2 mt-0.5 tabular">+30 días · {fmtClpCompact(sumMonto(criticas))}</div>
        </div>
        <div className="bg-bg-surface border border-line rounded-md p-3 border-l-[3px] border-l-neg">
          <div className="text-[10px] uppercase tracking-wider text-neg font-medium">Altas</div>
          <div className="text-xl font-semibold tabular text-neg mt-1">{altas.length}</div>
          <div className="text-[10px] text-ink-2 mt-0.5 tabular">15-30 días · {fmtClpCompact(sumMonto(altas))}</div>
        </div>
        <div className="bg-bg-surface border border-line rounded-md p-3 border-l-[3px] border-l-orange">
          <div className="text-[10px] uppercase tracking-wider text-orange font-medium">Medias</div>
          <div className="text-xl font-semibold tabular text-orange mt-1">{medias.length}</div>
          <div className="text-[10px] text-ink-2 mt-0.5 tabular">8-14 días · {fmtClpCompact(sumMonto(medias))}</div>
        </div>
        <div className="bg-bg-surface border border-line rounded-md p-3 border-l-[3px] border-l-warn">
          <div className="text-[10px] uppercase tracking-wider text-warn font-medium">Recientes</div>
          <div className="text-xl font-semibold tabular text-warn mt-1">{recientes.length}</div>
          <div className="text-[10px] text-ink-2 mt-0.5 tabular">1-7 días o por vencer · {fmtClpCompact(sumMonto(recientes))}</div>
        </div>
      </div>

      {/* Lista priorizada */}
      <div className="bg-bg-surface border border-line rounded-md overflow-hidden">
        <div className="px-3 sm:px-4 py-2.5 bg-bg-subtle border-b border-line flex justify-between items-baseline">
          <div>
            <div className="text-xs font-medium text-ink">Cola priorizada · {alerts.length} alertas activas</div>
            <div className="text-[10px] text-ink-2 mt-0.5 hidden sm:block">Ordenadas por severidad y antigüedad</div>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-pos-soft text-pos inline-flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="text-sm font-medium text-ink">Todo en orden</div>
            <p className="text-xs text-ink-2 mt-1">Sin alertas activas — ningún OC requiere acción inmediata.</p>
          </div>
        ) : (
          alerts.map((a) => {
            const sevConfig = {
              critica: { badge: "bg-wine text-white", icon: "bg-wine text-white", label: "CRÍTICA" },
              alta:    { badge: "bg-neg-soft text-neg", icon: "bg-neg-soft text-neg", label: "ALTA" },
              media:   { badge: "bg-orange-soft text-orange", icon: "bg-orange-soft text-orange", label: "MEDIA" },
              reciente:{ badge: "bg-warn-soft text-warn", icon: "bg-warn-soft text-warn", label: "RECIENTE" },
            }[a.severity];
            const pendiente = Math.max(0, a.total_amount - a.facturado);
            const isVencida = a.days > 0;
            return (
              <Link
                key={a.oc_id}
                href={`/supermercados/oc/${a.oc_id}`}
                className="w-full text-left flex flex-col sm:grid sm:grid-cols-[20px_100px_1fr_80px_55px_75px_24px] gap-1 sm:gap-3 px-3 sm:px-4 py-2.5 hover:bg-bg-subtle border-b border-line last:border-b-0 sm:items-center group"
                prefetch
              >
                {/* Mobile: condensed row */}
                <div className="sm:hidden flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${sevConfig.icon}`}>
                      {isVencida ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
                      ) : (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                      )}
                    </span>
                    <span className="text-xs font-mono text-wine truncate">{a.order_number}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium tabular ${sevConfig.badge}`}>{sevConfig.label}</span>
                  </div>
                  <span className={`text-[11px] tabular font-medium flex-shrink-0 ${isVencida ? "text-neg" : "text-warn"}`}>
                    {isVencida ? `+${a.days}d` : `−${Math.abs(a.days)}d`}
                  </span>
                </div>
                <div className="sm:hidden text-[11px] text-ink-2 pl-6">
                  {a.chain_name} · {fmtClpCompact(pendiente)} sin facturar
                </div>

                {/* Desktop: grid row */}
                <span className={`hidden sm:flex w-4 h-4 rounded-full items-center justify-center ${sevConfig.icon}`}>
                  {isVencida ? (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
                  ) : (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  )}
                </span>
                <span className="hidden sm:inline text-xs font-mono text-wine">{a.order_number}</span>
                <div className="hidden sm:block">
                  <div className="text-xs text-ink">
                    {a.chain_name} · {a.buyer ?? "—"} · {a.items_count} {a.items_count === 1 ? "línea" : "líneas"}
                  </div>
                  <div className="text-[10px] text-ink-3 mt-0.5">
                    {isVencida ? `Vencida ${fmtDate(a.cancellation_date)}` : `Vence ${fmtDate(a.cancellation_date)}`} · {fmtClpCompact(pendiente)} sin facturar
                  </div>
                </div>
                <span className="hidden sm:inline text-[11px] tabular text-right text-ink">{fmtClpCompact(a.total_amount)}</span>
                <span className={`hidden sm:inline text-[11px] tabular text-right font-medium ${isVencida ? "text-neg" : "text-warn"}`}>
                  {isVencida ? `+${a.days}d` : `−${Math.abs(a.days)}d`}
                </span>
                <span className={`hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-sm font-medium tabular w-fit ml-auto ${sevConfig.badge}`}>{sevConfig.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="hidden sm:block text-ink-3 group-hover:text-ink-2"><path d="M9 6l6 6-6 6"/></svg>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
