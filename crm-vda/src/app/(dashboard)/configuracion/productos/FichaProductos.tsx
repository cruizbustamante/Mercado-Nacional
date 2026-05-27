"use client";

import { useActionState, useRef, useState, useEffect, useCallback, forwardRef } from "react";
import type { Product, ProductCategory, Brand } from "@/lib/types/database";
import { saveProduct, deleteProduct } from "../actions";
import { importProducts, type ImportResult } from "./actions";
import * as XLSX from "xlsx";

const fmt = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const PAGE_SIZE = 15;

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
);
const ChevronDown = () => (
  <svg className="dd-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
);
const XIcon = ({ size = 12 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const TagIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>
);
const VinylIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
);
const CircleCheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);
const ChevLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
);
const ChevRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
);

interface Props {
  products: Product[];
  categories: ProductCategory[];
  brands: Brand[];
  logisticCostPerUnit: number;
}

/* ── Dropdown filter component ────────────────────── */
function Dropdown({
  label,
  icon,
  value,
  options,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
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
      <button
        type="button"
        className={`ficha-dd-trigger ${value ? "has-value" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span className="dd-label">{icon}<span>{value || label}</span></span>
        <ChevronDown />
      </button>
      <div className="ficha-dd-menu">
        <div className="ficha-dd-search-wrap">
          <SearchIcon />
          <input
            className="ficha-dd-search"
            placeholder={`Buscar ${label.toLowerCase()}…`}
            value={ddQ}
            onChange={(e) => setDdQ(e.target.value)}
          />
        </div>
        <div className="ficha-dd-list">
          <div
            className={`ficha-dd-item dd-all ${!value ? "selected" : ""}`}
            onClick={() => { onSelect(""); setOpen(false); setDdQ(""); }}
          >
            Todas
          </div>
          {filteredOpts.map((o) => (
            <div
              key={o.value}
              className={`ficha-dd-item ${value === o.value ? "selected" : ""}`}
              onClick={() => { onSelect(o.value); setOpen(false); setDdQ(""); }}
            >
              {o.label}
              {o.count != null && <span className="dd-count">{o.count}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────── */

export function FichaProductos({ products, categories, brands, logisticCostPerUnit }: Props) {
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importDialogRef = useRef<HTMLDialogElement>(null);

  const filtered = products.filter((p) => {
    if (statusFilter === "active" && !p.is_active) return false;
    if (statusFilter === "inactive" && p.is_active) return false;
    if (catFilter && p.category?.name !== catFilter) return false;
    if (brandFilter && p.brand?.name !== brandFilter) return false;
    if (!q) return true;
    const lq = q.toLowerCase();
    return (
      p.sku.toLowerCase().includes(lq) ||
      p.name.toLowerCase().includes(lq) ||
      (p.supplier ?? "").toLowerCase().includes(lq) ||
      (p.brand?.name ?? "").toLowerCase().includes(lq)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [q, catFilter, brandFilter, statusFilter]);

  const catCounts = new Map<string, number>();
  for (const p of products) if (p.category?.name) catCounts.set(p.category.name, (catCounts.get(p.category.name) ?? 0) + 1);
  const catOptions = categories.map((c) => ({ value: c.name, label: c.name, count: catCounts.get(c.name) ?? 0 }));

  const brandCounts = new Map<string, number>();
  for (const p of products) if (p.brand?.name) brandCounts.set(p.brand.name, (brandCounts.get(p.brand.name) ?? 0) + 1);
  const brandOptions = brands.map((b) => ({ value: b.name, label: b.name, count: brandCounts.get(b.name) ?? 0 }));

  const activeCount = products.filter((p) => p.is_active).length;
  const inactiveCount = products.length - activeCount;
  const wineCount = products.filter((p) => (p.category?.name ?? "").toLowerCase().includes("vino")).length;
  const avgPrice = products.length > 0 ? Math.round(products.reduce((s, p) => s + p.base_price_net, 0) / products.length) : 0;
  const noSupplier = products.filter((p) => !p.supplier).length;

  const hasFilters = !!(catFilter || brandFilter || statusFilter);

  function exportToExcel() {
    const data = products.map((p) => ({
      SKU: p.sku,
      Nombre: p.name,
      "Categoría": p.category?.name ?? "",
      Marca: p.brand?.name ?? "",
      Proveedor: p.supplier ?? "",
      "Un x Caja": p.units_per_box,
      "Precio Neto Base": p.base_price_net,
      "Precio Bruto Base": p.base_price_gross,
      "Precio Mínimo Neto": p.min_price_net,
      "Costo Neto": p.unit_cost_net ?? "",
      "IVA %": p.iva_rate,
      "ILA %": p.ila_rate,
      "CC Vinos": p.cc_vinos ?? "",
      "Línea Vino": p.wine_line ?? "",
      Cepa: p.grape ?? "",
      Activo: p.is_active ? "Sí" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const colWidths = [
      { wch: 10 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
      { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
      { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
    ];
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `productos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function openModal(p: Product | null) {
    setSelected(p); setIsNew(!p);
    dialogRef.current?.showModal();
  }
  function closeModal() {
    dialogRef.current?.close(); setSelected(null); setIsNew(false);
  }

  const pageNums: number[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNums.push(i);
  } else {
    pageNums.push(1);
    if (safePage > 3) pageNums.push(-1);
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pageNums.push(i);
    if (safePage < totalPages - 2) pageNums.push(-2);
    pageNums.push(totalPages);
  }

  return (
    <div className="ficha-content">
      {/* PAGE HEAD */}
      <header className="ficha-head">
        <div>
          <div className="ficha-eyebrow">Configuración · Catálogo</div>
          <h1 className="ficha-title">Productos</h1>
          <p className="ficha-sub">
            <strong>{activeCount}</strong> referencias activas · {categories.length} categorías, {brands.length} marcas
          </p>
        </div>
        <div className="ficha-actions">
          <button className="btn btn-ghost" onClick={exportToExcel}>
            <DownloadIcon /> Exportar Excel
          </button>
          <button className="btn btn-ghost" onClick={() => importDialogRef.current?.showModal()}>
            <UploadIcon /> Importar Excel
          </button>
          <button className="btn btn-primary" onClick={() => openModal(null)}>
            <PlusIcon /> Nuevo producto
          </button>
        </div>
      </header>

      {/* STATS */}
      <section className="ficha-stats">
        <div className="ficha-stat">
          <div className="ficha-stat-label">Total catálogo</div>
          <div className="ficha-stat-value">{products.length}</div>
          <div className="ficha-stat-meta"><span className="up">Activos: {activeCount}</span></div>
        </div>
        <div className="ficha-stat">
          <div className="ficha-stat-label">Vinos</div>
          <div className="ficha-stat-value">{wineCount}</div>
          <div className="ficha-stat-meta">{products.length > 0 ? ((wineCount / products.length) * 100).toFixed(1) : 0}% del catálogo</div>
        </div>
        <div className="ficha-stat">
          <div className="ficha-stat-label">Precio promedio</div>
          <div className="ficha-stat-value">{fmt(avgPrice)}</div>
          <div className="ficha-stat-meta">neto, sin IVA</div>
        </div>
        <div className="ficha-stat">
          <div className="ficha-stat-label">Sin proveedor</div>
          <div className="ficha-stat-value">{noSupplier}</div>
          <div className="ficha-stat-meta">{noSupplier > 0 ? <span className="down">Requieren atención</span> : <span className="up">Todos asignados</span>}</div>
        </div>
      </section>

      {/* FILTER BAR */}
      <div className="ficha-filter-bar">
        <div className="ficha-search-wrap">
          <SearchIcon />
          <input
            className="ficha-search"
            placeholder="Buscar por SKU, nombre o proveedor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Dropdown label="Categoría" icon={<TagIcon />} value={catFilter} options={catOptions} onSelect={setCatFilter} />
        <Dropdown label="Marca" icon={<VinylIcon />} value={brandFilter} options={brandOptions} onSelect={setBrandFilter} />
        <Dropdown
          label="Estado"
          icon={<CircleCheckIcon />}
          value={statusFilter}
          options={[
            { value: "active", label: "Activos", count: activeCount },
            { value: "inactive", label: "Inactivos", count: inactiveCount },
          ]}
          onSelect={setStatusFilter}
        />
      </div>

      {/* ACTIVE FILTERS */}
      <div className="ficha-active-filters">
        {hasFilters ? (
          <>
            <span className="ficha-filters-label">Filtrando por</span>
            {catFilter && (
              <span className="ficha-pill">Categoría: <strong>{catFilter}</strong>
                <button className="ficha-pill-x" onClick={() => setCatFilter("")}><XIcon /></button>
              </span>
            )}
            {brandFilter && (
              <span className="ficha-pill">Marca: <strong>{brandFilter}</strong>
                <button className="ficha-pill-x" onClick={() => setBrandFilter("")}><XIcon /></button>
              </span>
            )}
            {statusFilter && (
              <span className="ficha-pill">Estado: <strong>{statusFilter === "active" ? "Activos" : "Inactivos"}</strong>
                <button className="ficha-pill-x" onClick={() => setStatusFilter("")}><XIcon /></button>
              </span>
            )}
            <button className="ficha-clear-all" onClick={() => { setCatFilter(""); setBrandFilter(""); setStatusFilter(""); }}>
              Limpiar todo
            </button>
          </>
        ) : (
          <span className="ficha-filters-label">Sin filtros activos</span>
        )}
      </div>

      {/* TABLE */}
      <section className="table-card">
        <div className="table-card-head">
          <div className="table-card-title">Listado de productos</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
          <thead style={{ background: "var(--bg)" }}>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ width: 40, textAlign: "left", padding: "10px 12px", paddingLeft: 16, fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}></th>
              <th style={{ width: 72, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>SKU</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Producto</th>
              <th style={{ width: 130, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Categoría</th>
              <th style={{ width: 130, textAlign: "left", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap" }}>Marca</th>
              <th style={{ width: 80, textAlign: "right", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--f-mono)" }}>Uds/caja</th>
              <th style={{ width: 100, textAlign: "right", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--f-mono)" }}>Precio neto</th>
              <th style={{ width: 90, textAlign: "right", padding: "10px 12px", fontSize: "10.5px", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--f-mono)" }}>Costo</th>
              <th style={{ width: 44, padding: "10px 12px", paddingRight: 16 }}></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 0 }}>
                  <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)" }}>
                    <div style={{ fontSize: 18, fontFamily: "var(--f-display)", color: "var(--text-2)", marginBottom: 6 }}>Sin resultados</div>
                    <div style={{ fontSize: 13 }}>Ningún producto coincide con los filtros actuales.</div>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((p) => (
                <tr key={p.id} onClick={() => openModal(p)} style={{ borderBottom: "1px solid var(--surface-2)", cursor: "pointer" }}>
                  <td style={{ textAlign: "center", padding: "12px 12px", paddingLeft: 16, verticalAlign: "middle" }}>
                    <span className={`status-dot-indicator ${p.is_active ? "active" : "inactive"}`} />
                  </td>
                  <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{p.sku}</span>
                  </td>
                  <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                    <span style={{ fontSize: 13.5, color: "var(--text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block" }} title={p.name}>{titleCase(p.name)}</span>
                  </td>
                  <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                    {p.category ? <span className="ficha-tag">{titleCase(p.category.name)}</span> : <span className="muted">—</span>}
                  </td>
                  <td style={{ padding: "12px 12px", verticalAlign: "middle", overflow: "hidden" }}>
                    <span style={{ fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{p.brand ? titleCase(p.brand.name) : "—"}</span>
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 12px", verticalAlign: "middle", fontFamily: "var(--f-mono)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{p.units_per_box}</td>
                  <td style={{ textAlign: "right", padding: "12px 12px", verticalAlign: "middle", fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 500, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fmt(p.base_price_net)}</td>
                  <td style={{ textAlign: "right", padding: "12px 12px", verticalAlign: "middle", fontFamily: "var(--f-mono)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{p.unit_cost_net != null ? fmt(p.unit_cost_net) : <span className="muted">—</span>}</td>
                  <td style={{ padding: "12px 12px", paddingRight: 16, verticalAlign: "middle" }}>
                    <div className="ficha-row-actions">
                      <button className="ficha-row-action" title="Editar" onClick={(e) => { e.stopPropagation(); openModal(p); }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="table-card-foot">
          <div className="table-card-info">Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} productos</div>
          {totalPages > 1 && (
            <div className="page-btns">
              <button className={`page-btn ${safePage === 1 ? "pg-disabled" : ""}`} onClick={() => setPage(safePage - 1)}><ChevLeft /></button>
              {pageNums.map((n, i) =>
                n < 0 ? (
                  <span key={`e${i}`} style={{ color: "var(--text-4)", padding: "0 4px" }}>…</span>
                ) : (
                  <button key={n} className={`page-btn ${n === safePage ? "pg-active" : ""}`} onClick={() => setPage(n)}>{n}</button>
                )
              )}
              <button className={`page-btn ${safePage === totalPages ? "pg-disabled" : ""}`} onClick={() => setPage(safePage + 1)}><ChevRight /></button>
            </div>
          )}
        </div>
      </section>

      {/* MODAL */}
      <ProductDialog ref={dialogRef} product={selected} isNew={isNew} categories={categories} brands={brands} logisticCostPerUnit={logisticCostPerUnit} onClose={closeModal} />
      <ImportDialog ref={importDialogRef} />
    </div>
  );
}

/* ── Modal component ─────────────────────────────────── */

const ProductDialog = forwardRef<
  HTMLDialogElement,
  { product: Product | null; isNew: boolean; categories: ProductCategory[]; brands: Brand[]; logisticCostPerUnit: number; onClose: () => void }
>(function ProductDialog({ product, isNew, categories, brands, logisticCostPerUnit, onClose }, ref) {
  const [state, action, pending] = useActionState(saveProduct, { ok: false, error: null });
  const [isActive, setIsActive] = useState(product?.is_active ?? true);

  useEffect(() => { setIsActive(product?.is_active ?? true); }, [product]);
  useEffect(() => { if (state.ok) onClose(); }, [state.ok, onClose]);

  const p = product;
  const costoNeto = p?.unit_cost_net ?? null;
  const neto = p?.base_price_net ?? 0;
  const ivaRate = p?.iva_rate ?? 0.19;
  const ilaRate = p?.ila_rate ?? 0;
  const logCost = logisticCostPerUnit;
  const ilaAmt = Math.round(neto * ilaRate);
  const ivaAmt = Math.round((neto + logCost) * ivaRate);
  const bruto = neto + logCost + ivaAmt + ilaAmt;
  const margin = costoNeto != null && (neto + logCost) > 0
    ? ((neto + logCost - costoNeto) / (neto + logCost) * 100).toFixed(1)
    : null;
  const ivaPct = (ivaRate * 100).toFixed(1).replace(/\.0$/, "");
  const ilaPct = (ilaRate * 100).toFixed(1).replace(/\.0$/, "");

  return (
    <dialog ref={ref} className="warm-dialog ficha-dialog" onClose={onClose}>
      <form action={action}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <input type="hidden" name="is_active" value={isActive ? "true" : "false"} />

        {/* HEAD */}
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left">
              <span className="ficha-dlg-tag">Ficha de producto</span>
              {p && <span className="ficha-dlg-sku">{p.sku}</span>}
              {p && <span className={`ficha-dlg-status ${p.is_active ? "active" : "inactive"}`}>{p.is_active ? "Activo" : "Inactivo"}</span>}
            </div>
            <button type="button" className="dlg-close" onClick={onClose}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">{isNew ? "Nuevo Producto" : p?.name ?? ""}</h2>
          {p && (
            <div className="ficha-dlg-subtitle">
              <span>{p.category?.name ?? "Sin categoría"}</span>
              <span className="dot" />
              <span className="brand-italic" style={{ fontSize: 13 }}>{p.brand?.name ?? "Sin marca"}</span>
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="ficha-dlg-body">
          {state.error && <div className="field-error" style={{ marginBottom: 16 }}>{state.error}</div>}

          {/* i. Identificación */}
          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">i.</span>
              <h3 className="ficha-section-title">Identificación</h3>
              <span className="ficha-section-hint">campos obligatorios</span>
            </div>
            <div className="ficha-grid cols-3">
              <div className="ficha-field">
                <label className="ficha-label">SKU</label>
                <input name="sku" className="ficha-input mono" defaultValue={p?.sku ?? ""} required />
              </div>
              <div className="ficha-field span-2">
                <label className="ficha-label">Nombre completo</label>
                <input name="name" className="ficha-input" defaultValue={p?.name ?? ""} required />
              </div>
            </div>
          </section>

          {/* ii. Clasificación */}
          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">ii.</span>
              <h3 className="ficha-section-title">Clasificación</h3>
              <span className="ficha-section-hint">define dónde aparece</span>
            </div>
            <div className="ficha-grid cols-2">
              <div className="ficha-field">
                <label className="ficha-label">Categoría</label>
                <input name="category" className="ficha-input" list="cat-list" defaultValue={p?.category?.name ?? ""} />
                <datalist id="cat-list">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Marca</label>
                <input name="brand" className="ficha-input" list="brand-list" defaultValue={p?.brand?.name ?? ""} />
                <datalist id="brand-list">{brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Proveedor <span className="optional">opcional</span></label>
                <input name="supplier" className="ficha-input" placeholder="Sin asignar" defaultValue={p?.supplier ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Cepa <span className="optional">solo vinos</span></label>
                <input name="grape" className="ficha-input" placeholder="—" defaultValue={p?.grape ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">CC Vinos <span className="optional">opcional</span></label>
                <input name="cc_vinos" className="ficha-input" defaultValue={p?.cc_vinos ?? ""} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Línea vino <span className="optional">opcional</span></label>
                <input name="wine_line" className="ficha-input" defaultValue={p?.wine_line ?? ""} />
              </div>
            </div>
          </section>

          {/* iii. Precios de venta */}
          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">iii.</span>
              <h3 className="ficha-section-title">Precios de venta</h3>
              <span className="ficha-section-hint">valores en CLP</span>
            </div>
            <div className="ficha-grid cols-3">
              <div className="ficha-field">
                <label className="ficha-label">Uds / caja</label>
                <input name="units_per_box" type="number" className="ficha-input mono" style={{ textAlign: "right" }} defaultValue={p?.units_per_box ?? 12} min={1} />
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Precio neto base</label>
                <div className="ficha-input-prefix">
                  <input name="base_price_net" type="number" className="ficha-input" defaultValue={p?.base_price_net ?? 0} />
                </div>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">Precio mínimo neto</label>
                <div className="ficha-input-prefix">
                  <input name="min_price_net" type="number" className="ficha-input" defaultValue={p?.min_price_net ?? 0} />
                </div>
                <span className="ficha-field-helper">Bloquea ventas bajo este valor.</span>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">ILA % <span className="optional">por SKU</span></label>
                <input
                  name="ila_rate"
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  className="ficha-input mono"
                  style={{ textAlign: "right" }}
                  defaultValue={p?.ila_rate ?? 0.205}
                />
                <span className="ficha-field-helper">0.205 vinos · 0.315 licores fuertes · 0.10 cervezas. Aplica s/neto.</span>
              </div>
              <div className="ficha-field">
                <label className="ficha-label">IVA %</label>
                <input
                  name="iva_rate"
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  className="ficha-input mono"
                  style={{ textAlign: "right" }}
                  defaultValue={p?.iva_rate ?? 0.19}
                />
                <span className="ficha-field-helper">0.19 estándar Chile. Aplica s/(neto + log).</span>
              </div>
            </div>
            <input type="hidden" name="base_price_gross" value={p?.base_price_gross ?? 0} />
            <input type="hidden" name="unit_cost_net" value={p?.unit_cost_net ?? ""} />
          </section>

          {/* iv. Desglose unitario */}
          {p && (
            <section className="ficha-form-section">
              <div className="ficha-section-head">
                <span className="ficha-section-num">iv.</span>
                <h3 className="ficha-section-title">Desglose unitario</h3>
                <span className="ficha-section-hint">solo lectura — costos se gestionan en módulo Costos</span>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 16px",
                padding: 16, background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)",
                fontFamily: "var(--f-mono)", fontSize: 13,
              }}>
                <span style={{ color: "var(--text-2)" }}>Precio neto</span>
                <span style={{ textAlign: "right", fontWeight: 500 }}>{fmt(neto)}</span>
                <span style={{ color: "var(--text-2)" }}>Costo logístico</span>
                <span style={{ textAlign: "right" }}>{logCost > 0 ? fmt(logCost) : "—"}</span>
                <span style={{ color: "var(--text-2)" }}>ILA ({ilaPct}%)<span style={{ fontSize: 10, color: "var(--text-4)", marginLeft: 4 }}>s/neto</span></span>
                <span style={{ textAlign: "right" }}>{ilaAmt > 0 ? fmt(ilaAmt) : "—"}</span>
                <span style={{ color: "var(--text-2)" }}>IVA ({ivaPct}%)<span style={{ fontSize: 10, color: "var(--text-4)", marginLeft: 4 }}>s/neto+log</span></span>
                <span style={{ textAlign: "right" }}>{fmt(ivaAmt)}</span>
                <span style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontWeight: 600 }}>Precio bruto</span>
                <span style={{ borderTop: "1px solid var(--border)", paddingTop: 8, textAlign: "right", fontWeight: 600 }}>{fmt(bruto)}</span>
                <span style={{ color: "var(--text-2)", marginTop: 4 }}>Costo unitario neto</span>
                <span style={{ textAlign: "right", marginTop: 4 }}>{costoNeto != null ? fmt(costoNeto) : <span style={{ color: "var(--text-4)" }}>Sin costo</span>}</span>
                <span style={{ color: "var(--text-2)" }}>Margen</span>
                <span style={{ textAlign: "right", fontWeight: 600, color: margin != null ? (Number(margin) >= 25 ? "var(--success)" : Number(margin) >= 15 ? "var(--text)" : "var(--danger)") : "var(--text-4)" }}>
                  {margin != null ? `${margin}%` : "—"}
                </span>
              </div>
            </section>
          )}

          {/* v. Estado */}
          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">{p ? "v." : "iv."}</span>
              <h3 className="ficha-section-title">Estado y visibilidad</h3>
            </div>
            <div className="ficha-switch-card">
              <div className="ficha-switch-info">
                <span className="ficha-switch-title">Producto activo</span>
                <span className="ficha-switch-desc">Visible en notas de venta, canales B2B y reportes de stock.</span>
              </div>
              <div
                className={`ficha-switch ${isActive ? "" : "off"}`}
                onClick={() => setIsActive(!isActive)}
              />
            </div>
          </section>
        </div>

        {/* FOOT */}
        <div className="ficha-dlg-foot">
          {p ? (
            <form action={deleteProduct} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="ficha-btn-danger" onClick={(e) => { if (!confirm("¿Eliminar este producto?")) e.preventDefault(); else onClose(); }}>
                <TrashIcon /> Eliminar producto
              </button>
            </form>
          ) : <div />}
          <div className="ficha-dlg-foot-right">
            <button type="button" className="ficha-btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ficha-btn-save" disabled={pending}>
              {pending ? "Guardando…" : <><CheckIcon /> {isNew ? "Crear producto" : "Guardar cambios"}</>}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
});

/* ── Import Dialog ──────────────────────────────────── */

const ImportDialog = forwardRef<HTMLDialogElement>(function ImportDialog(_props, ref) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function close() {
    (ref as React.RefObject<HTMLDialogElement>).current?.close();
    setResult(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      const res = await importProducts(fd);
      setResult(res);
      if (res.ok && res.errors.length === 0) {
        setTimeout(close, 2000);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog ref={ref} className="warm-dialog ficha-dialog" style={{ maxWidth: 520 }} onClose={close}>
      <form onSubmit={handleSubmit}>
        <div className="ficha-dlg-head">
          <div className="ficha-dlg-eyebrow">
            <div className="ficha-dlg-eyebrow-left">
              <span className="ficha-dlg-tag">Importar productos</span>
            </div>
            <button type="button" className="dlg-close" onClick={close}><XIcon size={18} /></button>
          </div>
          <h2 className="ficha-dlg-title">Importar desde Excel</h2>
          <div className="ficha-dlg-subtitle">
            <span>Columnas obligatorias: SKU, Nombre. Opcionales: Categoría, Marca, Proveedor, Un x Caja, Precio Neto Base, Precio Bruto Base, Precio Mínimo Neto, Costo Neto, IVA %, ILA %, CC Vinos, Línea Vino, Cepa, Activo.</span>
          </div>
        </div>

        <div className="ficha-dlg-body">
          <section className="ficha-form-section">
            <div className="ficha-section-head">
              <span className="ficha-section-num">i.</span>
              <h3 className="ficha-section-title">Archivo</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  border: "2px dashed var(--border)", borderRadius: 8, padding: "32px 20px",
                  textAlign: "center", cursor: "pointer", transition: "border-color 0.15s",
                }}
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon />
                <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)" }}>
                  {fileName || "Haz clic para seleccionar un archivo .xlsx"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                  SKUs existentes se actualizan, nuevos se crean.
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                name="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                required
              />
            </div>
          </section>

          {result && (
            <section className="ficha-form-section" style={{ marginTop: 8 }}>
              <div className="ficha-section-head">
                <span className="ficha-section-num">ii.</span>
                <h3 className="ficha-section-title">Resultado</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                  <span>Filas: <strong>{result.totalRows}</strong></span>
                  <span style={{ color: "var(--success)" }}>Insertados: <strong>{result.inserted}</strong></span>
                  <span style={{ color: "var(--accent)" }}>Actualizados: <strong>{result.updated}</strong></span>
                </div>
                {result.newCategories.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    Categorías creadas: {result.newCategories.join(", ")}
                  </div>
                )}
                {result.newBrands.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    Marcas creadas: {result.newBrands.join(", ")}
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div style={{ maxHeight: 120, overflow: "auto", fontSize: 12, color: "var(--danger)", background: "var(--surface)", borderRadius: 6, padding: 10 }}>
                    {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
                {result.ok && result.errors.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 500 }}>
                    Importación completada sin errores.
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="ficha-dlg-foot">
          <div />
          <div className="ficha-dlg-foot-right">
            <button type="button" className="ficha-btn-cancel" onClick={close}>Cancelar</button>
            <button type="submit" className="ficha-btn-save" disabled={pending || !fileName}>
              {pending ? "Importando…" : <><UploadIcon /> Importar</>}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
});
