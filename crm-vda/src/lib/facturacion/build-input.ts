import type { SupabaseClient } from "@supabase/supabase-js";
import type { FacturaInput, FacturaLinea } from "./emitir";

// Código del costo logístico en facturacion.cl → "COSTO LOGISTICO(BOTELLAS)".
const FLETE_SKU = "12311231";

export interface BuiltInput {
  input?: FacturaInput;
  filename?: string;
  nv_number?: string;
  error?: string;
}

/**
 * Construye el FacturaInput para facturacion.cl a partir de una NV de la DB.
 * Reglas validadas:
 *  - Precio unitario = NETO BASE; descuento % si el final fue menor al base.
 *  - El ILA lo agrega solo facturacion.cl (no se ingresa por línea).
 *  - Costo logístico = línea código 12311231, cantidad = total unidades.
 *  - Referencia: Nota de Pedido (802) con el N° de NV.
 *  - Observaciones: condición de pago de la NV + obs del vendedor.
 */
export async function buildFacturaInputFromNv(
  supabase: SupabaseClient,
  nvId: string,
  modo: "preview" | "emitir" = "preview"
): Promise<BuiltInput> {
  const { data: nv, error } = await supabase
    .from("sales_notes")
    .select(
      `id, nv_number, status, requires_vb_financiero, vb_financiero_status, invoice_number,
       delivery_address, observations, total_units, total_logistics, purchase_order_id,
       client:clients(name, rut_body, rut_dv, address, commune, city),
       payment_term:payment_terms(name),
       purchase_order:purchase_orders(order_number, order_date),
       items:sales_note_items(line_number, product_sku, product_name, quantity_units, price_net_base, price_net_final)`
    )
    .eq("id", nvId)
    .single();

  if (error || !nv) return { error: "NV no encontrada" };

  const client = nv.client as unknown as {
    name: string; rut_body: number | null; rut_dv: string | null;
    address: string | null; commune: string | null; city: string | null;
  } | null;
  if (!client?.rut_body || !client?.rut_dv) return { error: "El cliente no tiene RUT válido" };

  const items = (nv.items ?? []) as unknown as Array<{
    line_number: number; product_sku: string; product_name: string;
    quantity_units: number; price_net_base: number; price_net_final: number;
  }>;
  if (!items.length) return { error: "La NV no tiene líneas" };

  const lineas: FacturaLinea[] = items
    .slice()
    .sort((a, b) => a.line_number - b.line_number)
    .map((it) => {
      const base = Math.round(it.price_net_base);
      const final = Math.round(it.price_net_final);
      const descuento_pct = base > 0 && final < base ? Math.round((1 - final / base) * 100) : 0;
      return { sku: it.product_sku, nombre: it.product_name, cantidad_unidades: it.quantity_units, precio_unitario_neto: base, descuento_pct };
    });

  const totalLog = nv.total_logistics ?? 0;
  const totalUnits = nv.total_units ?? 0;
  if (totalLog > 0 && totalUnits > 0) {
    lineas.push({
      sku: FLETE_SKU,
      nombre: "COSTO LOGISTICO",
      cantidad_unidades: totalUnits,
      precio_unitario_neto: Math.round(totalLog / totalUnits),
      descuento_pct: 0,
    });
  }

  const hoy = new Date();
  const ddmmyyyy = `${String(hoy.getDate()).padStart(2, "0")}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${hoy.getFullYear()}`;
  const term = (nv.payment_term as unknown as { name: string } | null)?.name ?? "";

  // Referencia del documento:
  //  - NV de supermercado (tiene OC de origen) → ORDEN DE COMPRA (SII 801) con el
  //    N° y fecha de la OC (ej. factura real: "ORDEN DE COMPRA: Nro. 3350728457 del 28-05-2026").
  //  - NV manual → NOTA DE PEDIDO (802) con el N° de NV.
  const oc = nv.purchase_order as unknown as { order_number: string; order_date: string | null } | null;
  let referencia: FacturaInput["referencia"];
  if (nv.purchase_order_id && oc?.order_number) {
    const ocFecha = oc.order_date
      ? oc.order_date.split("T")[0].split("-").reverse().join("-")  // yyyy-mm-dd → dd-mm-yyyy
      : ddmmyyyy;
    referencia = { tipo: "801", folio: oc.order_number, fecha: ocFecha };
  } else {
    referencia = { tipo: "802", folio: nv.nv_number.replace(/\D/g, "") || nv.nv_number, fecha: ddmmyyyy };
  }

  const input: FacturaInput = {
    rut_receptor: `${client.rut_body}-${client.rut_dv}`,
    razon_social: client.name,
    direccion: nv.delivery_address ?? client.address ?? undefined,
    comuna: client.commune ?? undefined,
    ciudad: client.city ?? undefined,
    forma_pago: "CREDITO",
    observaciones: [term, nv.observations].filter(Boolean).join(" — ") || undefined,
    referencia,
    lineas,
    modo,
  };

  const safe = `PREFACTURA_${nv.nv_number}_${client.name}`.replace(/[\\/:*?"<>|]/g, "").slice(0, 120);
  return { input, filename: `${safe}.pdf`, nv_number: nv.nv_number };
}
