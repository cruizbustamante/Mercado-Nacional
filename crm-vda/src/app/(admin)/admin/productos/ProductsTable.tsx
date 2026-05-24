"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveProduct, deleteProduct } from "./actions";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  units_per_box: number;
  base_price_net: number;
  base_price_gross: number;
  min_price_net: number;
  is_active: boolean;
  category_name: string | null;
  brand_name: string | null;
}

export function ProductsTable({
  initial, categories, brands, stats,
}: {
  initial: ProductRow[];
  categories: string[];
  brands: string[];
  stats: { total: number; cats: number; brands: number; unclassified: number };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);

  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of initial) {
      const k = p.category_name ?? "Sin categoría";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [initial]);

  const filtered = initial.filter((p) => {
    if (categoryFilter && (p.category_name ?? "Sin categoría") !== categoryFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.brand_name ?? "").toLowerCase().includes(q) ||
      (p.category_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <section className="doc-head">
        <div className="doc-head-grid">
          <div>
            <div className="doc-eyebrow">Datos maestros</div>
            <h1 className="doc-title">Productos</h1>
            <p className="doc-sub">Catálogo de SKUs con precios netos, brutos y mínimos.</p>
          </div>
        </div>

        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-key">Total SKUs</div>
            <div className="stat-val">{stats.total}</div>
            <div className="stat-sub">activos en catálogo</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Categorías</div>
            <div className="stat-val">{stats.cats}</div>
            <div className="stat-sub">tipos de producto</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Marcas</div>
            <div className="stat-val">{stats.brands}</div>
            <div className="stat-sub">marcas registradas</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">Sin clasificar</div>
            <div className="stat-val">{stats.unclassified}</div>
            <div className={`stat-sub ${stats.unclassified > 0 ? "warn" : "ok"}`}>
              {stats.unclassified > 0 ? "requieren categoría · marca" : "todos clasificados"}
            </div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search-box">
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>
            <input
              className="search-input"
              placeholder="Busca por SKU, nombre, marca o categoría…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="search-kbd">/</span>
          </div>

          <div className="filter-chips">
            <button type="button" className={`chip ${categoryFilter === null ? "active" : ""}`} onClick={() => setCategoryFilter(null)}>
              Todos <span className="count">{stats.total}</span>
            </button>
            {categoriesWithCount.slice(0, 8).map(([cat, count]) => (
              <button
                key={cat}
                type="button"
                className={`chip ${categoryFilter === cat ? "active" : ""}`}
                onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              >
                {cat} <span className="count">{count}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo producto
            </button>
          </div>
        </div>
      </div>

      <main className="content">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Marca</th>
                <th className="num">U/Cj</th>
                <th className="num">Neto</th>
                <th className="num">Bruto</th>
                <th className="num">Mín</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} onClick={() => setEditing(p)}>
                  <td data-label="SKU">
                    <span className="sku-cell">
                      <span className="sku-letter">{p.sku[0]}</span>
                      <span>{p.sku}</span>
                    </span>
                  </td>
                  <td data-label="Producto">
                    <div className="prod-name">{p.name}</div>
                  </td>
                  <td data-label="Categoría">
                    {p.category_name ? (
                      <span className={`cat-chip ${/vino/i.test(p.category_name) ? "wine" : ""}`}>{p.category_name}</span>
                    ) : <span className="cat-chip empty">sin categoría</span>}
                  </td>
                  <td data-label="Marca">
                    <span className={`brand-cell ${p.brand_name ? "" : "empty"}`}>{p.brand_name ?? "—"}</span>
                  </td>
                  <td className="num" data-label="U/Cj">{p.units_per_box}</td>
                  <td className="num" data-label="Neto"><span className="price price-neto">{fmt.format(p.base_price_net)}</span></td>
                  <td className="num" data-label="Bruto"><span className="price">{fmt.format(p.base_price_gross)}</span></td>
                  <td className="num" data-label="Mín neto"><span className="price price-min">{fmt.format(p.min_price_net)}</span></td>
                  <td data-label="Estado">
                    {!p.is_active ? <span className="badge badge-warn">Inactivo</span> : <span className="badge badge-ok">Activo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <div className="page-info">
            Mostrando <strong>{filtered.length}</strong> de <strong>{stats.total}</strong>
          </div>
        </div>
      </main>

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          categories={categories}
          brands={brands}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function ProductDialog({
  product, categories, brands, onClose, onSaved,
}: {
  product: ProductRow | null;
  categories: string[];
  brands: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    startTransition(async () => {
      const r = await saveProduct({ ok: true, error: null }, fd);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  }

  async function handleDelete() {
    if (!product || !confirm("¿Eliminar este producto? Se puede restaurar después.")) return;
    const fd = new FormData();
    fd.set("id", product.id);
    startTransition(async () => {
      await deleteProduct(fd);
      onSaved();
    });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="warm-dialog">
      <form onSubmit={handleSubmit}>
        {product && <input type="hidden" name="id" value={product.id} />}

        <header className="dlg-head">
          <div className="dlg-head-text">
            <div className="dlg-eyebrow">{product ? "Editando producto" : "Nuevo producto"}</div>
            <div className="dlg-title">{product?.name ?? "Crear producto"}</div>
          </div>
          <button type="button" className="dlg-close" onClick={onClose} aria-label="Cerrar">
            <svg className="i-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div className="dlg-body">
          <section className="dlg-section">
            <div className="dlg-section-title">Identificación</div>
            <div className="grid-3">
              <div className="field">
                <label className="field-label">SKU <span className="req">*</span></label>
                <input className="field-input mono" name="sku" defaultValue={product?.sku} required />
              </div>
              <div className="field col-2">
                <label className="field-label">Nombre / Descripción <span className="req">*</span></label>
                <input className="field-input" name="name" defaultValue={product?.name} required />
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Clasificación</div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Categoría</label>
                <input className="field-input" name="category_name" defaultValue={product?.category_name ?? ""} list="cat-list" placeholder="Vino, Espumante, Vodka…" />
                <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="field">
                <label className="field-label">Marca</label>
                <input className="field-input" name="brand_name" defaultValue={product?.brand_name ?? ""} list="brand-list" />
                <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <div className="dlg-section-title">Empaque y Precios (CLP)</div>
            <div className="grid-4">
              <div className="field">
                <label className="field-label">U / Caja</label>
                <input className="field-input mono" type="number" min={1} name="units_per_box" defaultValue={product?.units_per_box ?? 12} />
              </div>
              <div className="field">
                <label className="field-label">Neto base</label>
                <input className="field-input mono" type="number" name="base_price_net" defaultValue={product?.base_price_net ?? 0} />
              </div>
              <div className="field">
                <label className="field-label">Bruto base</label>
                <input className="field-input mono" type="number" name="base_price_gross" defaultValue={product?.base_price_gross ?? 0} />
              </div>
              <div className="field">
                <label className="field-label">Mín neto</label>
                <input className="field-input mono" type="number" name="min_price_net" defaultValue={product?.min_price_net ?? 0} />
              </div>
            </div>
          </section>

          <section className="dlg-section">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} />
              <span>Activo · aparece en la selección de productos al emitir NV</span>
            </label>
          </section>

          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        <footer className="dlg-foot">
          <div>
            {product && (
              <button type="button" onClick={handleDelete} disabled={pending} className="btn btn-ghost" style={{ color: "var(--danger)", borderColor: "rgba(139,45,31,0.3)" }}>
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
