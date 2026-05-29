import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { buildFacturaInputFromNv } from "@/lib/facturacion/build-input";
import { emitirFactura } from "@/lib/facturacion/emitir";

// Genera la PREFACTURA y la devuelve como PDF inline. Pensado para abrirse en una
// pestaña nueva (window.open) — funciona nativo en móvil (ver/guardar/compartir).
export const runtime = "nodejs";
// 60 = tope de Hobby. Si mercado-nacional pasa a Pro, subir a 180 (como Notifica).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth por sesión (es navegación de nivel superior → la cookie viaja).
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!["admin", "facturador"].includes(profile.role?.name ?? "")) {
    return new NextResponse("Sin permiso para facturar", { status: 403 });
  }

  const nvId = req.nextUrl.searchParams.get("nv");
  if (!nvId) return new NextResponse("Falta parámetro nv", { status: 400 });

  const supabase = await createClient();
  const built = await buildFacturaInputFromNv(supabase, nvId, "preview");
  if (built.error || !built.input) {
    return new NextResponse(built.error ?? "No se pudo construir la factura", { status: 400 });
  }

  const result = await emitirFactura(built.input);
  if (!result.ok || !result.pdf_base64) {
    return new NextResponse(result.error ?? "No se pudo generar la prefactura", { status: 502 });
  }

  const pdf = Buffer.from(result.pdf_base64, "base64");
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // inline para que el navegador la muestre; el nombre se usa al guardar.
      "Content-Disposition": `inline; filename="${(built.filename ?? "prefactura.pdf").replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
