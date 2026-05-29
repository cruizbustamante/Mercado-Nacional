// Prueba headful: login → Ventas → abrir submenú "Documentos Electrónicos"
// hasta que aparezcan los botones (Factura, Nota Crédito, ...).
// Uso: node scripts/test-factura.mjs
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEBUG_DIR = path.join(ROOT, "scripts", "debug");
fs.mkdirSync(DEBUG_DIR, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const EMPRESA = env.EMPRESA_FCL, USUARIO = env.USUARIO_FCL, PASSWORD = env.PASSWORD_FCL;

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let PAGE;
const shot = async (name) => { try { await PAGE.screenshot({ path: path.join(DEBUG_DIR, `${name}.png`), fullPage: true }); log("📸", name); } catch {} };

const SUBLABELS = ["Factura", "Nota Crédito", "Nota Débito", "Factura Exenta", "Guía Despacho", "Boleta", "Panel DTE Recibidos"];

// Clic real (hover + click nativo) sobre el primer elemento VISIBLE con ese texto exacto, en cualquier frame.
async function clickByTextVisible(page, label) {
  for (const f of page.frames()) {
    try {
      const ok = await f.evaluate((lbl) => {
        const els = Array.from(document.querySelectorAll("a,td,div,span,li,button"));
        const el = els.find((e) => e.textContent && e.textContent.trim() === lbl && e.offsetParent !== null);
        if (!el) return false;
        el.setAttribute("data-bot-target", "1");
        return true;
      }, label);
      if (!ok) continue;
      const h = await f.$('[data-bot-target="1"]');
      if (h) {
        await h.hover().catch(() => {});
        await sleep(200);
        await h.click().catch(async () => { await f.evaluate(() => document.querySelector('[data-bot-target="1"]')?.click()); });
        await f.evaluate(() => document.querySelector('[data-bot-target="1"]')?.removeAttribute("data-bot-target"));
        return f;
      }
    } catch {}
  }
  return null;
}

async function visibleSub(page) {
  const found = new Set();
  for (const f of page.frames()) {
    try {
      const vis = await f.evaluate((labels) => {
        const out = [];
        document.querySelectorAll("a,td,div,span,button").forEach((e) => {
          const t = e.textContent?.trim();
          if (t && labels.includes(t) && e.offsetParent !== null) out.push(t);
        });
        return out;
      }, SUBLABELS);
      vis.forEach((v) => found.add(v));
    } catch {}
  }
  return [...found];
}

async function dumpMenu(page) {
  for (const f of page.frames()) {
    try {
      const dump = await f.evaluate(() => {
        const out = [];
        document.querySelectorAll("a,td").forEach((e) => {
          const t = e.textContent?.trim();
          if (t === "Documentos Electrónicos" || t === "Factura") {
            out.push({ tag: e.tagName, id: e.id, vis: e.offsetParent !== null, onclick: e.getAttribute("onclick"), href: e.getAttribute("href") });
          }
        });
        return out;
      });
      if (dump.length) log("DUMP", f.url().slice(-45), JSON.stringify(dump));
    } catch {}
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false, defaultViewport: null,
    args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  PAGE = page;
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

  try {
    // ── LOGIN ──
    log("→ login facturacion.cl");
    await page.goto("https://www.facturacion.cl/", { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("#acceso", { timeout: 20000 });
    await page.evaluate(() => { const c = document.getElementById("divCanvas"); if (c) c.style.display = "none"; });
    await page.waitForSelector("#empresa", { timeout: 15000 });
    for (const [sel, val] of [["#empresa", EMPRESA], ["#user", USUARIO], ["#pass", PASSWORD]]) {
      await page.evaluate((s) => { document.querySelector(s).value = ""; }, sel);
      await page.type(sel, val, { delay: 25 });
    }
    await page.click("#trigger");
    await sleep(4000);
    await shot("01_post_login");

    // ── Ventas ──
    log("→ click Ventas");
    await clickByTextVisible(page, "Ventas");
    await sleep(1500);
    await shot("02_ventas");
    log("Sub-botones visibles ANTES de Doc.Electrónicos:", JSON.stringify(await visibleSub(page)));

    // ── Documentos Electrónicos (abrir submenú) ──
    log("→ click 'Documentos Electrónicos'");
    const f = await clickByTextVisible(page, "Documentos Electrónicos");
    log("click Doc.Electrónicos:", f ? "OK" : "NO encontrado");
    await sleep(2000);
    await shot("03_docelectronicos");

    let sub = await visibleSub(page);
    log("Sub-botones visibles DESPUÉS:", JSON.stringify(sub));

    // Reintento si no aparecieron
    if (!sub.includes("Factura")) {
      log("↻ reintento clic Documentos Electrónicos");
      await clickByTextVisible(page, "Documentos Electrónicos");
      await sleep(2000);
      await shot("03b_docelectronicos_retry");
      sub = await visibleSub(page);
      log("Sub-botones tras reintento:", JSON.stringify(sub));
    }

    await dumpMenu(page);

    if (sub.includes("Factura")) log("✅ Aparecieron los botones bajo Documentos Electrónicos.");
    else log("❌ No aparecieron los botones (revisar DUMP).");

    // ── Click en Factura → cargar formulario ──
    log("→ click 'Factura'");
    await clickByTextVisible(page, "Factura");
    await sleep(800);

    async function findFrame(sel, to = 25000) {
      const end = Date.now() + to;
      while (Date.now() < end) {
        for (const fr of page.frames()) { try { if (await fr.$(sel)) return fr; } catch {} }
        await sleep(400);
      }
      return null;
    }
    const formFrame = await findFrame('form[name="formulario"] #rut', 25000);
    log("formulario cargado:", formFrame ? "OK (#rut presente)" : "NO");
    await sleep(1000);
    await shot("04_formulario_factura");

    if (formFrame) {
      // ── Encabezado: RUT + Tab ──
      log("→ RUT 76632368 + Tab");
      await formFrame.evaluate(() => { const el = document.querySelector("#rut"); el.value = ""; el.focus(); });
      await formFrame.type("#rut", "76632368", { delay: 50 });
      await page.keyboard.press("Tab");
      await sleep(4000);

      // re-buscar frame vigente con razón social
      let ff = formFrame;
      for (let i = 0; i < 20; i++) {
        const f = await findFrame("#razonsocial", 1000);
        if (f) { const rs = await f.evaluate(() => document.querySelector("#razonsocial")?.value?.trim() || "").catch(() => ""); if (rs) { ff = f; log("Razón social:", JSON.stringify(rs)); break; } }
        await sleep(500);
      }

      // Valores Unitarios = NETO + Forma de Pago = CRÉDITO (14)
      await ff.evaluate(() => { const s = document.querySelector("#cboneto"); if (s) { s.value = "false"; s.dispatchEvent(new Event("change", { bubbles: true })); } });
      await ff.evaluate(() => { const s = document.querySelector("#idformapago"); if (s) { s.value = "14"; s.dispatchEvent(new Event("change", { bubbles: true })); } });
      const fpText = await ff.evaluate(() => { const s = document.querySelector("#idformapago"); return s ? s.options[s.selectedIndex]?.text : null; });
      log("Forma de pago:", fpText);
      await shot("05_encabezado_lleno");

      // ── Continuar (save_ca_mov) ──
      log("→ Continuar");
      await ff.evaluate(() => { const fn = window.save_ca_mov; if (typeof fn === "function") fn(); else document.querySelector("#continuar")?.click(); });
      await sleep(3500);
      await shot("06_post_continuar");

      // ── Referenciar: Nota de Pedido (802) + Nº Documento ──
      log("→ referenciar Nota de Pedido (802) Nº 011696");
      const secFr = await findFrame("#td_1frame_docref", 8000);
      if (secFr) {
        await secFr.evaluate(() => {
          const img = document.querySelector("#img_frame_docref");
          const cerrado = !img || (img.getAttribute("src") || "").includes("mas");
          if (cerrado) document.querySelector("#td_1frame_docref")?.click();
        });
        await sleep(1500);
      }
      const refFr = await findFrame("#selectreferencia", 10000);
      if (refFr) {
        await refFr.evaluate(() => { const s = document.querySelector("#selectreferencia"); s.value = "802"; s.dispatchEvent(new Event("change", { bubbles: true })); });
        await sleep(800);
        await refFr.evaluate(() => { const e = document.querySelector("#folioref"); e.value = "011696"; e.dispatchEvent(new Event("change", { bubbles: true })); });
        await shot("07_referencia_llena");
        await refFr.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => x.getAttribute("name") === "Ingresar" || x.textContent?.trim() === "Ingresar"); b?.click(); });
        await sleep(2000);
        await shot("08_referencia_ingresada");
        log("✅ referencia ingresada");
      } else { log("❌ no se encontró #selectreferencia"); }

      // ── DETALLE: agregar líneas (precio = NETO BASE) ──
      const LINEAS = [
        { sku: "L 217", cant: 120, precio: 1339, desc: 0 },
        { sku: "L 218", cant: 300, precio: 1339, desc: 0 },
        { sku: "12311231", cant: 420, precio: 360, desc: 0 }, // costo logístico: total unidades × neto/unidad
      ];
      for (const L of LINEAS) {
        log(`→ línea SKU '${L.sku}' x${L.cant} @${L.precio} (desc ${L.desc}%)`);
        const dfr = await findFrame("#p_codigo", 12000);
        if (!dfr) { log("❌ no se encontró #p_codigo"); break; }
        await dfr.evaluate(() => { const e = document.querySelector("#p_codigo"); e.value = ""; e.focus(); });
        await dfr.type("#p_codigo", L.sku, { delay: 45 });
        await page.keyboard.press("Enter");
        await sleep(2200);
        await dfr.evaluate((v) => { const e = document.querySelector("#p_cantidad"); if (e) { e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); } }, String(L.cant));
        await dfr.evaluate((v) => { const e = document.querySelector("#p_unitario"); if (e) { e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); } }, String(L.precio));
        if (L.desc > 0) {
          await dfr.evaluate(() => { const s = document.querySelector("#iv_tipodescto"); if (s) { s.value = "%"; s.dispatchEvent(new Event("change", { bubbles: true })); } });
          await dfr.evaluate((v) => { const e = document.querySelector("#descuento"); if (e) { e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); } }, String(L.desc));
        }
        const desc = await dfr.evaluate(() => document.querySelector("#p_descripcion")?.value || "");
        const codeNow = await dfr.evaluate(() => document.querySelector("#p_codigo")?.value || "");
        log("   código resuelto:", JSON.stringify(codeNow), "· desc:", JSON.stringify(desc));
        await dfr.evaluate(() => document.querySelector("#agregar")?.click());
        await sleep(2200);
      }
      await shot("09_detalle_lineas");

      // ── Observaciones (forma de pago de la NV) ──
      const obsFr = await findFrame('textarea[name="observacion"]', 8000);
      if (obsFr) {
        await obsFr.evaluate(() => { const t = document.querySelector('textarea[name="observacion"]'); if (t) { t.value = "CHEQUE 30 DIAS CONTRA ENTREGA"; t.dispatchEvent(new Event("blur", { bubbles: true })); } });
        log("observaciones puestas");
      }

      // ── Totales actuales (comparar con NV: Neto 713.187 / IVA 135.506 / ILA 115.207 / Total 963.900) ──
      const totFr = await findFrame("#montototal_format", 6000);
      if (totFr) {
        const tot = await totFr.evaluate(() => {
          const g = (id) => document.querySelector(id)?.value || null;
          return { neto: g("#montoneto_format"), iva: g("#montoiva_format"), impAdic: g("#montoimpuesto_format"), exento: g("#montoexento_format"), total: g("#montototal_format") };
        });
        log("TOTALES factura:", JSON.stringify(tot));
      }

      // ── Vista Previa → captura el PDF con el dominio Fetch (etapa Response),
      //    antes de que el visor PDF de Chrome consuma el stream ──
      log("→ Vista Previa");
      const cdp = await page.target().createCDPSession();
      let pdfBuf = null;
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*vistaprevia*", requestStage: "Response" }] });
      cdp.on("Fetch.requestPaused", async (e) => {
        try {
          if (e.request.url.includes("vistaprevia") && e.responseStatusCode === 200 && !pdfBuf) {
            const r = await cdp.send("Fetch.getResponseBody", { requestId: e.requestId });
            const buf = Buffer.from(r.body, r.base64Encoded ? "base64" : "utf8");
            if (buf.slice(0, 4).toString("latin1") === "%PDF") { pdfBuf = buf; log("   PDF capturado (Fetch):", buf.length, "bytes"); }
          }
        } catch (err) { log("   fetch body err:", err.message); }
        try { await cdp.send("Fetch.continueRequest", { requestId: e.requestId }); } catch {}
      });

      const pvFr = await findFrame("#preview", 6000);
      if (pvFr) {
        await pvFr.evaluate(() => { const fn = window.VistaPrevia; if (typeof fn === "function") fn(); else document.querySelector("#preview")?.click(); });
        await sleep(6000);
        await shot("10_vista_previa");

        if (pdfBuf) {
          const downloads = path.join(process.env.USERPROFILE || ".", "Downloads");
          const safe = "PREFACTURA_011696_JOSE LUIS CAMPOS Y ASOCIADOS".replace(/[\\/:*?"<>|]/g, "");
          const dest = path.join(downloads, `${safe}.pdf`);
          fs.writeFileSync(dest, pdfBuf);
          log("📄 PDF guardado:", pdfBuf.length, "bytes →", dest);
        } else {
          log("❌ no se capturó PDF (mimeType pdf no visto)");
        }
      }
    }

    log("Listo (NO se emitió). Cerrando navegador en 10s.");
    await sleep(10000);
  } catch (e) {
    log("❌ ERROR:", e.message);
    await shot("99_error");
    await sleep(5 * 60 * 1000);
  } finally {
    await browser.close();
  }
})();
