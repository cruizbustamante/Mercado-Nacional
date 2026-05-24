"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveUpcMapping, deleteUpcMapping, importUpcMapping, type UpcImportResult } from "./actions";

export interface UpcRow {
  id: string;
  upc: string;
  product_id: string | null;
  product_name_oc: string | null;
  category_name: string | null;
  brand_name: string | null;
  notes: string | null;
  product_sku: string | null;
  product_name: string | null;
}

export interface ProductOption { id: string; sku: string; name: string }

export function UpcMappingTable({
  initial, products, stats,
}: {
  initial: UpcRow[];
  products: ProductOption[];
  stats: { total: number; matched: number; unmatched: number };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [editing, setEditing] = useState<UpcRow | "new" | null>(null);
  const [importing, startImport] = useTransition();
  const [importResult, setImportResult] = useState<UpcImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => initial.filter((r) => {
    if (filter === "matched" && !r.product_id) return false;
    if (filter === "unmatched" && r.product_id) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.upc.includes(q) ||
      (r.product_sku ?? "").toLowerCase().includes(q) ||
      (r.product_name ?? "").toLowerCase().includes(q) ||
      (r.product_name_oc ?? "").toLowerCase().includes(q) ||
      (r.brand_name ?? "").toLowerCase().includes(q)
    );
  }), [initial, filter, query]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setImportResult(null);
    startImport(async () => {
      const r = await importUpcMapping(fd);
      setImportResult(r);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <>
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Configuración Supermercados</div>
            <h1 className="doc-title">Mapeo UPC ↔ SKU</h1>
            <p className="doc-sub">
              Las OC de supermercados vienen con código de barras (DUN/EAN), no con SKU.
              Este mapeo permite hacer match automático al cargar OC.
            </p>
          </div>
        </div>

        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-key">Total variantes</div>
            <div className="stat-val">{stats.total}</div>
            <div className="stat-sub">códigos en DB</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Mapeados a SKU</div>
            <div className="stat-val">{stats.matched}</div>
            <div className="stat-sub ok">vinculados a productos</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Sin SKU</div>
            <div className="stat-val">{stats.unmatched}</div>
            <div className={`stat-sub ${stats.unmatched > 0 ? "warn" : "ok"}`}>
              {stats.unmatched > 0 ? "requieren mapeo" : "todo mapeado"}
            </div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">% cobertura</div>
            <div className="stat-val">{stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0}%</div>
            <div className="stat-sub">SKU/total variantes</div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-box">
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
            <input className="search-input" placeholder="Buscar por UPC, SKU, producto o marca…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="filter-chips">
            <button type="button" className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
              Todos <span className="count">{stats.total}</span>
            </button>
            <button type="button" className={`chip ${filter === "matched" ? "active" : ""}`} onClick={() => setFilter("matched")}>
              Mapeados <span className="count">{stats.matched}</span>
            </button>
            <button type="button" className={`chip ${filter === "unmatched" ? "active" : ""}`} onClick={() => setFilter("unmatched")}>
              Sin SKU <span className="count">{stats.unmatched}</span>
            </button>
          </div>

          <div className="toolbar-actions">
            <label className="btn btn-excel" style={{ cursor: importing ? "wait" : "pointer" }}>
              <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              {importing ? "Importando…" : "Importar Excel"}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={onPickFile} disabled={importing} />
            </label>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo mapeo
            </button>
          </div>
        </div>
      </div>

      <main className="content">
        {importResult && (
          <div style={{
            marginBottom: 16, padding: 14, borderRadius: "var(--r)",
            background: importResult.ok ? "var(--success-soft)" : "var(--warning-soft)",
            color: importResult.ok ? "var(--success)" : "var(--warning)",
            border: `1px solid ${importResult.ok ? "rgba(45,95,63,0.18)" : "rgba(156,106,30,0.18)"}`,
            fontSize: 13,
          }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{importResult.ok ? "Importación completada" : "Importación con observaciones"}</div>
            <div style={{ fontSize: 12, fontFamily: "var(--f-mono)" }}>
              {importResult.totalRows} filas · {importResult.variantsGenerated} variantes generadas · {importResult.inserted} guardadas · {importResult.productsMatched} con SKU
            </div>
            {importResult.productsMissing.length > 0 && (
              <details style={{ marginTop: 8, fontSize: 12 }}>
                <summary style={{ cursor: "pointer" }}>SKUs del Excel no encontrados en productos ({importResult.productsMissing.length})</summary>
                <div style={{ marginTop: 6, fontFamily: "var(--f-mono)", fontSize: 11, maxHeight: 160, overflowY: "auto" }}>
                  {importResult.productsMissing.join(", ")}
                </div>
              </details>
            )}
            {importResult.errors.length > 0 && (
              <details style={{ marginTop: 8, fontSize: 12 }}>
                <summary style={{ cursor: "pointer" }}>Errores ({importResult.errors.length})</summary>
                <ul style={{ marginTop: 6, fontFamily: "var(--f-mono)", fontSize: 11 }}>
                  {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>UPC</th>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Marca</th>
                <th>Nombre en OC</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r) => (
                <tr key={r.id} onClick={() => setEditing(r)}>
                  <td><span className="sku-cell mono">{r.upc}</span></td>
                  <td><span className="sku-cell">{r.product_sku ?? <span className="badge badge-warn">sin SKU</span>}</span></td>
                  <td>
                    {r.product_name ? <div className="prod-name">{r.product_name}</div>
                      : <span style={{ color: "var(--text-4)", fontStyle: "italic" }}>—</span>}
                  </td>
                  <td>{r.category_name ? <span className="cat-chip">{r.category_name}</span> : "—"}</td>
                  <td><span className="brand-cell">{r.brand_name ?? "—"}</span></td>
                  <td><span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{r.product_name_oc ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <div className="page-info">
            Mostrando <strong>{Math.min(filtered.length, 500)}</strong> de <strong>{filtered.length}</strong>{filtered.length > 500 ? " (limit 500)" : ""}
          </div>
        </div>
      </main>

      {editing && (
        <UpcDialog
          row={editing === "new" ? null : editing}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function UpcDialog({
  row, products, onClose, onSaved,
}: {
  row: UpcRow | null;
  products: ProductOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState<string>(row?.product_id ?? "");

  useEffect(() => {
    dialogRef.current?.showModal();
    const dlg = dialogRef.current;
    const onCancel = () => onClose();
    dlg?.addEventListener("cancel", onCancel);
    return () => dlg?.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 15);
  }, [productSearch, products]);

  const selectedProduct = products.find((p) => p.id === productId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("product_id", productId);
    setError(null);
    startTransition(async () => {
      const r = await saveUpcMapping({ ok: true, error: null }, fd);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  }

  async function handleDelete() {
    if (!row || !confirm("¿Eliminar este mapeo UPC?")) return;
    const fd = new FormData();
    fd.set("id", row.id);
    startTransition(async () => {
      await deleteUpcMapping(fd);
      onSaved();
    });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog">
      <form onSubmit={handleSubmit}>
        {row && <input type="hidden" name="id" value={row.id} />}

        <header className="dlg-head">
          <div className="dlg-head-text">
            <div className="dlg-eyebrow">{row ? "Editar mapeo" : "Nuevo mapeo UPC"}</div>
            <div className="dlg-title">{row?.upc ?? "Asignar UPC a SKU"}</div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose}>
            <svg className="i-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div className="dlg-body">
          <section className="dlg-section">
            <div className="dlg-section-title">Código</div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">UPC / EAN / DUN <span className="req">*</span></label>
                <input className="field-input mono" name="upc" defaultValue={row?.upc ?? ""} required placeholder="Solo dígitos" />
                <div className="field-hint">Para nuevos: si el código tiene 12 o 13 dígitos, las variantes se generan automáticamente al importar Excel. Aquí se guarda una sola.</div>
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Producto interno</div>
            <div className="field">
              <label className="field-label">Buscar SKU o nombre</label>
              <input
                className="field-input"
                placeholder={`Busca entre ${products.length} productos…`}
                value={selectedProduct ? `${selectedProduct.sku} · ${selectedProduct.name}` : productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setProductId(""); }}
              />
              {!selectedProduct && productSearch && productMatches.length > 0 && (
                <ul style={{
                  marginTop: 4, maxHeight: 200, overflowY: "auto",
                  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                  listStyle: "none", padding: 0,
                  background: "var(--surface)",
                }}>
                  {productMatches.map((p) => (
                    <li key={p.id} onClick={() => { setProductId(p.id); setProductSearch(""); }}
                      style={{ padding: "8px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)" }}>{p.sku}</div>
                    </li>
                  ))}
                </ul>
              )}
              {selectedProduct && (
                <button type="button" onClick={() => { setProductId(""); setProductSearch(""); }}
                  style={{ marginTop: 6, fontSize: 11, color: "var(--text-3)", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                  × Quitar producto
                </button>
              )}
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Metadatos OC (opcional)</div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Categoría</label>
                <input className="field-input" name="category_name" defaultValue={row?.category_name ?? ""} />
              </div>
              <div className="field">
                <label className="field-label">Marca</label>
                <input className="field-input" name="brand_name" defaultValue={row?.brand_name ?? ""} />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label className="field-label">Nombre como aparece en la OC</label>
                <input className="field-input" name="product_name_oc" defaultValue={row?.product_name_oc ?? ""} placeholder="ej. WHISKY FAMOUS GROUSE 375CC" />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label className="field-label">Notas internas</label>
                <input className="field-input" name="notes" defaultValue={row?.notes ?? ""} />
              </div>
            </div>
          </section>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <footer className="dlg-foot">
          <div>
            {row && (
              <button type="button" onClick={handleDelete} disabled={pending} className="btn btn-ghost" style={{ color: "var(--danger)", borderColor: "rgba(139,45,31,0.3)" }}>
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Guardando…" : row ? "Guardar" : "Crear mapeo"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
