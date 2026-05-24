import { OcFilesUploader } from "./uploader";

export default function OcSupermercadosCargadorPage() {
  return (
    <main className="content content-narrow" style={{ maxWidth: 980 }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)", marginBottom: 6 }}>
          Cargador OC
        </div>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 30, fontWeight: 500, letterSpacing: "-0.022em", margin: 0 }}>
          OC Supermercados — PDF / Word
        </h1>
        <p style={{ marginTop: 6, color: "var(--text-3)", fontSize: 13 }}>
          Sube los archivos originales de las OC. El sistema detecta la cadena, parsea los datos
          y guarda la OC con sus líneas. Si una OC ya existe (mismo N° de orden), no se sobreescribe.
        </p>
      </header>

      <section style={{ marginBottom: 18, padding: 14, background: "var(--surface)", borderRadius: "var(--r)", border: "1px solid var(--border)", fontSize: 13 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-3)", margin: "0 0 8px" }}>
          Cadenas soportadas
        </h2>
        <ul style={{ paddingLeft: 18, color: "var(--text-2)", lineHeight: 1.7 }}>
          <li><b>Cencosud</b> (Santa Isabel, Jumbo), <b>Tottus</b>, <b>Rendic</b>, <b>Alvi</b>, <b>SCPD</b> — parser completo ✓</li>
          <li><b>Walmart</b> (Líder, Acuenta) — detección OK, parser usa la misma lógica genérica.
              Si no extrae bien las líneas, mándame el PDF y lo ajusto.</li>
        </ul>
      </section>

      <OcFilesUploader />
    </main>
  );
}
