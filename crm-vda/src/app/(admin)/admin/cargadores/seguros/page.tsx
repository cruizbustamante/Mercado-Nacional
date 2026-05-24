import { InsuranceUploader } from "./uploader";

export default function SegurosCargadorPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cargador de Seguros</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Carga mensual de la aseguradora. Sube los dos listados (Nominados + Innominados);
          el sistema consolida, valoriza en CLP y actualiza la línea de crédito de cada cliente.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        <h2 className="mb-2 text-sm font-medium text-zinc-900">Lógica aplicada</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Estado se normaliza a <b>ACTIVA</b>, <b>CANCEL</b> o <b>RECHAZ</b>.</li>
          <li>Innominados ACTIVA → <b>200 UF</b> por cliente. Si no está ACTIVA → 0.</li>
          <li>Nominados ACTIVA → <b>Monto Aprobado</b> del archivo. Si no está ACTIVA → 0.</li>
          <li>Si un RUT está en ambos archivos, se conserva el de <b>Nominados</b>.</li>
          <li>Valor UF se obtiene automáticamente de <code>mindicador.cl</code>; puedes sobrescribirlo.</li>
          <li>Se actualiza <code>insurer_credit_line_clp</code> en cada cliente con match por RUT.</li>
          <li>Queda registro auditable en <code>insurance_uploads</code> e <code>insurance_records</code>.</li>
        </ul>
      </section>

      <InsuranceUploader />
    </div>
  );
}
