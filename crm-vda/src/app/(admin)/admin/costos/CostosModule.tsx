"use client";

import { useState, useTransition, useRef, useEffect, useMemo, useCallback, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { saveCost, importCosts, importCostsByQuarter, saveRappel, deleteRappel, saveLogisticCost } from "./actions";
import type { ImportResult } from "./actions";
import type { ProductRow, RappelRow, ChainOption } from "./page";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface Stats {
  totalProducts: number;
  productsWithCost: number;
  currentQuarter: string;
  activeRappel: number;
}

type EnrichedProduct = ProductRow & {
  currentCost: number | null;
  margin: number | null;
  variation: number | null;
  sparkValues: number[];
  trend: "up" | "down" | "flat";
};

const QUARTER_LABELS: Record<string, string> = {
  Q1: "Ene-Mar", Q2: "Abr-Jun", Q3: "Jul-Sep", Q4: "Oct-Dic",
};

function fmtQuarter(q: string): string {
  const [yr, qn] = q.split("-");
  return `${QUARTER_LABELS[qn] ?? qn} ${yr?.slice(2)}`;
}

function fmtCLP(n: number): string {
  return "$" + n.toLocaleString("es-CL");
}

function fmtPct(n: number | null, d = 2): string {
  if (n == null) return "—";
  return n.toFixed(d).replace(".", ",") + "%";
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function generateQuarterOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  for (let y = 2025; y <= 2027; y++) {
    for (let q = 1; q <= 4; q++) {
      const val = `${y}-Q${q}`;
      opts.push({ value: val, label: fmtQuarter(val) });
    }
  }
  return opts;
}

const PAGE_SIZE = 20;

/* ── Icons ──────────────────────────────────────────── */

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const ChevronDown = () => (
  <svg className="dd-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);
const XIcon = ({ size = 12 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
);
const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
);
const ChevLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
);
const ChevRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
);
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
);
const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

/* ── Sparkline SVG ──────────────────────────────────── */

function Sparkline({ values, trend }: { values: number[]; trend: "up" | "down" | "flat" }) {
  if (values.length < 2) return <span className="muted">—</span>;
  const w = 80, h = 28, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + (h - pad * 2) * (1 - (v - min) / range),
  }));
  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${pad},${h - pad} ${polyline} ${last.x.toFixed(1)},${h - pad}`;
  const stroke = trend === "up" ? "var(--danger)" : trend === "down" ? "var(--success)" : "var(--text-3)";
  const fill = trend === "up" ? "var(--danger-soft, #fde8e8)" : trend === "down" ? "var(--success-soft, #e4eede)" : "var(--surface-2)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polygon points={area} fill={fill} opacity={0.5} />
      <polyline points={polyline} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2.2} fill={stroke} />
    </svg>
  );
}

/* ── Margin bar ─────────────────────────────────────── */

function MarginBar({ value }: { value: number }) {
  const color = value >= 40 ? "var(--success)" : value >= 25 ? "var(--text)" : value >= 15 ? "var(--warning-text, #b45309)" : "var(--danger)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
      <div style={{ width: 60, height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontFamily: "var(--f-display)", fontSize: 15, fontWeight: 500, color, minWidth: 50, textAlign: "right" }}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

/* ── Dropdown filter ────────────────────────────────── */

function Dropdown({
  label, value, options, onSelect,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count?: number }[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ddQ, setDdQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const filteredOpts = ddQ
    ? options.filter((o) => o.label.toLowerCase().includes(ddQ.toLowerCase()))
    : options;

  return (
    <div ref={ref} className={`ficha-dropdown ${open ? "open" : ""}`}>
      <button type="button" className={`ficha-dd-trigger ${value ? "has-value" : ""}`} onClick={() => setOpen(!open)}>
        <span className="dd-label"><span>{value || label}</span></span>
        <ChevronDown />
      </button>
      <div className="ficha-dd-menu">
        <div className="ficha-dd-search-wrap">
          <SearchIcon />
          <input className="ficha-dd-search" placeholder="Buscar…" value={ddQ} onChange={(e) => setDdQ(e.target.value)} />
        </div>
        <div className="ficha-dd-list">
          <div className={`ficha-dd-item dd-all ${!value ? "selected" : ""}`} onClick={() => { onSelect(""); setOpen(false); setDdQ(""); }}>Todas</div>
          {filteredOpts.map((o) => (
            <div key={o.value} className={`ficha-dd-item ${value === o.value ? "selected" : ""}`} onClick={() => { onSelect(value === o.value ? "" : o.value); setOpen(false); setDdQ(""); }}>
              {o.label}
              {o.count != null && <span className="dd-count">{o.count}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Helper: get effective cost ─────────────────────── */

function getEffectiveCost(costs: Record<string, number>, quarter: string, quarters: string[]): number | null {
  if (costs[quarter]) return costs[quarter];
  const sorted = quarters.filter((q) => q <= quarter && costs[q]).sort().reverse();
  return sorted.length > 0 ? costs[sorted[0]] : null;
}

function getCostTrend(costs: Record<string, number>, quarters: string[]): { values: number[]; trend: "up" | "down" | "flat" } {
  const sorted = quarters.filter((q) => costs[q]).sort();
  const values = sorted.map((q) => costs[q]);
  if (values.length < 2) return { values, trend: "flat" };
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  return { values, trend: last > prev ? "up" : last < prev ? "down" : "flat" };
}

function getCostVariation(costs: Record<string, number>, quarters: string[]): number | null {
  const sorted = quarters.filter((q) => costs[q]).sort();
  if (sorted.length < 2) return null;
  const last = costs[sorted[sorted.length - 1]];
  const prev = costs[sorted[sorted.length - 2]];
  return prev > 0 ? ((last - prev) / prev) * 100 : null;
}

/* ── Main Component ─────────────────────────────────── */

export function CostosModule({
  products, quarters, currentQuarter, rappel, chains, logisticCostPerUnit, stats,
}: {
  products: ProductRow[];
  quarters: string[];
  currentQuarter: string;
  rappel: RappelRow[];
  chains: ChainOption[];
  logisticCostPerUnit: number;
  stats: Stats;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"costos" | "rappel">("costos");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [wineLineFilter, setWineLineFilter] = useState("");
  const [grapeFilter, setGrapeFilter] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<EnrichedProduct | null>(null);
  const [editingRappel, setEditingRappel] = useState<RappelRow | "new" | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showSimpleImport, setShowSimpleImport] = useState(false);
  const [showLogistic, setShowLogistic] = useState(false);
  const [sortKey, setSortKey] = useState<"sku" | "nombre" | "precio" | "costo" | "margen">("margen");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const catOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) { const cat = p.category_name ?? "Sin categoría"; map.set(cat, (map.get(cat) ?? 0) + 1); }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [products]);

  const brandOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) if (p.brand_name) map.set(p.brand_name, (map.get(p.brand_name) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [products]);

  const wineLineOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) if (p.wine_line) map.set(p.wine_line, (map.get(p.wine_line) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [products]);

  const grapeOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) if (p.grape) map.set(p.grape, (map.get(p.grape) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([v, c]) => ({ value: v, label: v, count: c }));
  }, [products]);

  const enrichedProducts: EnrichedProduct[] = useMemo(() => {
    return products.map((p) => {
      const cost = getEffectiveCost(p.costs, currentQuarter, quarters);
      const neto = p.base_price_net;
      const margin = cost != null && (neto + logisticCostPerUnit) > 0
        ? ((neto + logisticCostPerUnit - cost) / (neto + logisticCostPerUnit)) * 100
        : null;
      const variation = getCostVariation(p.costs, quarters);
      const { values: sparkValues, trend } = getCostTrend(p.costs, quarters);
      return { ...p, currentCost: cost, margin, variation, sparkValues, trend };
    });
  }, [products, quarters, currentQuarter, logisticCostPerUnit]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enrichedProducts.filter((p) => {
      if (catFilter && (p.category_name ?? "Sin categoría") !== catFilter) return false;
      if (brandFilter && p.brand_name !== brandFilter) return false;
      if (wineLineFilter && p.wine_line !== wineLineFilter) return false;
      if (grapeFilter && p.grape !== grapeFilter) return false;
      if (alertsOnly && (p.margin == null || p.margin >= 20)) return false;
      if (q && !p.sku.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enrichedProducts, query, catFilter, brandFilter, wineLineFilter, grapeFilter, alertsOnly]);

  const activeList = useMemo(() => {
    const hasFilter = !!(catFilter || brandFilter || wineLineFilter || grapeFilter || alertsOnly || query.trim());
    return hasFilter ? filteredProducts : enrichedProducts;
  }, [enrichedProducts, filteredProducts, catFilter, brandFilter, wineLineFilter, grapeFilter, alertsOnly, query]);

  const alertCount = useMemo(() => activeList.filter((p) => p.margin != null && p.margin < 20).length, [activeList]);
  const costUpCount = useMemo(() => activeList.filter((p) => p.variation != null && p.variation > 0).length, [activeList]);

  const avgMargin = useMemo(() => {
    const withMargin = activeList.filter((p) => p.margin != null);
    if (withMargin.length === 0) return null;
    return withMargin.reduce((sum, p) => sum + (p.margin ?? 0), 0) / withMargin.length;
  }, [activeList]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "sku") { av = a.sku; bv = b.sku; return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)); }
      if (sortKey === "nombre") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)); }
      if (sortKey === "precio") { av = a.base_price_net; bv = b.base_price_net; }
      else if (sortKey === "costo") { av = a.currentCost ?? 0; bv = b.currentCost ?? 0; }
      else { av = a.margin ?? -999; bv = b.margin ?? -999; }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filteredProducts, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sortedProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, catFilter, brandFilter, wineLineFilter, grapeFilter, alertsOnly]);

  const topMargin = useMemo(() => activeList.filter((p) => p.margin != null).sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0)).slice(0, 3), [activeList]);
  const lowMargin = useMemo(() => activeList.filter((p) => p.margin != null).sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0)).slice(0, 3), [activeList]);

  const hasFilters = !!(catFilter || brandFilter || wineLineFilter || grapeFilter || alertsOnly);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const thStyle = (width?: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width, textAlign: "left", padding: "13px 14px", fontSize: "10.5px", fontWeight: 500,
    textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)", whiteSpace: "nowrap",
    cursor: "pointer", userSelect: "none", ...extra,
  });

  const sortIndicator = (key: typeof sortKey) => sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <>
      {/* HEAD */}
      <section className="doc-head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="doc-eyebrow">Módulo administrativo</div>
            <h1 className="doc-title">Costos <em style={{ fontStyle: "italic", fontWeight: 300, color: "var(--accent)" }}>&amp;</em> Rappel</h1>
            <p className="doc-sub">Control de costo unitario por producto y trimestre, con visibilidad inmediata sobre margen y tendencia.</p>
          </div>
          <div style={{ display: "flex", gap: 32, alignItems: "center", paddingBottom: 6 }}>
            <div>
              <div style={{ fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Trimestre vigente</div>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 500, marginTop: 2 }}>{fmtQuarter(currentQuarter)}</div>
              <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: 1 }}>{currentQuarter}</div>
            </div>
            <div>
              <div style={{ fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Costo logístico</div>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 500, marginTop: 2 }}>{fmtCLP(logisticCostPerUnit)}<span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 400 }}> / un</span></div>
              <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: 1 }}>aplicado a {stats.totalProducts} SKU</div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", margin: "0 24px 28px" }}>
        <div style={{ background: "linear-gradient(135deg, #1B1612 0%, #2A201A 100%)", color: "#F6F2EA", padding: "22px 24px", minHeight: 128 }}>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(246,242,234,0.6)", fontWeight: 500 }}>Margen promedio del catálogo</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 38, fontWeight: 400, lineHeight: 1, marginTop: 14 }} className="num">
            {avgMargin != null ? avgMargin.toFixed(1) : "—"}<span style={{ fontSize: 18, color: "rgba(246,242,234,0.5)", fontWeight: 400, marginLeft: 4 }}>%</span>
          </div>
          <div style={{ fontSize: "12.5px", color: "rgba(246,242,234,0.55)", marginTop: 10 }}>{activeList.filter((p) => p.currentCost != null).length} de {activeList.length} productos con costo</div>
        </div>
        <div style={{ background: "var(--surface)", padding: "22px 24px", minHeight: 128 }}>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Productos en alerta</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 38, fontWeight: 400, lineHeight: 1, marginTop: 14 }}>{alertCount}</div>
          <div style={{ fontSize: "12.5px", color: "var(--text-2)", marginTop: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "var(--danger-soft, #fde8e8)", color: "var(--danger)" }}>margen &lt; 20%</span>
          </div>
        </div>
        <div style={{ background: "var(--surface)", padding: "22px 24px", minHeight: 128 }}>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Costo al alza</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 38, fontWeight: 400, lineHeight: 1, marginTop: 14 }}>{costUpCount}</div>
          <div style={{ fontSize: "12.5px", color: "var(--text-2)", marginTop: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "var(--danger-soft, #fde8e8)", color: "var(--danger)" }}>↑ vs trimestre anterior</span>
          </div>
        </div>
        <div style={{ background: "var(--surface)", padding: "22px 24px", minHeight: 128 }}>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Acuerdos Rappel</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 38, fontWeight: 400, lineHeight: 1, marginTop: 14 }}>{stats.activeRappel}</div>
          <div style={{ fontSize: "12.5px", color: "var(--text-2)", marginTop: 10 }}>
            <span style={{ color: "var(--success)", fontWeight: 500 }}>●</span> {stats.activeRappel} activos
          </div>
        </div>
      </div>

      {/* INSIGHTS STRIP */}
      {tab === "costos" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "0 24px 28px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 16, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                Top margen <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--success-soft)", color: "var(--success)" }}>Estrellas</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topMargin.map((p) => (
                <div key={p.id} onClick={() => setSelectedProduct(p)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "10px 12px", borderRadius: 10, cursor: "pointer", transition: "background .15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--text-3)", fontSize: 11, marginRight: 8, fontFamily: "var(--f-mono)" }}>{p.sku}</span>
                    {titleCase(p.name)}
                  </div>
                  <div style={{ fontFamily: "var(--f-display)", fontSize: 18, fontWeight: 500, color: "var(--success)" }}>{p.margin?.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 16, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                Margen crítico <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--danger-soft, #fde8e8)", color: "var(--danger)" }}>Revisar</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lowMargin.map((p) => (
                <div key={p.id} onClick={() => setSelectedProduct(p)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "10px 12px", borderRadius: 10, cursor: "pointer", transition: "background .15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--text-3)", fontSize: 11, marginRight: 8, fontFamily: "var(--f-mono)" }}>{p.sku}</span>
                    {titleCase(p.name)}
                  </div>
                  <div style={{ fontFamily: "var(--f-display)", fontSize: 18, fontWeight: 500, color: "var(--danger)" }}>{p.margin?.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONTROLS */}
      <div className="toolbar">
        <div className="toolbar-row">
          <div style={{ display: "flex", gap: 4, background: "var(--surface)", border: "1px solid var(--border)", padding: 4, borderRadius: 12 }}>
            <button type="button" className={`chip ${tab === "costos" ? "active" : ""}`} onClick={() => { setTab("costos"); setQuery(""); }} style={{ fontWeight: 500, fontSize: 13, padding: "8px 16px", borderRadius: 8, background: tab === "costos" ? "var(--text)" : "transparent", color: tab === "costos" ? "var(--surface)" : "var(--text-2)", border: "none", cursor: "pointer" }}>
              Costos Producto <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: tab === "costos" ? "rgba(255,255,255,0.15)" : "var(--border)", marginLeft: 4 }}>{stats.totalProducts}</span>
            </button>
            <button type="button" className={`chip ${tab === "rappel" ? "active" : ""}`} onClick={() => { setTab("rappel"); setQuery(""); }} style={{ fontWeight: 500, fontSize: 13, padding: "8px 16px", borderRadius: 8, background: tab === "rappel" ? "var(--text)" : "transparent", color: tab === "rappel" ? "var(--surface)" : "var(--text-2)", border: "none", cursor: "pointer" }}>
              Rappel <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: tab === "rappel" ? "rgba(255,255,255,0.15)" : "var(--border)", marginLeft: 4 }}>{stats.activeRappel}</span>
            </button>
          </div>

          <div className="search-box">
            <SearchIcon />
            <input className="search-input" placeholder={tab === "costos" ? "Buscar por SKU, producto o marca…" : "Buscar cadena…"} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {tab === "costos" && (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Dropdown label="Categoría" value={catFilter} options={catOptions} onSelect={setCatFilter} />
                <Dropdown label="Marca" value={brandFilter} options={brandOptions} onSelect={setBrandFilter} />
                {wineLineOptions.length > 0 && <Dropdown label="Línea vino" value={wineLineFilter} options={wineLineOptions} onSelect={setWineLineFilter} />}
                {grapeOptions.length > 0 && <Dropdown label="Cepa" value={grapeFilter} options={grapeOptions} onSelect={setGrapeFilter} />}
                <button type="button" className={`btn ${alertsOnly ? "btn-primary" : "btn-ghost"}`} onClick={() => setAlertsOnly(!alertsOnly)} style={{ fontSize: 13 }}>
                  Sólo alertas
                </button>
              </div>
            </>
          )}

          <div className="toolbar-actions">
            {tab === "costos" ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowLogistic(true)}>
                  <SettingsIcon /> Costo logístico
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowImport(true)}>
                  <UploadIcon /> Importar trimestral
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setShowSimpleImport(true)}>
                  <UploadIcon /> Importar costos
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setEditingRappel("new")}>
                <PlusIcon /> Nuevo acuerdo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ACTIVE FILTERS */}
      {tab === "costos" && hasFilters && (
        <div className="ficha-active-filters" style={{ padding: "0 24px", marginBottom: 8 }}>
          <span className="ficha-filters-label">Filtrando por</span>
          {catFilter && <span className="ficha-pill">Categoría: <strong>{catFilter}</strong><button className="ficha-pill-x" onClick={() => setCatFilter("")}><XIcon /></button></span>}
          {brandFilter && <span className="ficha-pill">Marca: <strong>{brandFilter}</strong><button className="ficha-pill-x" onClick={() => setBrandFilter("")}><XIcon /></button></span>}
          {wineLineFilter && <span className="ficha-pill">Línea: <strong>{wineLineFilter}</strong><button className="ficha-pill-x" onClick={() => setWineLineFilter("")}><XIcon /></button></span>}
          {grapeFilter && <span className="ficha-pill">Cepa: <strong>{grapeFilter}</strong><button className="ficha-pill-x" onClick={() => setGrapeFilter("")}><XIcon /></button></span>}
          {alertsOnly && <span className="ficha-pill">Alertas: <strong>margen &lt; 20%</strong><button className="ficha-pill-x" onClick={() => setAlertsOnly(false)}><XIcon /></button></span>}
          <button className="ficha-clear-all" onClick={() => { setCatFilter(""); setBrandFilter(""); setWineLineFilter(""); setGrapeFilter(""); setAlertsOnly(false); }}>Limpiar todo</button>
        </div>
      )}

      {/* TABLE CONTENT */}
      <main className="content">
        {tab === "costos" ? (
          <section className="table-card">
            <div className="table-card-head">
              <div className="table-card-title">Costos por producto · trimestre vigente</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{sortedProducts.length} productos</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 900 }}>
                <thead style={{ background: "var(--bg)" }}>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={thStyle(72)} onClick={() => handleSort("sku")}>SKU{sortIndicator("sku")}</th>
                    <th style={{ ...thStyle(), minWidth: 200, cursor: "pointer" }} onClick={() => handleSort("nombre")}>Producto{sortIndicator("nombre")}</th>
                    <th style={thStyle(120)}>Categoría</th>
                    <th style={thStyle(110)}>Marca</th>
                    <th style={{ ...thStyle(100), textAlign: "right" }} onClick={() => handleSort("precio")}>P. Neto{sortIndicator("precio")}</th>
                    <th style={{ ...thStyle(110), textAlign: "right" }} onClick={() => handleSort("costo")}>Costo vigente{sortIndicator("costo")}</th>
                    <th style={{ ...thStyle(90), textAlign: "center" }}>Tendencia</th>
                    <th style={{ ...thStyle(130), textAlign: "right" }} onClick={() => handleSort("margen")}>Margen{sortIndicator("margen")}</th>
                    <th style={{ ...thStyle(70), textAlign: "right" }}>Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)" }}>
                      <div style={{ fontSize: 18, fontFamily: "var(--f-display)", color: "var(--text-2)", marginBottom: 6 }}>Sin resultados</div>
                    </td></tr>
                  ) : paged.map((p) => {
                    const varPct = p.variation;
                    return (
                      <tr key={p.id} onClick={() => setSelectedProduct(p)} style={{ borderBottom: "1px solid var(--surface-2)", cursor: "pointer", transition: "background .12s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "14px 14px", fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--text-3)" }}>{p.sku}</td>
                        <td style={{ padding: "14px 14px" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }} title={p.name}>{titleCase(p.name)}</span>
                        </td>
                        <td style={{ padding: "14px 14px" }}>{p.category_name ? <span className="ficha-tag">{titleCase(p.category_name)}</span> : <span className="muted">—</span>}</td>
                        <td style={{ padding: "14px 14px", fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: 13.5, color: "var(--text-2)" }}>{p.brand_name ? titleCase(p.brand_name) : "—"}</td>
                        <td style={{ textAlign: "right", padding: "14px 14px", fontFamily: "var(--f-display)", fontSize: 16, fontWeight: 500 }}>{fmtCLP(p.base_price_net)}</td>
                        <td style={{ textAlign: "right", padding: "14px 14px", fontFamily: "var(--f-display)", fontSize: 15 }}>{p.currentCost != null ? fmtCLP(p.currentCost) : <span className="muted">—</span>}</td>
                        <td style={{ textAlign: "center", padding: "14px 8px" }}><Sparkline values={p.sparkValues} trend={p.trend} /></td>
                        <td style={{ textAlign: "right", padding: "14px 14px" }}>
                          {p.margin != null ? <MarginBar value={p.margin} /> : <span className="muted">—</span>}
                        </td>
                        <td style={{ textAlign: "right", padding: "14px 14px", fontSize: 12, fontWeight: 500 }}>
                          {varPct != null ? (
                            <span style={{ color: varPct > 0.1 ? "var(--danger)" : varPct < -0.1 ? "var(--success)" : "var(--text-3)" }}>
                              {varPct > 0.1 ? `↑ ${varPct.toFixed(1)}%` : varPct < -0.1 ? `↓ ${Math.abs(varPct).toFixed(1)}%` : "—"}
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-card-foot">
              <div className="table-card-info">Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sortedProducts.length)} de {sortedProducts.length} productos</div>
              {totalPages > 1 && (
                <div className="page-btns">
                  <button className={`page-btn ${safePage === 1 ? "pg-disabled" : ""}`} onClick={() => setPage(safePage - 1)}><ChevLeft /></button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((n) => (
                    <button key={n} className={`page-btn ${n === safePage ? "pg-active" : ""}`} onClick={() => setPage(n)}>{n}</button>
                  ))}
                  {totalPages > 7 && <span style={{ color: "var(--text-4)", padding: "0 4px" }}>…</span>}
                  {totalPages > 7 && <button className={`page-btn ${safePage === totalPages ? "pg-active" : ""}`} onClick={() => setPage(totalPages)}>{totalPages}</button>}
                  <button className={`page-btn ${safePage === totalPages ? "pg-disabled" : ""}`} onClick={() => setPage(safePage + 1)}><ChevRight /></button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <RappelTable rappel={rappel} query={query} onEdit={setEditingRappel} />
        )}
      </main>

      {/* MODALS */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          quarters={quarters}
          currentQuarter={currentQuarter}
          logisticCost={logisticCostPerUnit}
          onClose={() => setSelectedProduct(null)}
          onSaved={() => { setSelectedProduct(null); router.refresh(); }}
        />
      )}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); router.refresh(); }} />}
      {showSimpleImport && <SimpleImportDialog currentQuarter={currentQuarter} onClose={() => setShowSimpleImport(false)} onDone={() => { setShowSimpleImport(false); router.refresh(); }} />}
      {showLogistic && <LogisticDialog currentCost={logisticCostPerUnit} onClose={() => setShowLogistic(false)} onDone={() => { setShowLogistic(false); router.refresh(); }} />}
      {editingRappel && <RappelDialog rappel={editingRappel === "new" ? null : editingRappel} chains={chains} onClose={() => setEditingRappel(null)} onSaved={() => { setEditingRappel(null); router.refresh(); }} />}
    </>
  );
}

/* ── Product Detail Modal ──────────────────────────── */

function ProductModal({
  product, quarters, currentQuarter, logisticCost, onClose, onSaved,
}: {
  product: EnrichedProduct;
  quarters: string[];
  currentQuarter: string;
  logisticCost: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [editQuarter, setEditQuarter] = useState(currentQuarter);
  const [newCostVal, setNewCostVal] = useState(String(product.currentCost ?? ""));
  const quarterOptions = useMemo(() => generateQuarterOptions(), []);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  useEffect(() => {
    const costForQ = product.costs[editQuarter];
    setNewCostVal(String(costForQ ?? product.currentCost ?? ""));
  }, [editQuarter, product]);

  const neto = product.base_price_net;
  const newCostNum = Math.round(Number(newCostVal) || 0);
  const newMargin = newCostNum > 0 && (neto + logisticCost) > 0
    ? ((neto + logisticCost - newCostNum) / (neto + logisticCost)) * 100
    : null;
  const marginDelta = newMargin != null && product.margin != null ? newMargin - product.margin : null;
  const marginColor = (m: number) => m >= 40 ? "var(--success)" : m >= 25 ? "var(--text)" : m >= 15 ? "var(--warning-text, #b45309)" : "var(--danger)";

  const sortedQ = quarters.filter((q) => product.costs[q]).sort();
  const costValues = sortedQ.map((q) => product.costs[q]);
  const marginValues = sortedQ.map((q) => {
    const c = product.costs[q];
    return (neto + logisticCost) > 0 ? ((neto + logisticCost - c) / (neto + logisticCost)) * 100 : 0;
  });
  const minMargin = marginValues.length > 0 ? Math.min(...marginValues) : null;
  const maxMargin = marginValues.length > 0 ? Math.max(...marginValues) : null;

  const chartData = {
    labels: sortedQ.map(fmtQuarter),
    datasets: [
      {
        label: "Costo unitario",
        data: costValues,
        borderColor: "#6E1F2A",
        backgroundColor: "rgba(110,31,42,0.08)",
        borderWidth: 2,
        tension: 0.35,
        yAxisID: "y" as const,
        pointBackgroundColor: "#6E1F2A",
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: "Margen %",
        data: marginValues,
        borderColor: "#2C5E3F",
        backgroundColor: "rgba(44,94,63,0.08)",
        borderWidth: 2,
        borderDash: [4, 3],
        tension: 0.35,
        yAxisID: "y1" as const,
        pointBackgroundColor: "#2C5E3F",
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { position: "bottom" as const, labels: { font: { size: 12 }, usePointStyle: true, pointStyle: "circle" as const, padding: 18 } },
    },
    scales: {
      x: { grid: { color: "rgba(231,224,210,0.5)" }, ticks: { font: { size: 11 } } },
      y: {
        type: "linear" as const, position: "left" as const,
        grid: { color: "rgba(231,224,210,0.5)" },
        ticks: { font: { size: 11 }, color: "#6E1F2A", callback: (v: number | string) => "$" + Number(v).toLocaleString("es-CL") },
        title: { display: true, text: "CLP", font: { size: 10 }, color: "#6E1F2A" },
      },
      y1: {
        type: "linear" as const, position: "right" as const,
        grid: { drawOnChartArea: false },
        ticks: { font: { size: 11 }, color: "#2C5E3F", callback: (v: number | string) => Number(v).toFixed(0) + "%" },
        title: { display: true, text: "%", font: { size: 10 }, color: "#2C5E3F" },
      },
    },
  };

  async function handleSave() {
    if (!newCostNum || newCostNum <= 0) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("product_id", product.id);
    fd.set("quarter", editQuarter);
    fd.set("unit_cost_net", String(newCostNum));
    await saveCost(fd);
    setSaving(false);
    onSaved();
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog ficha-dialog" style={{ maxWidth: 920, width: "95vw" }}>
      <div className="ficha-dlg-head">
        <div className="ficha-dlg-eyebrow">
          <div className="ficha-dlg-eyebrow-left">
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-3)" }}>{product.sku}</span>
            <span style={{ margin: "0 8px", color: "var(--text-4)" }}>·</span>
            {product.category_name && <span className="ficha-tag" style={{ marginRight: 8 }}>{titleCase(product.category_name)}</span>}
            {product.brand_name && <span style={{ fontFamily: "var(--f-display)", fontStyle: "italic", color: "var(--text-2)" }}>{titleCase(product.brand_name)}</span>}
          </div>
          <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
        </div>
        <h2 className="ficha-dlg-title">{titleCase(product.name)}</h2>
      </div>

      {/* Summary strip */}
      <div style={{ padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24, borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
        <div>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Precio neto</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 24, fontWeight: 500, marginTop: 6 }}>{fmtCLP(neto)}</div>
          <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: 3 }}>Sin IVA</div>
        </div>
        <div>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Costo vigente</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 24, fontWeight: 500, marginTop: 6 }}>{product.currentCost != null ? fmtCLP(product.currentCost) : "—"}</div>
          <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: 3 }}>{fmtQuarter(currentQuarter)}</div>
        </div>
        <div>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Margen actual</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 24, fontWeight: 500, marginTop: 6, color: product.margin != null ? marginColor(product.margin) : undefined }}>
            {product.margin != null ? `${product.margin.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: 3 }}>
            {minMargin != null && maxMargin != null ? `Rango ${minMargin.toFixed(1)}% — ${maxMargin.toFixed(1)}%` : ""}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500 }}>Variación trimestral</div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 24, fontWeight: 500, marginTop: 6, color: product.variation != null ? (product.variation > 0 ? "var(--danger)" : product.variation < 0 ? "var(--success)" : undefined) : undefined }}>
            {product.variation != null ? `${product.variation > 0 ? "+" : ""}${product.variation.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-3)", marginTop: 3 }}>en costo unitario</div>
        </div>
      </div>

      {/* Chart */}
      {sortedQ.length >= 2 && (
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Evolución histórica</div>
          <div style={{ height: 240, position: "relative" }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* Edit section */}
      <div style={{ padding: "22px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <EditIcon />
          <span style={{ fontFamily: "var(--f-display)", fontSize: 15, fontWeight: 500 }}>Agregar o modificar costo</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 14, alignItems: "end" }}>
          <div className="ficha-field">
            <label className="ficha-label">Periodo</label>
            <select className="ficha-input mono" value={editQuarter} onChange={(e) => setEditQuarter(e.target.value)} style={{ fontFamily: "var(--f-display)", fontSize: 16, fontWeight: 500 }}>
              {quarterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label} ({o.value})</option>
              ))}
            </select>
          </div>
          <div className="ficha-field">
            <label className="ficha-label">Costo unitario (CLP)</label>
            <input className="ficha-input mono" type="number" value={newCostVal} onChange={(e) => setNewCostVal(e.target.value)} style={{ fontFamily: "var(--f-display)", fontSize: 16, fontWeight: 500, textAlign: "right" }} />
          </div>
          <div className="ficha-field">
            <label className="ficha-label">Margen resultante</label>
            <input className="ficha-input" type="text" readOnly value={newMargin != null ? `${newMargin.toFixed(1)}%` : "—"} style={{ fontFamily: "var(--f-display)", fontSize: 16, fontWeight: 600, color: newMargin != null ? marginColor(newMargin) : undefined, background: "var(--bg)" }} />
            {marginDelta != null && Math.abs(marginDelta) > 0.05 && (
              <span style={{ fontSize: 11, color: marginDelta > 0 ? "var(--success)" : "var(--danger)", marginTop: 4, display: "block" }}>
                {marginDelta > 0 ? "↑" : "↓"} {marginDelta > 0 ? "+" : ""}{marginDelta.toFixed(2)} pp vs actual
              </span>
            )}
          </div>
          <button type="button" className="ficha-btn-save" onClick={handleSave} disabled={saving || !newCostNum || newCostNum <= 0} style={{ marginBottom: 2 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {/* History table */}
      <div style={{ padding: "18px 28px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <ClockIcon />
          <span style={{ fontFamily: "var(--f-display)", fontSize: 15, fontWeight: 500 }}>Historial trimestral</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, padding: "8px 10px", textAlign: "left" }}>Trimestre</th>
              <th style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, padding: "8px 10px", textAlign: "right" }}>Costo</th>
              <th style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, padding: "8px 10px", textAlign: "right" }}>Margen</th>
              <th style={{ fontSize: "10.5px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, padding: "8px 10px", textAlign: "right" }}>Variación</th>
            </tr>
          </thead>
          <tbody>
            {sortedQ.map((q, i) => {
              const c = product.costs[q];
              const m = (neto + logisticCost) > 0 ? ((neto + logisticCost - c) / (neto + logisticCost)) * 100 : 0;
              const prev = i > 0 ? product.costs[sortedQ[i - 1]] : null;
              const varC = prev ? ((c - prev) / prev) * 100 : null;
              const isCurrent = q === currentQuarter;
              return (
                <tr key={q} style={{ borderTop: "1px solid var(--surface-2)", background: isCurrent ? "var(--accent-soft)" : undefined }}>
                  <td style={{ padding: "10px", fontSize: 13, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? "var(--accent)" : undefined }}>{fmtQuarter(q)}</td>
                  <td style={{ padding: "10px", fontSize: 13, textAlign: "right", fontFamily: "var(--f-display)", fontWeight: 500 }}>{fmtCLP(c)}</td>
                  <td style={{ padding: "10px", fontSize: 13, textAlign: "right", fontFamily: "var(--f-display)", fontWeight: 500, color: marginColor(m) }}>{m.toFixed(1)}%</td>
                  <td style={{ padding: "10px", fontSize: 13, textAlign: "right" }}>
                    {varC != null ? (
                      <span style={{
                        display: "inline-block", padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: varC > 0.1 ? "var(--danger-soft, #fde8e8)" : varC < -0.1 ? "var(--success-soft)" : "var(--surface-2)",
                        color: varC > 0.1 ? "var(--danger)" : varC < -0.1 ? "var(--success)" : "var(--text-3)",
                      }}>
                        {varC > 0 ? "+" : ""}{varC.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}

/* ── Rappel Table ───────────────────────────────────── */

function RappelTable({ rappel, query, onEdit }: { rappel: RappelRow[]; query: string; onEdit: (r: RappelRow) => void }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rappel;
    return rappel.filter((r) => r.chain_name.toLowerCase().includes(q) || (r.label ?? "").toLowerCase().includes(q));
  }, [rappel, query]);

  const thStyle = (width?: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500,
    textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)", whiteSpace: "nowrap",
    ...extra,
  });

  const cellMono: React.CSSProperties = { textAlign: "right", padding: "12px 12px", verticalAlign: "middle", fontFamily: "var(--f-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums" };

  return (
    <section className="table-card">
      <div className="table-card-head">
        <div className="table-card-title">Acuerdos Rappel por cadena</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 860 }}>
          <thead style={{ background: "var(--bg)" }}>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={thStyle(130)}>Cadena</th>
              <th style={{ ...thStyle(), minWidth: 220 }}>Categoría o producto</th>
              <th style={{ ...thStyle(90), textAlign: "right", fontFamily: "var(--f-mono)" }}>Rapel</th>
              <th style={{ ...thStyle(110), textAlign: "right", fontFamily: "var(--f-mono)" }}>Centralización</th>
              <th style={{ ...thStyle(80), textAlign: "right", fontFamily: "var(--f-mono)" }}>Merma</th>
              <th style={{ ...thStyle(120), textAlign: "right", fontFamily: "var(--f-mono)" }}>Extra-Net (B2B)</th>
              <th style={{ ...thStyle(100), textAlign: "right", fontFamily: "var(--f-mono)" }}>Reposición</th>
              <th style={{ ...thStyle(90), textAlign: "right", fontFamily: "var(--f-mono)" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const total = r.total_pct ?? 0;
              const totalColor = total >= 20 ? "var(--danger)" : total >= 15 ? "var(--warning-text, #b45309)" : "var(--text)";
              return (
                <tr key={r.id} onClick={() => onEdit(r)} style={{ borderBottom: "1px solid var(--surface-2)", cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "12px 12px", verticalAlign: "middle" }}>
                    <span style={{ fontWeight: 600, display: "block" }}>{r.chain_name}</span>
                    {r.client_rut && <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--f-mono)" }}>{r.client_rut}</span>}
                  </td>
                  <td style={{ padding: "12px 12px", verticalAlign: "middle" }}><span style={{ fontSize: 13, color: "var(--text-2)" }}>{r.label ?? "—"}</span></td>
                  <td style={cellMono}>{fmtPct(r.rappel_pct)}</td>
                  <td style={cellMono}>{fmtPct(r.centralizacion_pct)}</td>
                  <td style={cellMono}>{fmtPct(r.merma_pct)}</td>
                  <td style={cellMono}>{r.extra_net_fixed || fmtPct(r.extra_net_pct)}</td>
                  <td style={cellMono}>{fmtPct(r.reposicion_pct)}</td>
                  <td style={{ ...cellMono, fontWeight: 700, color: totalColor }}>{fmtPct(total)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)" }}>
                <div style={{ fontSize: 18, fontFamily: "var(--f-display)", color: "var(--text-2)" }}>Sin acuerdos rappel</div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-card-foot">
        <div className="table-card-info">Mostrando {filtered.length} acuerdos</div>
      </div>
    </section>
  );
}

/* ── Simple Import Dialog (SKU + cost, select quarter) ── */

function SimpleImportDialog({ currentQuarter, onClose, onDone }: { currentQuarter: string; onClose: () => void; onDone: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const quarterOptions = useMemo(() => generateQuarterOptions(), []);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("quarter", selectedQuarter);
    startTransition(async () => {
      const r = await importCostsByQuarter(fd);
      setResult(r);
    });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog ficha-dialog" style={{ maxWidth: 540 }}>
      <form onSubmit={handleSubmit}>
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left"><span className="ficha-dlg-tag">Importar costos</span></div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">Importar por periodo</h2>
          <div className="ficha-dlg-subtitle"><span>Excel con columnas: SKU y Costo Neto. Se asigna al trimestre seleccionado.</span></div>
        </div>
        <div className="ficha-dlg-body">
          {!result ? (
            <>
              <section className="ficha-form-section">
                <div className="ficha-section-head"><span className="ficha-section-num">i.</span><h3 className="ficha-section-title">Periodo a cargar</h3></div>
                <select className="ficha-input" value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)} style={{ maxWidth: 200, fontFamily: "var(--f-mono)" }}>
                  {quarterOptions.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                </select>
              </section>
              <section className="ficha-form-section">
                <div className="ficha-section-head"><span className="ficha-section-num">ii.</span><h3 className="ficha-section-title">Archivo</h3></div>
                <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "32px 20px", textAlign: "center", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
                  <UploadIcon />
                  <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>{fileName || "Seleccionar archivo .xlsx"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Columnas: SKU + Costo Neto</div>
                </div>
                <input ref={fileRef} type="file" name="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} required />
              </section>
            </>
          ) : <ImportResultSection result={result} />}
        </div>
        <div className="ficha-dlg-foot">
          <div />
          <div className="ficha-dlg-foot-right">
            {result ? <button type="button" onClick={onDone} className="ficha-btn-save">Cerrar</button> : (
              <>
                <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
                <button type="submit" disabled={pending || !fileName} className="ficha-btn-save">{pending ? "Importando…" : <><UploadIcon /> Importar</>}</button>
              </>
            )}
          </div>
        </div>
      </form>
    </dialog>
  );
}

/* ── Import Dialog (multi-quarter) ──────────────────── */

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => { setResult(await importCosts(new FormData(e.currentTarget as HTMLFormElement))); });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog ficha-dialog" style={{ maxWidth: 540 }}>
      <form onSubmit={handleSubmit}>
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left"><span className="ficha-dlg-tag">Importación trimestral</span></div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">Importar costos desde Excel</h2>
          <div className="ficha-dlg-subtitle"><span>Columna SKU + columnas por trimestre (Ene-Mar 25, Abr-Jun 25, etc.)</span></div>
        </div>
        <div className="ficha-dlg-body">
          {!result ? (
            <section className="ficha-form-section">
              <div className="ficha-section-head"><span className="ficha-section-num">i.</span><h3 className="ficha-section-title">Archivo</h3></div>
              <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "32px 20px", textAlign: "center", cursor: "pointer" }} onClick={() => fileRef.current?.click()}>
                <UploadIcon />
                <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>{fileName || "Seleccionar archivo .xlsx"}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Headers: SKU + Ene-Mar 25, Abr-Jun 25, etc.</div>
              </div>
              <input ref={fileRef} type="file" name="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} required />
            </section>
          ) : <ImportResultSection result={result} />}
        </div>
        <div className="ficha-dlg-foot">
          <div />
          <div className="ficha-dlg-foot-right">
            {result ? <button type="button" onClick={onDone} className="ficha-btn-save">Cerrar</button> : (
              <>
                <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
                <button type="submit" disabled={pending || !fileName} className="ficha-btn-save">{pending ? "Importando…" : <><UploadIcon /> Importar</>}</button>
              </>
            )}
          </div>
        </div>
      </form>
    </dialog>
  );
}

/* ── Import Result section (shared) ─────────────────── */

function ImportResultSection({ result }: { result: ImportResult }) {
  return (
    <section className="ficha-form-section">
      <div className="ficha-section-head"><span className="ficha-section-num">✓</span><h3 className="ficha-section-title">Resultado</h3></div>
      <div style={{ padding: 16, borderRadius: 8, background: result.ok ? "var(--success-soft)" : "var(--warning-soft)", border: `1px solid ${result.ok ? "var(--success)" : "var(--warning)"}` }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <span>Filas: <strong>{result.totalRows}</strong></span>
          <span style={{ color: "var(--success)" }}>Insertados: <strong>{result.inserted}</strong></span>
          <span style={{ color: "var(--accent)" }}>Actualizados: <strong>{result.updated}</strong></span>
        </div>
        {result.skipped > 0 && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>{result.skipped} omitidos</div>}
      </div>
      {result.unmatchedSkus.length > 0 && (
        <details style={{ marginTop: 12, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--warning)" }}>{result.unmatchedSkus.length} SKUs no encontrados</summary>
          <div style={{ marginTop: 4, padding: 8, background: "var(--surface-2)", borderRadius: 6, maxHeight: 120, overflow: "auto" }}>{result.unmatchedSkus.join(", ")}</div>
        </details>
      )}
      {result.errors.length > 0 && (
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--danger)" }}>{result.errors.length} errores</summary>
          <ul style={{ marginTop: 4, padding: "0 0 0 16px", maxHeight: 120, overflow: "auto" }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

/* ── Logistic Cost Dialog ───────────────────────────── */

function LogisticDialog({ currentCost, onClose, onDone }: { currentCost: number; onClose: () => void; onDone: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(saveLogisticCost, { ok: false, error: null });

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  useEffect(() => { if (state.ok) onDone(); }, [state.ok, onDone]);

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog ficha-dialog" style={{ maxWidth: 420 }}>
      <form action={action}>
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left"><span className="ficha-dlg-tag">Configuración</span></div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">Costo logístico unitario</h2>
          <div className="ficha-dlg-subtitle"><span>Se aplica a todos los productos para cálculo de margen y precio bruto.</span></div>
        </div>
        <div className="ficha-dlg-body">
          {state.error && <div className="field-error" style={{ marginBottom: 16 }}>{state.error}</div>}
          <section className="ficha-form-section">
            <div className="ficha-section-head"><span className="ficha-section-num">i.</span><h3 className="ficha-section-title">Valor por unidad</h3></div>
            <div className="ficha-field" style={{ maxWidth: 200 }}>
              <label className="ficha-label">Costo neto (CLP)</label>
              <input name="cost_net_per_unit" type="number" className="ficha-input mono" defaultValue={currentCost} min={0} style={{ textAlign: "right" }} required />
              <span className="ficha-field-helper">IVA se calcula sobre neto + logístico.</span>
            </div>
          </section>
        </div>
        <div className="ficha-dlg-foot">
          <div />
          <div className="ficha-dlg-foot-right">
            <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ficha-btn-save" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

/* ── Rappel Dialog ──────────────────────────────────── */

function RappelDialog({ rappel, chains, onClose, onSaved }: { rappel: RappelRow | null; chains: ChainOption[]; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extraNetMode, setExtraNetMode] = useState<"pct" | "fixed">(rappel?.extra_net_fixed ? "fixed" : "pct");

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("extra_net_mode", extraNetMode);
    setError(null);
    startTransition(async () => {
      const r = await saveRappel({ ok: true, error: null }, fd);
      if (r.ok) onSaved(); else setError(r.error);
    });
  }

  async function handleDelete() {
    if (!rappel || !confirm("¿Eliminar este acuerdo rappel?")) return;
    const fd = new FormData();
    fd.set("id", rappel.id);
    startTransition(async () => { await deleteRappel(fd); onSaved(); });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog ficha-dialog" style={{ maxWidth: 640 }}>
      <form onSubmit={handleSubmit}>
        {rappel && <input type="hidden" name="id" value={rappel.id} />}
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left"><span className="ficha-dlg-tag">{rappel ? "Editar acuerdo" : "Nuevo acuerdo rappel"}</span></div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">{rappel ? `${rappel.chain_name} — ${rappel.label ?? ""}` : "Nuevo acuerdo rappel"}</h2>
        </div>
        <div className="ficha-dlg-body">
          {error && <div className="field-error" style={{ marginBottom: 16 }}>{error}</div>}
          <section className="ficha-form-section">
            <div className="ficha-section-head"><span className="ficha-section-num">i.</span><h3 className="ficha-section-title">Identificación</h3></div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field">
                <label className="ficha-label">Cadena</label>
                <select className="ficha-input" name="chain_id" defaultValue={rappel?.chain_id ?? ""} required>
                  <option value="">— Seleccionar —</option>
                  {chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Categoría o producto</label>
                <input className="ficha-input" name="label" defaultValue={rappel?.label ?? ""} placeholder="Ej: Vinos, Espumantes y Licores" required />
              </div>
            </div>
          </section>
          <section className="ficha-form-section">
            <div className="ficha-section-head"><span className="ficha-section-num">ii.</span><h3 className="ficha-section-title">Porcentajes</h3></div>
            <div className="ficha-grid cols-3">
              <div className="ficha-field">
                <label className="ficha-label">Rappel %</label>
                <input className="ficha-input mono" name="rappel_pct" type="number" step="0.01" defaultValue={rappel?.rappel_pct ?? 0} style={{ textAlign: "right" }} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Centralización %</label>
                <input className="ficha-input mono" name="centralizacion_pct" type="number" step="0.01" defaultValue={rappel?.centralizacion_pct ?? 0} style={{ textAlign: "right" }} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Merma %</label>
                <input className="ficha-input mono" name="merma_pct" type="number" step="0.01" defaultValue={rappel?.merma_pct ?? 0} style={{ textAlign: "right" }} />
              </div>
            </div>
            <div className="ficha-grid cols-3" style={{ marginTop: 12 }}>
              <div className="ficha-field">
                <label className="ficha-label">Extra-Net</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}><input type="radio" checked={extraNetMode === "pct"} onChange={() => setExtraNetMode("pct")} /> %</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}><input type="radio" checked={extraNetMode === "fixed"} onChange={() => setExtraNetMode("fixed")} /> Monto fijo</label>
                </div>
                {extraNetMode === "pct" ? (
                  <input className="ficha-input mono" name="extra_net_pct" type="number" step="0.01" defaultValue={rappel?.extra_net_pct ?? 0} style={{ textAlign: "right" }} />
                ) : (
                  <input className="ficha-input" name="extra_net_fixed" defaultValue={rappel?.extra_net_fixed ?? ""} placeholder="Ej: 4 UF + IVA Mensual" />
                )}
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Reposición %</label>
                <input className="ficha-input mono" name="reposicion_pct" type="number" step="0.01" defaultValue={rappel?.reposicion_pct ?? 0} style={{ textAlign: "right" }} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Total %</label>
                <input className="ficha-input mono" name="total_pct" type="number" step="0.01" defaultValue={rappel?.total_pct ?? 0} style={{ textAlign: "right", fontWeight: 600 }} />
              </div>
            </div>
          </section>
          <section className="ficha-form-section">
            <div className="ficha-section-head"><span className="ficha-section-num">iii.</span><h3 className="ficha-section-title">Fechas</h3></div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field">
                <label className="ficha-label">Fecha de acuerdo</label>
                <input className="ficha-input" name="fecha_acuerdo" type="date" defaultValue={rappel?.fecha_acuerdo ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Última actualización</label>
                <input className="ficha-input" name="fecha_actualizacion" type="date" defaultValue={rappel?.fecha_actualizacion ?? ""} />
              </div>
            </div>
          </section>
        </div>
        <div className="ficha-dlg-foot">
          <div>{rappel && <button type="button" onClick={handleDelete} disabled={pending} className="ficha-btn-danger">Eliminar</button>}</div>
          <div className="ficha-dlg-foot-right">
            <button type="button" onClick={onClose} className="ficha-btn-cancel">Cancelar</button>
            <button type="submit" disabled={pending} className="ficha-btn-save">{pending ? "Guardando…" : rappel ? "Guardar cambios" : "Crear acuerdo"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
