import Link from "next/link";
import { parsePeriod } from "./_lib/period";
import { getDashboardKpis, getChainBreakdown } from "./_lib/queries";
import { TabsNav } from "./_components/TabsNav";

export const revalidate = 60;

const fmtClpCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(Math.abs(n) >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function chainBgClass(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud") || n.includes("jumbo") || n.includes("santa isabel")) return "bg-ch-cencosud";
  if (n.includes("smu") || n.includes("unimarc")) return "bg-ch-smu";
  if (n.includes("tottus") || n.includes("falabella")) return "bg-ch-tottus";
  if (n.includes("walmart") || n.includes("lider") || n.includes("líder") || n.includes("acuenta")) return "bg-ch-walmart";
  return "bg-ch-other";
}

const TONE_BG: Record<string, string> = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" };
const TONE_TEXT: Record<string, string> = { pos: "text-pos", warn: "text-warn", neg: "text-neg" };
function toneFor(rate: number): "pos" | "warn" | "neg" {
  return rate >= 0.85 ? "pos" : rate >= 0.5 ? "warn" : "neg";
}

function chainSubtitle(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cencosud")) return "Jumbo · Santa Isabel · Spid 35";
  if (n.includes("smu")) return "Unimarc · OK Market · Alvi · Mayorista 10";
  if (n.includes("tottus")) return "Falabella retail";
  if (n.includes("walmart")) return "Líder · Ekono · aCuenta";
  return "";
}

export default async function CumplimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string }>;
}) {
  const sp = await searchParams;
  // Support both `mes` (nuevo) y `periodo` (legacy)
  const period = parsePeriod(sp.mes ?? sp.periodo);

  const [kpis, chains] = await Promise.all([
    getDashboardKpis(period),
    getChainBreakdown(period),
  ]);

  // Navegación de meses
  const [yearStr, monthStr] = period.paramValue.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const fmtMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const totalVencidasMonto = Math.max(0, kpis.totalPerdido);
  const noFacturadoPct = kpis.totalOc > 0 ? ((kpis.totalOc - kpis.totalFacturado) / kpis.totalOc) * 100 : 0;

  return (
    <>
      {/* PAGE HEADER */}
      <div className="flex justify-between items-start pb-5 border-b border-line">
        <div>
          <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1.5">
            BVDA · Mercado Nacional · Supermercados
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Cumplimiento de Órdenes</h2>
          <p className="text-xs text-ink-2 mt-1">
            Recepción y facturación de OC de cadenas · {kpis.ocCount} OC activas · {capitalize(period.label)}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex bg-bg-surface border border-line rounded-md text-xs">
            <Link href={`?mes=${fmtMes(prev)}`} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-l-md border-r border-line" prefetch>‹</Link>
            <span className="px-3 py-1.5 bg-ink text-white font-medium tabular">{capitalize(period.label)}</span>
            <Link href={`?mes=${fmtMes(next)}`} className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-r-md border-l border-line" prefetch>›</Link>
          </div>
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

      {/* TABS */}
      <div className="flex items-center justify-between mt-5 mb-5">
        <TabsNav ordenesCount={kpis.ocCount} alertasCount={kpis.vencidasCount} />
      </div>

      {/* ALERT BANNER */}
      {kpis.vencidasCount > 0 && (
        <Link
          href="/supermercados/alertas"
          className="flex items-center gap-3 px-4 py-3 mb-5 bg-neg-soft border-l-[3px] border-neg rounded-r-md hover:bg-neg-soft/70 transition-colors"
          prefetch
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F1D1D" strokeWidth="1.5" className="flex-shrink-0">
            <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
          <div className="flex-1">
            <div className="text-xs font-medium text-[#7F1D1D]">
              <span className="tabular">{kpis.vencidasCount} OC vencida{kpis.vencidasCount !== 1 ? "s" : ""}</span> suman{" "}
              <span className="tabular">{fmtClpCompact(totalVencidasMonto)}</span> en pendiente de facturar
            </div>
            <div className="text-[11px] text-[#A32D2D] mt-0.5">
              Revisar asignación de facturas antes del cierre de mes
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-md border border-neg/20 bg-neg-soft hover:bg-neg-soft/60 text-neg font-medium inline-flex items-center gap-1">
            Ver alertas
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </Link>
      )}

      {/* KPIs */}
      <div>
        <div className="flex items-baseline gap-2 mb-3">
          <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">01</div>
          <div className="text-xs font-medium text-ink">Indicadores del mes</div>
          <div className="text-[10px] text-ink-3">— estado consolidado de OCs activas</div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Cumplimiento global</div>
            <div className="flex items-baseline gap-2 mt-2">
              <div className="text-2xl font-semibold tracking-tight tabular text-ink leading-none">
                {Math.round(kpis.fillRate * 100)}<span className="text-base text-ink-2 font-normal">%</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${kpis.fillRate >= 0.85 ? "bg-pos" : kpis.fillRate >= 0.5 ? "bg-warn" : "bg-neg"}`}
                style={{ width: `${Math.round(kpis.fillRate * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-ink-2 mt-1 tabular">{kpis.ocCount} OC · cobertura {Math.round(kpis.marginCoverage * 100)}%</div>
          </div>

          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Facturado</div>
            <div className="flex items-baseline gap-2 mt-2">
              <div className="text-2xl font-semibold tracking-tight tabular text-ink leading-none">
                {fmtClpCompact(kpis.totalFacturado)}
              </div>
            </div>
            <div className="text-[10px] text-ink-2 mt-2 tabular">de {fmtClpCompact(kpis.totalOc)} en OCs</div>
          </div>

          <div className="bg-bg-surface border border-line rounded-md p-4">
            <div className="text-[10px] tracking-[0.05em] uppercase text-ink-3 font-medium">Pendiente facturación</div>
            <div className="text-2xl font-semibold tracking-tight tabular text-ink mt-2 leading-none">
              {fmtClpCompact(kpis.totalPendiente)}
            </div>
            <div className="text-[10px] text-ink-2 mt-2 tabular">
              {noFacturadoPct.toFixed(1)}% del total · {kpis.ocCount - 0} OC abiertas
            </div>
          </div>

          <div className="bg-wine rounded-md p-4 text-wine-text">
            <div className="text-[10px] tracking-[0.05em] uppercase text-wine-text-2 font-medium">OC vencidas</div>
            <div className="flex items-baseline gap-2 mt-2">
              <div className="text-2xl font-semibold tracking-tight tabular text-white leading-none">{kpis.vencidasCount}</div>
              <span className="text-[10px] text-wine-text-2 tabular">
                {kpis.ocCount > 0 ? Math.round((kpis.vencidasCount / kpis.ocCount) * 100) : 0}% del total
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[10px]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span className="text-wine-text tabular">{fmtClpCompact(totalVencidasMonto)} en pendiente</span>
            </div>
          </div>
        </div>
      </div>

      {/* CADENAS */}
      <div className="mt-8">
        <div className="flex items-baseline gap-2 mb-3">
          <div className="text-[10px] tracking-[0.1em] uppercase text-ink-3 font-medium">02</div>
          <div className="text-xs font-medium text-ink">Cumplimiento por cadena</div>
          <div className="text-[10px] text-ink-3">— fill rate · facturado · vencidas · clic para ver OCs</div>
        </div>

        {chains.length === 0 ? (
          <div className="bg-bg-surface border border-line rounded-md p-8 text-center">
            <div className="text-sm font-medium text-ink">Sin OCs en el período</div>
            <p className="text-xs text-ink-2 mt-1">Carga las OCs del mes para ver el desglose por cadena.</p>
          </div>
        ) : (
          <div className="bg-bg-surface border border-line rounded-md overflow-hidden">
            <div className="grid grid-cols-[20px_1fr_60px_140px_120px_120px_70px_24px] gap-3 px-4 py-2 bg-bg-subtle border-b border-line text-[9px] uppercase tracking-wider text-ink-3 font-medium">
              <div></div>
              <div>Cadena</div>
              <div className="text-right">OC</div>
              <div>Cumplimiento</div>
              <div className="text-right">Facturado</div>
              <div className="text-right">Pendiente</div>
              <div className="text-right">Vencidas</div>
              <div></div>
            </div>

            {chains.map((ch) => {
              const pct = Math.round(ch.fillRate * 100);
              const tone = toneFor(ch.fillRate);
              const subtitle = chainSubtitle(ch.name);
              const venc = Math.max(0, ch.totalPerdido > 0 ? Math.round(ch.totalPerdido / Math.max(1, ch.totalOc / Math.max(1, ch.ocCount))) : 0);
              return (
                <Link
                  key={ch.id}
                  href={`/supermercados/ordenes?chain=${ch.id}&mes=${period.paramValue}`}
                  className="w-full text-left grid grid-cols-[20px_1fr_60px_140px_120px_120px_70px_24px] gap-3 px-4 py-2.5 hover:bg-bg-subtle border-b border-line last:border-b-0 items-center group"
                  prefetch
                >
                  <span className={`w-2.5 h-5 rounded-sm ${chainBgClass(ch.name)}`}></span>
                  <div>
                    <div className="text-xs font-medium text-ink">{ch.name}</div>
                    {subtitle && <div className="text-[10px] text-ink-3 mt-0.5">{subtitle}</div>}
                  </div>
                  <span className="text-[11px] tabular text-right text-ink">{ch.ocCount}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${TONE_BG[tone]} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[10px] ${TONE_TEXT[tone]} tabular font-medium w-9 text-right`}>{pct}%</span>
                  </div>
                  <span className="text-xs font-medium tabular text-right text-ink">{fmtClpCompact(ch.totalFacturado)}</span>
                  <span className="text-xs font-medium tabular text-right text-ink">{fmtClpCompact(ch.totalPendiente + ch.totalPerdido)}</span>
                  <span className={`text-[11px] tabular text-right ${venc > 0 ? "text-neg font-medium" : "text-ink-3"}`}>
                    {venc > 0 ? venc : "—"}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-3 group-hover:text-ink-2"><path d="M9 6l6 6-6 6"/></svg>
                </Link>
              );
            })}

            <div className="grid grid-cols-[20px_1fr_60px_140px_120px_120px_70px_24px] gap-3 px-4 py-2.5 border-t-2 border-wine bg-bg-subtle items-center text-xs font-medium">
              <span></span>
              <span className="text-[9px] uppercase tracking-wider text-ink-3">Totales · {chains.length} cadena{chains.length !== 1 ? "s" : ""}</span>
              <span className="tabular text-right text-ink">{kpis.ocCount}</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${TONE_BG[toneFor(kpis.fillRate)]} rounded-full`} style={{ width: `${Math.round(kpis.fillRate * 100)}%` }} />
                </div>
                <span className={`text-[10px] ${TONE_TEXT[toneFor(kpis.fillRate)]} tabular font-medium w-9 text-right`}>{Math.round(kpis.fillRate * 100)}%</span>
              </div>
              <span className="tabular text-right text-ink">{fmtClpCompact(kpis.totalFacturado)}</span>
              <span className="tabular text-right text-ink">{fmtClpCompact(kpis.totalPendiente + kpis.totalPerdido)}</span>
              <span className="tabular text-right text-neg">{kpis.vencidasCount}</span>
              <span></span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
