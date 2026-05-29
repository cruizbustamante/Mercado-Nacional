import { NextRequest, NextResponse } from "next/server";
import { emitirFactura, type FacturaInput } from "@/lib/facturacion/emitir";
import { getFacturacionApiToken } from "@/lib/facturacion/token";

// Emisión vía puppeteer en facturacion.cl: necesita runtime Node + tiempo largo.
export const runtime = "nodejs";
export const maxDuration = 60; // límite de Vercel Hobby
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let apiToken: string;
    try {
      apiToken = getFacturacionApiToken();
    } catch {
      return NextResponse.json({ ok: false, error: "Servicio no configurado" }, { status: 503 });
    }

    const body = await req.json();
    const { token, input } = body as { token?: string; input?: FacturaInput };

    if (!token || token !== apiToken) {
      return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
    }
    if (!input?.rut_receptor || !input?.lineas?.length) {
      return NextResponse.json(
        { ok: false, error: "input.rut_receptor y input.lineas son requeridos" },
        { status: 400 }
      );
    }

    const result = await emitirFactura(input);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
