"use client";

import { useState, useMemo } from "react";
import { InsuranceUploader } from "@/app/(admin)/admin/cargadores/seguros/uploader";

export interface FinClient {
  id: string;
  rut_body: number;
  rut_dv: string;
  name: string;
  credit_line_clp: number;
  insurer_name: string | null;
  insurer_credit_line_clp: number;
  insurer_status: string | null;
  insurer_credit_updated_at: string | null;
  payment_term: { name: string } | null;
}

export interface FinUpload {
  id: string;
  file_date: string;
  uf_value: number;
  total_records: number;
  total_active: number;
  total_uf: number;
  total_clp: number;
  matched_clients: number;
  notes: string | null;
  created_at: string;
}

interface Props {
  clients: FinClient[];
  uploads: FinUpload[];
  stats: { total: number; conSeguro: number; activos: number; totalLinea: number };
  isAdmin: boolean;
}

const fmtClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmtUf = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

type Tab = "credito" | "historial" | "cargar";

const STATUS_BADGE: Record<string, string> = {
  ACTIVA: "badge-ok",
  CANCEL: "badge-warn",
  RECHAZ: "badge-danger",
};

export function FinanzasModule({ clients, uploads, stats, isAdmin }: Props) {
  const [tab, setTab] = useState<Tab>("credito");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { ACTIVA: 0, CANCEL: 0, RECHAZ: 0, SIN: 0 };
    for (const c of clients) {
      if (!c.insurer_status || c.insurer_credit_line_clp === 0) m.SIN++;
      else m[c.insurer_status] = (m[c.insurer_status] ?? 0) + 1;
    }
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter === "SIN") {
      list = list.filter((c) => !c.insurer_status || c.insurer_credit_line_clp === 0);
    } else if (statusFilter !== "all") {
      list = list.filter((c) => c.insurer_status === statusFilter && c.insurer_credit_line_clp > 0);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.rut_body).includes(q)
      );
    }
    return list;
  }, [clients, statusFilter, search]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "credito", label: "Línea de Crédito" },
    { key: "historial", label: "Historial Cargas" },
    ...(isAdmin ? [{ key: "cargar" as Tab, label: "Cargar Seguro" }] : []),
  ];

  return (
    <>
      {/* Header */}
      <section className="block">
        <div className="block-head">
          <div className="block-title">
            <span className="block-title-text">Control Financiero</span>
            <span className="block-sub">Gestión de crédito y seguros</span>
          </div>
        </div>

        {/* KPIs */}
        <div className="fin-kpi-grid">
          <div className="fin-kpi">
            <div className="fin-kpi-label">Clientes Totales</div>
            <div className="fin-kpi-val">{stats.total}</div>
          </div>
          <div className="fin-kpi">
            <div className="fin-kpi-label">Con Seguro Activo</div>
            <div className="fin-kpi-val" style={{ color: "var(--success)" }}>{stats.activos}</div>
            <div className="fin-kpi-sub">{stats.conSeguro} con línea &gt; 0</div>
          </div>
          <div className="fin-kpi">
            <div className="fin-kpi-label">Línea Total CLP</div>
            <div className="fin-kpi-val">{fmtClp.format(stats.totalLinea)}</div>
          </div>
          <div className="fin-kpi">
            <div className="fin-kpi-label">Última Carga</div>
            <div className="fin-kpi-val" style={{ fontSize: 16 }}>
              {uploads.length > 0 ? uploads[0].file_date : "—"}
            </div>
            {uploads.length > 0 && (
              <div className="fin-kpi-sub">UF {fmtUf.format(uploads[0].uf_value)}</div>
            )}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="fin-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`fin-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "credito" && (
        <CreditTab
          clients={filtered}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusCounts={statusCounts}
          total={clients.length}
        />
      )}
      {tab === "historial" && <HistorialTab uploads={uploads} />}
      {tab === "cargar" && (
        <section className="block" style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
              Sube los dos listados de la aseguradora (Nominados + Innominados).
              El sistema consolida por RUT, valoriza en CLP con la UF del día y actualiza la línea de crédito de cada cliente.
            </p>
          </div>
          <InsuranceUploader />
        </section>
      )}
    </>
  );
}

function CreditTab({
  clients, search, setSearch, statusFilter, setStatusFilter, statusCounts, total,
}: {
  clients: FinClient[];
  search: string;
  setSearch: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  statusCounts: Record<string, number>;
  total: number;
}) {
  return (
    <section style={{ marginTop: 18 }}>
      {/* Filters */}
      <div className="fin-filters">
        <div className="search-box" style={{ maxWidth: 360 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="search-input"
            placeholder="Buscar cliente o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-chips">
          <button className={`chip${statusFilter === "all" ? " active" : ""}`} onClick={() => setStatusFilter("all")}>
            Todos <span className="count">{total}</span>
          </button>
          <button className={`chip${statusFilter === "ACTIVA" ? " active" : ""}`} onClick={() => setStatusFilter("ACTIVA")}>
            Activa <span className="count">{statusCounts.ACTIVA}</span>
          </button>
          <button className={`chip${statusFilter === "CANCEL" ? " active" : ""}`} onClick={() => setStatusFilter("CANCEL")}>
            Cancelada <span className="count">{statusCounts.CANCEL}</span>
          </button>
          <button className={`chip${statusFilter === "RECHAZ" ? " active" : ""}`} onClick={() => setStatusFilter("RECHAZ")}>
            Rechazada <span className="count">{statusCounts.RECHAZ}</span>
          </button>
          <button className={`chip${statusFilter === "SIN" ? " active" : ""}`} onClick={() => setStatusFilter("SIN")}>
            Sin seguro <span className="count">{statusCounts.SIN}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ marginTop: 14 }}>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>RUT</th>
                <th>Cliente</th>
                <th>Cond. Pago</th>
                <th>Estado</th>
                <th className="num">Línea Seguro</th>
                <th className="num">Crédito Propio</th>
                <th>Aseguradora</th>
                <th>Actualización</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--text-3)", padding: 40 }}>
                    Sin resultados
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} style={{ cursor: "default" }}>
                    <td style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>
                      {c.rut_body}-{c.rut_dv}
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </td>
                    <td style={{ color: "var(--text-2)", fontSize: 12 }}>
                      {c.payment_term?.name ?? "—"}
                    </td>
                    <td>
                      {c.insurer_status && c.insurer_credit_line_clp > 0 ? (
                        <span className={`badge ${STATUS_BADGE[c.insurer_status] ?? ""}`}>
                          {c.insurer_status}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-4)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: c.insurer_credit_line_clp > 0 ? 600 : 400, color: c.insurer_credit_line_clp > 0 ? "var(--text)" : "var(--text-4)" }}>
                      {c.insurer_credit_line_clp > 0 ? fmtClp.format(c.insurer_credit_line_clp) : "—"}
                    </td>
                    <td className="num" style={{ color: c.credit_line_clp > 0 ? "var(--text-2)" : "var(--text-4)" }}>
                      {c.credit_line_clp > 0 ? fmtClp.format(c.credit_line_clp) : "—"}
                    </td>
                    <td style={{ color: "var(--text-2)", fontSize: 12 }}>
                      {c.insurer_name ?? "—"}
                    </td>
                    <td style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                      {c.insurer_credit_updated_at
                        ? new Date(c.insurer_credit_updated_at).toLocaleDateString("es-CL")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span className="page-info">
            Mostrando <strong>{clients.length}</strong> clientes
          </span>
        </div>
      </div>
    </section>
  );
}

function HistorialTab({ uploads }: { uploads: FinUpload[] }) {
  if (uploads.length === 0) {
    return (
      <section style={{ marginTop: 18 }}>
        <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r)", padding: "48px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--text-3)" }}>No hay cargas de seguros registradas.</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 18 }}>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Fecha Archivo</th>
              <th className="num">Registros</th>
              <th className="num">Activos</th>
              <th className="num">Matched</th>
              <th className="num">UF</th>
              <th className="num">Total UF</th>
              <th className="num">Total CLP</th>
              <th>Fecha Carga</th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((u) => (
              <tr key={u.id} style={{ cursor: "default" }}>
                <td style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{u.file_date}</td>
                <td className="num">{u.total_records}</td>
                <td className="num">
                  <span style={{ color: "var(--success)", fontWeight: 500 }}>{u.total_active}</span>
                </td>
                <td className="num">{u.matched_clients}</td>
                <td className="num" style={{ fontFamily: "var(--f-mono)" }}>
                  ${fmtUf.format(u.uf_value)}
                </td>
                <td className="num" style={{ fontFamily: "var(--f-mono)" }}>
                  {fmtUf.format(u.total_uf)}
                </td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {fmtClp.format(u.total_clp)}
                </td>
                <td style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                  {new Date(u.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
