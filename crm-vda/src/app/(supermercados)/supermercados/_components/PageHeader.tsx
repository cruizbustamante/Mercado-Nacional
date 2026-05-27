import Link from "next/link";

interface Props {
  title: string;
  subtitle: string;
  prevMesParam: string;
  nextMesParam: string;
  monthLabel: string;
  showCargarOc?: boolean;
  showExport?: boolean;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function PageHeader({
  title,
  subtitle,
  prevMesParam,
  nextMesParam,
  monthLabel,
  showCargarOc = true,
  showExport = false,
}: Props) {
  // Determinar la ruta base actual desde la URL para construir links de mes correctos.
  // Por simplicidad: el caller pasa los params; el componente solo arma el query.
  const buildHref = (mes: string) => `?mes=${mes}`;

  return (
    <div className="flex justify-between items-start pb-5 border-b border-line">
      <div>
        <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3 font-medium mb-1.5">
          BVDA · Mercado Nacional · Supermercados
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-xs text-ink-2 mt-1">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        <div className="inline-flex bg-bg-surface border border-line rounded-md text-xs">
          <Link
            href={buildHref(prevMesParam)}
            className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-l-md border-r border-line"
            prefetch
          >
            ‹
          </Link>
          <button type="button" className="px-3 py-1.5 bg-ink text-white font-medium tabular" disabled>
            {capitalize(monthLabel)}
          </button>
          <Link
            href={buildHref(nextMesParam)}
            className="px-2.5 py-1.5 text-ink-2 hover:bg-bg-muted rounded-r-md border-l border-line"
            prefetch
          >
            ›
          </Link>
        </div>
        {showExport && (
          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-line rounded-md bg-bg-surface hover:bg-bg-muted text-ink-2 inline-flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Exportar
          </button>
        )}
        {showCargarOc && (
          <Link
            href="/admin/cargadores/oc-supermercados"
            className="text-xs px-3 py-1.5 rounded-md bg-wine text-white hover:bg-wine-2 inline-flex items-center gap-1.5 font-medium"
            prefetch
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Cargar OC
          </Link>
        )}
      </div>
    </div>
  );
}
