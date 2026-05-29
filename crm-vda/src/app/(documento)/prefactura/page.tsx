"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const WINE = "#501313";

function Viewer() {
  const sp = useSearchParams();
  const nv = sp.get("nv") || "";
  const cliente = sp.get("cliente") || "";
  const nvNum = sp.get("nvnum") || "";

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [elapsed, setElapsed] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("prefactura.pdf");
  const [err, setErr] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !nv) return;
    started.current = true;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    (async () => {
      try {
        const res = await fetch(`/api/facturacion/prefactura?nv=${encodeURIComponent(nv)}`, { credentials: "include" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Error ${res.status}`);
        }
        const cd = res.headers.get("content-disposition") || "";
        const m = cd.match(/filename="?([^"]+)"?/);
        if (m) setFilename(m[1]);
        const blob = await res.blob();
        setPdfUrl(URL.createObjectURL(blob));
        setPhase("ready");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error generando la prefactura");
        setPhase("error");
      } finally {
        clearInterval(timer);
      }
    })();
  }, [nv]);

  if (phase === "ready" && pdfUrl) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#525659" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: WINE, color: "#fff", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Prefactura {nvNum && `NV ${nvNum}`}</span>
          <span style={{ fontSize: 12.5, opacity: 0.85, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliente}</span>
          <a href={pdfUrl} download={filename} style={{ background: "#fff", color: WINE, padding: "8px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>↓ Descargar</a>
          <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ border: "1px solid rgba(255,255,255,0.6)", color: "#fff", padding: "8px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Abrir ↗</a>
        </div>
        <iframe src={pdfUrl} title="Prefactura" style={{ flex: 1, border: "none", width: "100%" }} />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF8F3", padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#8B2D1F", margin: "0 0 8px" }}>No se pudo generar la prefactura</h1>
          <p style={{ fontSize: 13.5, color: "#5F5E5A", lineHeight: 1.5, marginBottom: 18 }}>{err}</p>
          <button onClick={() => window.location.reload()} style={{ background: WINE, color: "#fff", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Reintentar</button>
        </div>
      </div>
    );
  }

  // loading
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF8F3", padding: 24 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
      <div style={{ textAlign: "center", fontFamily: "system-ui, sans-serif", maxWidth: 420 }}>
        <div style={{ width: 54, height: 54, margin: "0 auto 22px", border: `4px solid ${WINE}22`, borderTopColor: WINE, borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
        <h1 style={{ fontSize: 19, fontWeight: 700, color: "#1A1A1A", margin: "0 0 6px" }}>Generando prefactura…</h1>
        {(nvNum || cliente) && (
          <p style={{ fontSize: 13.5, color: "#5F5E5A", margin: "0 0 4px" }}>{nvNum && <strong>NV {nvNum}</strong>}{nvNum && cliente ? " · " : ""}{cliente}</p>
        )}
        <p style={{ fontSize: 12.5, color: "#9B9B96", margin: "10px 0 0", animation: "pulse 1.6s ease-in-out infinite" }}>
          Conectando con facturacion.cl y armando el documento…
        </p>
        <p style={{ fontSize: 12.5, color: "#9B9B96", margin: "14px 0 0", fontVariantNumeric: "tabular-nums" }}>
          {elapsed}s · suele tardar ~30–40s
        </p>
      </div>
    </div>
  );
}

export default function PrefacturaPage() {
  return (
    <Suspense fallback={null}>
      <Viewer />
    </Suspense>
  );
}
