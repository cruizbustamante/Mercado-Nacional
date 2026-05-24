import { ProductsUploader } from "./uploader";

export default function ProductosCargadorPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cargador de Productos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sube un Excel con productos. Hace upsert por SKU; las categorías y marcas nuevas
          se crean automáticamente.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-medium text-zinc-900">Formato esperado</h2>
        <p className="text-sm text-zinc-500">
          Columnas reconocidas (se aceptan variantes):
        </p>
        <ul className="mt-2 list-inside list-disc text-sm text-zinc-600">
          <li><b>SKU</b> (obligatorio) — también acepta &quot;Código&quot;, &quot;Cód. Producto&quot;</li>
          <li><b>Nombre / Descripción</b> (obligatorio)</li>
          <li>Categoría, Marca</li>
          <li>Un x Caja (default 12)</li>
          <li>Neto Base, Bruto Base, Neto Final (CLP)</li>
          <li>
            <b>Costo Neto</b> (opcional) — también acepta &quot;Costo&quot;, &quot;Costo Unitario&quot;, &quot;Precio Compra&quot;.
            Usado para calcular margen en análisis comercial.
          </li>
        </ul>
      </section>

      <ProductsUploader />
    </div>
  );
}
