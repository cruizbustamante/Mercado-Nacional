/**
 * Token compartido entre la server action y la ruta interna /api/facturacion/emitir.
 * Server-only, sin fallback hardcodeado: si no está seteado, el endpoint responde 503.
 */
export function getFacturacionApiToken(): string {
  const token = process.env.FACTURACION_API_TOKEN;
  if (!token) {
    throw new Error("FACTURACION_API_TOKEN no configurado en env vars");
  }
  return token;
}
