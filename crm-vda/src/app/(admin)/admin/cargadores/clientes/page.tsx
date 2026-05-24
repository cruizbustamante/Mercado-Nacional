import { ClientsUploader } from "./uploader";
import { TemplateDownload } from "../TemplateDownload";

const CLIENT_COLS = ["RUT", "Razón Social", "Dirección", "Comuna", "Ciudad", "Email", "Teléfono", "Condición Pago", "Ejecutivo", "Canal", "Línea Crédito"];
const CLIENT_SAMPLE = [
  { RUT: "76.543.210-K", "Razón Social": "Distribuidora Ejemplo SpA", "Dirección": "Av. Principal 1234", Comuna: "Providencia", Ciudad: "Santiago", Email: "contacto@ejemplo.cl", "Teléfono": "+56912345678", "Condición Pago": "30 días", Ejecutivo: "Carlos", Canal: "mayorista", "Línea Crédito": 5000000 },
  { RUT: "77.888.999-1", "Razón Social": "Supermercado Demo Ltda", "Dirección": "Calle Sur 567", Comuna: "Las Condes", Ciudad: "Santiago", Email: "compras@demo.cl", "Teléfono": "+56987654321", "Condición Pago": "60 días", Ejecutivo: "Sebastián", Canal: "supermercado", "Línea Crédito": 10000000 },
];

export default function ClientesCargadorPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cargador de Clientes</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sube un Excel con clientes. Hace upsert por RUT; las condiciones de pago nuevas se
          crean automáticamente.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <h2 className="mb-2 text-sm font-medium text-zinc-900">Formato esperado</h2>
          <TemplateDownload columns={CLIENT_COLS} sampleRows={CLIENT_SAMPLE} filename="plantilla_clientes.xlsx" />
        </div>
        <ul className="mt-2 list-inside list-disc text-sm text-zinc-600">
          <li><b>RUT</b> (obligatorio) — acepta &quot;12.345.678-9&quot;, &quot;123456789&quot; o sin DV</li>
          <li><b>Razón Social / Nombre</b> (obligatorio)</li>
          <li>Dirección, Comuna, Ciudad</li>
          <li>Email, Teléfono</li>
          <li>Condición Pago, Ejecutivo, Canal</li>
          <li>Línea Crédito (CLP, interno — no de aseguradora)</li>
        </ul>
      </section>

      <ClientsUploader />
    </div>
  );
}
