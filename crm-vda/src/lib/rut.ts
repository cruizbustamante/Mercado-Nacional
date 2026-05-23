/**
 * Limpia y normaliza un RUT chileno.
 * Acepta formatos: "12.345.678-9", "12345678-9", "123456789", "12345678".
 * Retorna { body, dv } o null si no parsea.
 */
export function parseRut(raw: string | number | null | undefined): { body: number; dv: string } | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase().replace(/\./g, "").replace(/\s/g, "").replace(/[–—]/g, "-");
  if (!s) return null;

  let bodyStr: string;
  let dv: string;

  if (s.includes("-")) {
    const [b, d] = s.split("-");
    bodyStr = b.replace(/\D/g, "");
    dv = (d || "").slice(0, 1);
  } else {
    const clean = s.replace(/[^0-9K]/g, "");
    if (clean.length < 2) {
      const body = parseInt(clean, 10);
      if (isNaN(body)) return null;
      return { body, dv: calcDv(body) };
    }
    bodyStr = clean.slice(0, -1);
    dv = clean.slice(-1);
  }

  const body = parseInt(bodyStr, 10);
  if (isNaN(body)) return null;
  if (!dv) dv = calcDv(body);
  return { body, dv };
}

/**
 * Calcula dígito verificador chileno con módulo 11.
 */
export function calcDv(rutBody: number): string {
  const seq = [2, 3, 4, 5, 6, 7];
  let total = 0;
  const str = String(rutBody);
  for (let i = 0; i < str.length; i++) {
    total += parseInt(str[str.length - 1 - i], 10) * seq[i % 6];
  }
  const mod = 11 - (total % 11);
  if (mod === 11) return "0";
  if (mod === 10) return "K";
  return String(mod);
}

export function formatRut(body: number, dv: string): string {
  return `${body.toLocaleString("es-CL").replace(/,/g, ".")}-${dv}`;
}
