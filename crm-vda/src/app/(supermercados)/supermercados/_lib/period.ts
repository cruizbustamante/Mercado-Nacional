/**
 * Helpers de período para el módulo Supermercados.
 * Soporta: mes específico (YYYY-MM), YTD (año actual desde enero), y default = mes actual.
 */

export interface Period {
  kind: "month" | "ytd";
  start: string;   // ISO yyyy-mm-dd
  end: string;     // ISO yyyy-mm-dd (inclusive)
  label: string;   // texto humano para UI
  paramValue: string;  // valor para URL ?periodo=...
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function parsePeriod(value: string | undefined): Period {
  const now = new Date();

  if (value === "ytd") {
    return {
      kind: "ytd",
      start: `${now.getFullYear()}-01-01`,
      end: isoDate(new Date(now.getFullYear(), 11, 31)),
      label: `YTD ${now.getFullYear()}`,
      paramValue: "ytd",
    };
  }

  // Mes: YYYY-MM
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  let year: number, month: number;
  if (m) {
    year = parseInt(m[1], 10);
    month = parseInt(m[2], 10);
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const start = isoDate(new Date(year, month - 1, 1));
  const end = isoDate(new Date(year, month, 0));
  const label = `${MONTH_NAMES[month - 1]} ${year}`;

  return {
    kind: "month",
    start, end, label,
    paramValue: `${year}-${String(month).padStart(2, "0")}`,
  };
}

/**
 * Devuelve el período comparativo (mes anterior si kind=month, año anterior YTD si kind=ytd).
 */
export function previousPeriod(p: Period): Period {
  if (p.kind === "ytd") {
    const prevYear = parseInt(p.start.slice(0, 4), 10) - 1;
    return {
      kind: "ytd",
      start: `${prevYear}-01-01`,
      end: `${prevYear}-12-31`,
      label: `YTD ${prevYear}`,
      paramValue: `ytd-${prevYear}`,
    };
  }
  const [y, m] = p.start.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  const py = prev.getFullYear();
  const pm = prev.getMonth() + 1;
  return parsePeriod(`${py}-${String(pm).padStart(2, "0")}`);
}

/**
 * Lista de presets para el period selector: últimos 6 meses + YTD.
 */
export function periodPresets(current: Period): Array<{ label: string; value: string; active: boolean }> {
  const now = new Date();
  const presets: Array<{ label: string; value: string; active: boolean }> = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthShort = MONTH_NAMES[d.getMonth()].slice(0, 3);
    const yearShort = String(d.getFullYear()).slice(-2);
    presets.push({
      label: i === 0 ? `${monthShort} ${yearShort}` : `${monthShort} ${yearShort}`,
      value,
      active: current.kind === "month" && current.paramValue === value,
    });
  }

  presets.push({
    label: `YTD ${now.getFullYear()}`,
    value: "ytd",
    active: current.kind === "ytd",
  });

  return presets;
}
