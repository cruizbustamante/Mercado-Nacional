import { ProductsUploader } from "./uploader";
import { TemplateDownload } from "../TemplateDownload";

const PRODUCT_COLS = ["SKU", "Nombre", "Categoría", "Marca", "Un x Caja", "Neto Base", "Bruto Base", "Neto Final", "Costo Neto"];
const PRODUCT_SAMPLE = [
  { SKU: "L 1", Nombre: "Cachaza Velho Barreiro 910ml", "Categoría": "Licor", Marca: "Velho Barreiro", "Un x Caja": 12, "Neto Base": 5000, "Bruto Base": 5950, "Neto Final": 4500, "Costo Neto": 3200 },
  { SKU: "L 115", Nombre: "Espumante Fresita Blueberry 750ml", "Categoría": "Espumante", Marca: "Casal de Gorchs", "Un x Caja": 6, "Neto Base": 3800, "Bruto Base": 4522, "Neto Final": 3400, "Costo Neto": 2500 },
];

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
        <div className="flex items-start justify-between">
          <div>
            <h2 className="mb-2 text-sm font-medium text-zinc-900">Formato esperado</h2>
            <p className="text-sm text-zinc-500">
              Columnas reconocidas (se aceptan variantes):
            </p>
          </div>
          <TemplateDownload columns={PRODUCT_COLS} sampleRows={PRODUCT_SAMPLE} filename="plantilla_productos.xlsx" />
        </div>
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
