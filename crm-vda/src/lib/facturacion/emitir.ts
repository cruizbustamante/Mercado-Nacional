import { type Page, type Frame } from "puppeteer-core";
import { getBrowser } from "./browser";

/**
 * Motor de emisión de facturas electrónicas en facturacion.cl (empresa BVDA).
 * Propio de este proyecto (crm-vda). Usa puppeteer-core + @sparticuz/chromium-min
 * para correr en Vercel Functions (sin servidor local).
 *
 * Por defecto trabaja en modo PREVIEW: llena todo el formulario y captura la
 * PREFACTURA (vista previa) — NUNCA emite el DTE mientras no se active "emitir".
 */

const FCL_URL = "https://www.facturacion.cl/";
const FCL_EMPRESA = process.env.EMPRESA_FCL || "";
const FCL_USUARIO = process.env.USUARIO_FCL || "";
const FCL_PASSWORD = process.env.PASSWORD_FCL || "";

export interface FacturaLinea {
  sku: string;
  nombre: string;
  cantidad_unidades: number;
  /** Precio unitario NETO en CLP (entero, ya redondeado). */
  precio_unitario_neto: number;
  /** % de descuento de la línea (ej. 2 = 2%). 0/undefined si no tiene. */
  descuento_pct?: number;
  /** Tasa ILA por SKU (ej. 0.205 vinos). 0 si no aplica. */
  ila_rate?: number;
}

export interface FacturaInput {
  /** "76092970-0" (sin puntos, con guión). */
  rut_receptor: string;
  razon_social: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  forma_pago?: string;
  /** "YYYY-MM-DD" (null = hoy). */
  fecha_emision?: string;
  observaciones?: string;
  /** Referencia opcional (Orden de Compra del cliente, nota de pedido, etc.). */
  referencia?: {
    tipo?: string;   // value del select #selectreferencia (p.ej. Orden de Compra)
    folio: string;   // N° de la OC / documento referenciado
    fecha?: string;  // dd-mm-yyyy
    razon?: string;  // glosa de la referencia
  };
  lineas: FacturaLinea[];
  /** "preview" (default): llena todo y captura la PREFACTURA sin emitir.
   *  "emitir": emite el DTE real (NO usar mientras se prueba). */
  modo?: "preview" | "emitir";
}

export interface FacturaResult {
  ok: boolean;
  folio?: string;
  pdf_base64?: string;
  pdf_size?: number;
  error?: string;
  /** true si el PDF es una PREFACTURA (vista previa, NO emitida). */
  preview?: boolean;
  /** true cuando el DTE se envió a facturacion.cl/SII pero no se capturó el
   *  folio: PROBABLEMENTE quedó emitida. NO reintentar a ciegas. */
  posiblemente_emitida?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── LOGIN (implementado) ───────────────────────── */

async function loginFacturacionCl(page: Page): Promise<boolean> {
  // domcontentloaded es más rápido que networkidle2 en sitios legacy pesados;
  // el waitForSelector("#acceso") garantiza que el form esté listo.
  await page.goto(FCL_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.waitForSelector("#acceso", { timeout: 20000 });

  // El canvas decorativo a veces tapa el form (igual que en el scraper Python).
  await page.evaluate(() => {
    const c = document.getElementById("divCanvas");
    if (c) (c as HTMLElement).style.display = "none";
  });

  await page.waitForSelector("#empresa", { timeout: 15000 });
  await page.waitForSelector("#user", { timeout: 15000 });
  await page.waitForSelector("#pass", { timeout: 15000 });

  for (const [sel, val] of [
    ["#empresa", FCL_EMPRESA],
    ["#user", FCL_USUARIO],
    ["#pass", FCL_PASSWORD],
  ] as const) {
    await page.evaluate((s) => {
      (document.querySelector(s) as HTMLInputElement).value = "";
    }, sel);
    await page.type(sel, val);
  }

  await page.click("#trigger");
  await sleep(1200);

  // Confirmar sesión: el form de login desaparece o aparece el menú.
  const logged = await page
    .waitForFunction(
      () =>
        !document.querySelector("#login") ||
        !!document.querySelector("nav, #menu, #menuPrincipal"),
      { timeout: 25000 }
    )
    .then(() => true)
    .catch(() => false);

  return logged;
}

/* ───────────────────────── helpers de frames ───────────────────────── */

/** Busca en todos los frames el primero que contenga `selector` en el DOM. */
async function findFrame(page: Page, selector: string, timeoutMs = 20000): Promise<Frame | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const fr of page.frames()) {
      try {
        const has = await fr.$(selector);
        if (has) return fr;
      } catch {
        /* frame navegando */
      }
    }
    await sleep(400);
  }
  return null;
}

/**
 * Clic REAL (hover + click nativo) sobre el primer elemento VISIBLE con texto
 * exacto, en cualquier frame. Necesario porque los menús de facturacion.cl solo
 * despliegan el submenú con un click nativo (un `.click()` por JS no lo abre).
 */
async function clickByTextVisible(page: Page, label: string): Promise<Frame | null> {
  for (const fr of page.frames()) {
    try {
      const ok = await fr.evaluate((lbl) => {
        const els = Array.from(document.querySelectorAll("a,td,div,span,li,button"));
        const el = els.find(
          (e) => e.textContent?.trim() === lbl && (e as HTMLElement).offsetParent !== null
        );
        if (!el) return false;
        el.setAttribute("data-bot-target", "1");
        return true;
      }, label);
      if (!ok) continue;
      const h = await fr.$('[data-bot-target="1"]');
      if (h) {
        await h.hover().catch(() => {});
        await sleep(150);
        await h.click().catch(async () => {
          await fr.evaluate(() => (document.querySelector('[data-bot-target="1"]') as HTMLElement | null)?.click());
        });
        await fr.evaluate(() => document.querySelector('[data-bot-target="1"]')?.removeAttribute("data-bot-target"));
        return fr;
      }
    } catch {
      /* frame navegando */
    }
  }
  return null;
}

/** Setea el value de un input (aunque sea readonly) y dispara change/blur. */
async function setVal(fr: Frame, selector: string, value: string): Promise<void> {
  await fr.evaluate((sel, val) => {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    el.removeAttribute("readonly");
    el.removeAttribute("disabled");
    (el as HTMLInputElement).value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }, selector, value);
}

/* ─────────── 1) NAVEGAR: Ventas → Documentos Electrónicos → Factura ─────────── */

async function navegarFormularioEmision(page: Page): Promise<void> {
  // 1) Menú "Ventas".
  await clickByTextVisible(page, "Ventas");
  await sleep(500);

  // 2) "Documentos Electrónicos" → despliega el submenú.
  await clickByTextVisible(page, "Documentos Electrónicos");
  await sleep(700);

  // 3) "Factura" (DTE 33). En headless el submenú no queda "visible", pero el
  //    enlace existe en el DOM con title="Factura Electronica (Tipo 33)" y
  //    href refresca_formulario_Menu('form/venta/venta.php',33,0). Lo clickeamos
  //    por atributo (sin requerir visibilidad), reabriendo el submenú si hace falta.
  let clicked = false;
  for (let i = 0; i < 6 && !clicked; i++) {
    for (const f of page.frames()) {
      try {
        const ok = await f.evaluate(() => {
          const a = Array.from(document.querySelectorAll("a")).find((el) => {
            const oc = (el.getAttribute("onclick") || "") + (el.getAttribute("href") || "");
            return el.getAttribute("title") === "Factura Electronica (Tipo 33)" || oc.includes("venta.php',33,");
          });
          if (a) { (a as HTMLAnchorElement).click(); return true; }
          return false;
        });
        if (ok) { clicked = true; break; }
      } catch {
        /* frame navegando */
      }
    }
    if (!clicked) { await clickByTextVisible(page, "Documentos Electrónicos"); await sleep(700); }
  }
  if (!clicked) throw new Error("No se encontró el enlace 'Factura' (DTE 33) en Documentos Electrónicos");

  // 4) Esperar el formulario (campo R.U.T. del encabezado).
  const formFrame = await findFrame(page, 'form[name="formulario"] #rut', 25000);
  if (!formFrame) {
    throw new Error("No se cargó el formulario de Factura (no apareció el campo R.U.T.)");
  }
}

/* ─────────── 2) LLENAR ENCABEZADO + DETALLE ─────────── */

// Resuelve la condición de pago de la NV → value del select#idformapago.
// Opciones facturacion.cl: 13 EFECTIVO · 3 CONTADO · 8 DEPOSITO/TRANSFERENCIA ·
// 4 CHEQUE AL DIA · 14 CREDITO · 15 CHEQUE · 5 CHEQUE A FECHA · 6 ANTICIPO · 24 Mercado Pago.
function resolveFormaPago(name?: string): string {
  const n = (name || "").toLowerCase();
  if (!n) return "14"; // default CRÉDITO (ventas B2B a plazo)
  if (n.includes("efectivo")) return "13";
  if (n.includes("contado")) return "3";
  if (n.includes("transfer") || n.includes("deposito") || n.includes("depósito")) return "8";
  if (n.includes("cheque") && n.includes("fecha")) return "5";
  if (n.includes("cheque")) return "15";
  if (n.includes("anticipo")) return "6";
  if (n.includes("mercado pago")) return "24";
  return "14"; // "30 días", "60 días", "crédito", etc.
}

async function llenarFormulario(page: Page, input: FacturaInput): Promise<void> {
  let fr = await findFrame(page, 'form[name="formulario"] #rut', 20000);
  if (!fr) throw new Error("Frame del formulario no encontrado");

  // RUT: SOLO el cuerpo (sin puntos ni dígito verificador) y se confirma con Tab,
  // lo que dispara el autocompletado del cliente (el sitio agrega el DV solo).
  const rutBody = input.rut_receptor.replace(/\./g, "").split("-")[0].trim();
  await fr.evaluate(() => {
    const el = document.querySelector("#rut") as HTMLInputElement | null;
    if (el) { el.value = ""; el.focus(); }
  });
  await fr.type("#rut", rutBody);
  await page.keyboard.press("Tab");

  // Esperar autocompletado de la razón social. El frame puede reemplazarse tras
  // navegar, así que re-buscamos el frame vigente con razón social poblada.
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const f = await findFrame(page, "#razonsocial", 600);
    if (f) {
      const rs = await f.evaluate(() => (document.querySelector("#razonsocial") as HTMLInputElement | null)?.value.trim() || "").catch(() => "");
      if (rs) { fr = f; break; }
    }
    await sleep(200);
  }

  // Valores unitarios = NETO (cboneto=false).
  await setVal(fr, "#cboneto", "false");

  // Condición de pago (OBLIGATORIO antes de "Continuar"). Default CRÉDITO.
  await setVal(fr, "#idformapago", resolveFormaPago(input.forma_pago));

  // Fecha documento (dd-mm-yyyy). Hoy si no viene.
  const fecha = input.fecha_emision
    ? input.fecha_emision.split("-").reverse().join("-")
    : "";
  if (fecha) await setVal(fr, "#fecha1", fecha);

  // Destinatarios (email) si el input lo trae (campo readonly).
  // if (input.email) await setVal(fr, "#email", input.email);

  // Continuar → guarda encabezado y habilita la grilla de detalle.
  await fr.evaluate(() => {
    const fn = (window as unknown as { save_ca_mov?: () => void }).save_ca_mov;
    if (typeof fn === "function") fn();
    else (document.querySelector("#continuar") as HTMLButtonElement | null)?.click();
  });
  await sleep(1000);

  // ── REFERENCIA (Nota de Pedido / OC) ──
  await referenciarDocumento(page, input);

  // ── DETALLE (líneas) ──
  await llenarDetalle(page, input);

  // ── OBSERVACIONES (forma de pago de la NV + obs del vendedor) ──
  if (input.observaciones) {
    const obsFr = await findFrame(page, 'textarea[name="observacion"]', 8000);
    if (obsFr) await setVal(obsFr, 'textarea[name="observacion"]', input.observaciones);
  }
}

/**
 * Click en "Vista Previa" (#preview → VistaPrevia()) y captura el PDF de la
 * prefactura. El PDF se renderiza inline en el visor de Chrome, así que NO es
 * accesible por Network.getResponseBody; se intercepta con el dominio `Fetch`
 * en la etapa de respuesta (antes de que el visor consuma el stream).
 */
async function capturarPrefacturaPdf(page: Page): Promise<Buffer | null> {
  const cdp = await page.target().createCDPSession();
  let pdfBuf: Buffer | null = null;

  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*vistaprevia*", requestStage: "Response" }] });
  cdp.on("Fetch.requestPaused", async (e) => {
    try {
      if (e.request.url.includes("vistaprevia") && e.responseStatusCode === 200 && !pdfBuf) {
        const r = await cdp.send("Fetch.getResponseBody", { requestId: e.requestId });
        const buf = Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8");
        if (buf.subarray(0, 4).toString("latin1") === "%PDF") pdfBuf = buf;
      }
    } catch {
      /* ignore */
    }
    try { await cdp.send("Fetch.continueRequest", { requestId: e.requestId }); } catch {}
  });

  const fr = (await findFrame(page, "#preview")) ?? page.mainFrame();
  await fr.evaluate(() => {
    const fn = (window as unknown as { VistaPrevia?: () => void }).VistaPrevia;
    if (typeof fn === "function") fn();
    else (document.querySelector("#preview") as HTMLButtonElement | null)?.click();
  });
  // Esperar a que se capture el PDF (vía Fetch), no un tiempo fijo.
  const deadline = Date.now() + 15000;
  while (!pdfBuf && Date.now() < deadline) await sleep(200);
  await cdp.send("Fetch.disable").catch(() => {});
  return pdfBuf;
}

// Referenciar Documento: abre la sección #td_1frame_docref y, en el iframe
// referencia_documento.php, selecciona el tipo (#selectreferencia, default 802
// NOTA DE PEDIDO), ingresa folio/fecha/razón y pulsa "Ingresar".
async function referenciarDocumento(page: Page, input: FacturaInput): Promise<void> {
  if (!input.referencia) return;

  // Abrir la sección "Referenciar Documento" si está cerrada (FILA_mas = cerrado).
  const secFr = await findFrame(page, "#td_1frame_docref", 8000);
  if (secFr) {
    await secFr.evaluate(() => {
      const img = document.querySelector("#img_frame_docref");
      const cerrado = !img || (img.getAttribute("src") || "").includes("mas");
      if (cerrado) (document.querySelector("#td_1frame_docref") as HTMLElement | null)?.click();
    });
    await sleep(500);
  }

  const fr = await findFrame(page, "#selectreferencia", 10000);
  if (!fr) throw new Error("No se encontró el formulario de referencia (#selectreferencia)");

  // Tipo de referencia (default 802 = NOTA DE PEDIDO).
  const tipo = input.referencia.tipo || "802";
  await fr.evaluate((t) => {
    const s = document.querySelector("#selectreferencia") as HTMLSelectElement | null;
    if (s) { s.value = t; s.dispatchEvent(new Event("change", { bubbles: true })); }
  }, tipo);
  await sleep(300);

  await setVal(fr, "#folioref", input.referencia.folio);
  if (input.referencia.fecha) await setVal(fr, "#fecharef", input.referencia.fecha);
  if (input.referencia.razon) await setVal(fr, "#razonref", input.referencia.razon);

  // Ingresar la referencia.
  await fr.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (x) => x.getAttribute("name") === "Ingresar" || x.textContent?.trim() === "Ingresar"
    );
    (b as HTMLButtonElement | undefined)?.click();
  });
  await sleep(600);
}

// DETALLE: iframe grid_movimiento_ingreso.php (electronica=true). Campos:
//   #p_codigo (SKU) · #p_descripcion · #p_cantidad · #p_unitario ·
//   #iv_tipodescto (%/$) · #descuento · #iv_total · #exento · #agregar (Insertar)
// El ILA se asocia al producto en el MAESTRO de facturacion.cl → se suma solo en
// "Impuesto Adicional" de Totales (no se ingresa por línea). [POR CONFIRMAR]
async function llenarDetalle(page: Page, input: FacturaInput): Promise<void> {
  for (const linea of input.lineas) {
    const fr = await findFrame(page, "#p_codigo", 15000);
    if (!fr) throw new Error("Frame de detalle no encontrado (#p_codigo)");

    // Código (SKU) + Enter → autocompleta descripción y precio desde el maestro.
    await fr.evaluate(() => { const el = document.querySelector("#p_codigo") as HTMLInputElement | null; if (el) { el.value = ""; el.focus(); } });
    await fr.type("#p_codigo", linea.sku);
    await page.keyboard.press("Enter");
    await sleep(900);

    // Cantidad (unidades) y Precio Unitario = NETO BASE (siempre el base).
    await setVal(fr, "#p_cantidad", String(linea.cantidad_unidades));
    await setVal(fr, "#p_unitario", String(Math.round(linea.precio_unitario_neto)));

    // Descuento %: solo si el precio de venta fue menor al base (ej. 2% → "2").
    if (linea.descuento_pct && linea.descuento_pct > 0) {
      await setVal(fr, "#iv_tipodescto", "%");
      await setVal(fr, "#descuento", String(linea.descuento_pct));
    }

    // Insertar la línea en la grilla.
    await fr.evaluate(() => (document.querySelector("#agregar") as HTMLButtonElement | null)?.click());
    await sleep(700);
  }
}

/* ─────────── 3) EMITIR + CAPTURAR FOLIO ─────────── */

async function emitirYCapturarFolio(
  page: Page
): Promise<{ folio: string | null; pdf: Buffer | null; firmado: boolean }> {
  const fr = (await findFrame(page, "#guarda_cot")) ?? page.mainFrame();

  // Botón "Emitir Documento" (#guarda_cot → save_recepcion()).
  await fr.evaluate(() => {
    const fn = (window as unknown as { save_recepcion?: () => void }).save_recepcion;
    if (typeof fn === "function") fn();
    else (document.querySelector("#guarda_cot") as HTMLButtonElement | null)?.click();
  });

  // PENDIENTE: capturar el N° de folio y el PDF de la pantalla de confirmación
  // posterior a "Emitir Documento" (necesito ese DOM / popup).
  return { folio: null, pdf: null, firmado: true };
}

/* ───────────────────────────── ORQUESTACIÓN ───────────────────────────── */

export async function emitirFactura(input: FacturaInput): Promise<FacturaResult> {
  if (!FCL_EMPRESA || !FCL_USUARIO || !FCL_PASSWORD) {
    return { ok: false, error: "Credenciales facturacion.cl no configuradas (EMPRESA_FCL / USUARIO_FCL / PASSWORD_FCL)" };
  }
  if (!input.rut_receptor || !input.lineas?.length) {
    return { ok: false, error: "rut_receptor y al menos una línea son requeridos" };
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    const logged = await loginFacturacionCl(page);
    if (!logged) {
      return { ok: false, error: "No se pudo iniciar sesión en facturacion.cl — verificar credenciales" };
    }

    await navegarFormularioEmision(page);
    await llenarFormulario(page, input);

    // ── MODO PREVIEW (default): captura la prefactura, NUNCA emite ──
    if ((input.modo ?? "preview") === "preview") {
      const pdf = await capturarPrefacturaPdf(page);
      if (!pdf) return { ok: false, error: "No se pudo generar la prefactura (vista previa)" };
      return { ok: true, preview: true, pdf_base64: pdf.toString("base64"), pdf_size: pdf.length };
    }

    // ── MODO EMITIR (DTE real) ──
    const { folio, pdf, firmado } = await emitirYCapturarFolio(page);
    if (!folio) {
      if (firmado) {
        return {
          ok: false,
          posiblemente_emitida: true,
          error:
            "El documento se envió a facturacion.cl pero no se capturó el folio. NO reintente: verifique en el portal si quedó emitido y registre el folio manualmente.",
        };
      }
      return { ok: false, error: "No se pudo emitir la factura en facturacion.cl" };
    }

    const result: FacturaResult = { ok: true, folio };
    if (pdf) {
      result.pdf_base64 = pdf.toString("base64");
      result.pdf_size = pdf.length;
    }
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (browser) await browser.close();
  }
}
