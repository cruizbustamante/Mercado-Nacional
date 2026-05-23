import { ClientsUploader } from "./uploader";

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
        <h2 className="mb-2 text-sm font-medium text-zinc-900">Formato esperado</h2>
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
