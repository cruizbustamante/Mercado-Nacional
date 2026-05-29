import puppeteer, { type Browser } from "puppeteer-core";

// Pack oficial de Sparticuz que debe COINCIDIR con la versión de
// @sparticuz/chromium-min instalada y la arquitectura de Vercel (x64).
// Si subes la versión de chromium-min, actualiza esta URL a la misma versión
// (assets en github.com/Sparticuz/chromium/releases).
const CHROMIUM_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

export async function getBrowser(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const executablePath = await chromium.executablePath(CHROMIUM_URL);
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath,
      headless: true,
    });
  }

  // Dev local: usar Chrome instalado en el sistema
  const localPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];

  let executablePath: string | undefined;
  const fs = await import("fs");
  for (const p of localPaths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
    ],
  });
}
