"use client";

import * as XLSX from "xlsx";

export function TemplateDownload({
  columns,
  sampleRows,
  filename,
  label,
}: {
  columns: string[];
  sampleRows?: Record<string, string | number>[];
  filename: string;
  label?: string;
}) {
  function download() {
    const data = sampleRows && sampleRows.length > 0
      ? sampleRows
      : [Object.fromEntries(columns.map((c) => [c, ""]))];
    const ws = XLSX.utils.json_to_sheet(data, { header: columns });
    const colWidths = columns.map((c) => {
      const maxLen = Math.max(c.length, ...data.map((r) => String(r[c] ?? "").length));
      return { wch: Math.min(maxLen + 4, 40) };
    });
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, filename);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      {label ?? "Descargar plantilla .xlsx"}
    </button>
  );
}
