import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  PENDIENTE: { background: "var(--warning-soft)", color: "var(--warning)", border: "1px solid rgba(156,106,30,0.18)" },
  APROBADO: { background: "var(--info-soft)", color: "var(--info)", border: "1px solid rgba(44,74,107,0.15)" },
  RECHAZADO: { background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid rgba(139,45,31,0.18)" },
  FACTURADO: { background: "var(--success-soft)", color: "var(--success)", border: "1px solid rgba(45,95,63,0.18)" },
  DESPACHADO: { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" },
};

export default async function NotaVentaPage() {
  const supabase = await createClient();

  const [{ data: notes }, { data: channels }] = await Promise.all([
    supabase
      .from("sales_notes")
      .select("id, nv_number, nv_date, status, total_amount, client:clients(name), salesperson:profiles!sales_notes_salesperson_id_fkey(short_name)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sales_channels")
      .select("display_name, nv_prefix, nv_last_correlative")
      .eq("is_active", true)
      .order("display_name"),
  ]);

  const rows = (notes ?? []) as unknown as Array<{
    id: string;
    nv_number: string;
    nv_date: string;
    status: string;
    total_amount: number;
    client: { name: string } | null;
    salesperson: { short_name: string } | null;
  }>;

  const channelFolios = (channels ?? []) as Array<{
    display_name: string;
    nv_prefix: string;
    nv_last_correlative: number;
  }>;

  return (
    <div className="content">
      <section className="block">
        <div className="block-head">
          <div className="block-title">
            <span className="block-title-text">Notas de Venta</span>
            <span className="block-sub">{rows.length > 0 ? `${rows.length} NV más recientes` : "Sin notas de venta"}</span>
          </div>
          <Link href="/nota-venta/nueva" className="btn btn-primary" style={{ color: "white" }}>
            + Nueva NV
          </Link>
        </div>

        {channelFolios.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
            {channelFolios.map((ch) => (
              <div key={ch.nv_prefix} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "8px 12px", fontSize: 12 }}>
                <span style={{ color: "var(--text-3)" }}>{ch.display_name}</span>
                <span style={{ marginLeft: 8, fontFamily: "var(--f-mono)", fontWeight: 600, color: "var(--text)" }}>
                  {ch.nv_prefix}-{String(ch.nv_last_correlative).padStart(6, "0")}
                </span>
                <span style={{ marginLeft: 6, color: "var(--text-4)" }}>
                  → próxima: {ch.nv_prefix}-{String(ch.nv_last_correlative + 1).padStart(6, "0")}
                </span>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r)", padding: "48px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 16 }}>Aún no hay notas de venta emitidas.</p>
            <Link href="/nota-venta/nueva" className="btn btn-primary" style={{ color: "white" }}>
              Emitir la primera NV
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>NV</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Estado</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id}>
                    <td style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>
                      <Link href={`/nota-venta/${n.id}`} style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>{n.nv_number}</Link>
                    </td>
                    <td style={{ color: "var(--text-2)" }}>{n.nv_date}</td>
                    <td>{n.client?.name ?? "—"}</td>
                    <td style={{ color: "var(--text-2)" }}>{n.salesperson?.short_name ?? "—"}</td>
                    <td>
                      <span className="badge" style={STATUS_STYLE[n.status] ?? { background: "var(--surface-2)" }}>
                        {n.status}
                      </span>
                    </td>
                    <td className="num">{fmt.format(n.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
