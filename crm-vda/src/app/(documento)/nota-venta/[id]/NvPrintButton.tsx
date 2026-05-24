"use client";

export function NvPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        height: 32, padding: "0 14px",
        background: "var(--text)", color: "var(--surface)",
        border: "1px solid var(--text)", borderRadius: "var(--r-sm)",
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
      </svg>
      Imprimir / PDF
    </button>
  );
}
