import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { formatRut } from "@/lib/rut";
import { NvPrintButton } from "./NvPrintButton";
import "../nueva/nv.css";
import "./detail.css";

const fmtN = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const fmtClp = (n: number) => `$${fmtN.format(n)}`;
const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente V°B°",
  APROBADO: "Aprobada",
  RECHAZADO: "Rechazada",
  FACTURADO: "Facturada",
  DESPACHADO: "Despachada",
};

export default async function NvDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: nv } = await supabase
    .from("sales_notes")
    .select(`
      *,
      client:clients(rut_body, rut_dv, name, address, commune, city, phone, email, insurer_status, insurer_credit_line_clp),
      salesperson:profiles!sales_notes_salesperson_id_fkey(full_name, short_name, email),
      warehouse:warehouses(name, code, address, commune, city),
      payment_term:payment_terms(name, days),
      items:sales_note_items(*)
    `)
    .eq("id", id)
    .single();

  if (!nv) notFound();

  const items = (nv.items ?? []) as Array<Record<string, number | string | null>>;
  items.sort((a, b) => (a.line_number as number) - (b.line_number as number));

  const client = nv.client as { rut_body: number; rut_dv: string; name: string; address: string | null; commune: string | null; city: string | null; phone: string | null; email: string | null; insurer_status: string | null; insurer_credit_line_clp: number } | null;
  const salesperson = nv.salesperson as { full_name: string; short_name: string | null; email: string } | null;
  const warehouse = nv.warehouse as { name: string; code: string; address: string | null; commune: string | null; city: string | null } | null;
  const paymentTerm = nv.payment_term as { name: string; days: number } | null;

  return (
    <div className="nv-root">
      <header className="app-header no-print">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="brand-mark">MN</div>
          <span className="brand-name">Mercado Nacional</span>
          <span className="brand-sub">· Gestión Comercial</span>
        </Link>
        <div className="divider-v"></div>
        <nav className="crumbs">
          <Link href="/">Inicio</Link>
          <span className="sep">/</span>
          <Link href="/nota-venta">Notas de Venta</Link>
          <span className="sep">/</span>
          <span className="here">{nv.nv_number}</span>
        </nav>
        <div className="header-spacer"></div>
        <NvPrintButton />
      </header>

      <article className="nv-doc">
        <section className="nv-doc-head">
          <div className="nv-doc-head-grid">
            <div>
              <div className="nv-eyebrow">Nota de Venta</div>
              <div className="nv-doc-title-row">
                <h1 className="nv-doc-title">NV-{nv.nv_number}</h1>
                <span className={`badge ${
                  nv.status === "APROBADO" || nv.status === "FACTURADO" || nv.status === "DESPACHADO" ? "badge-ok"
                  : nv.status === "RECHAZADO" ? "badge-danger"
                  : "badge-pending"
                }`}>
                  <span className="dot"></span> {STATUS_LABEL[nv.status as string] ?? nv.status}
                </span>
              </div>
              <div className="nv-doc-meta">
                <div><span>Fecha</span><b>{nv.nv_date}</b></div>
                <div><span>Vendedor</span><b>{salesperson?.short_name ?? salesperson?.full_name ?? "—"}</b></div>
                <div><span>Bodega</span><b>{warehouse?.name ?? "—"}</b></div>
                <div><span>Cond. pago</span><b>{paymentTerm?.name ?? "—"}</b></div>
              </div>
            </div>
            <div className="nv-doc-stamp">
              <div className="nv-eyebrow">Total a facturar</div>
              <div className="nv-doc-total">{fmtClp(nv.total_amount as number)}</div>
              <div className="nv-doc-subtotal">{nv.total_boxes} cajas · {nv.total_units} unidades</div>
            </div>
          </div>
        </section>

        <section className="nv-block">
          <h2 className="nv-block-title">Cliente</h2>
          <div className="nv-client-grid">
            <div>
              <div className="nv-key">Razón Social</div>
              <div className="nv-val nv-val-strong">{client?.name ?? "—"}</div>
            </div>
            <div>
              <div className="nv-key">RUT</div>
              <div className="nv-val mono">{client ? formatRut(client.rut_body, client.rut_dv) : "—"}</div>
            </div>
            <div className="nv-col-2">
              <div className="nv-key">Dirección de despacho</div>
              <div className="nv-val">{nv.delivery_address ?? client?.address ?? "—"}</div>
            </div>
            <div>
              <div className="nv-key">Comuna · Ciudad</div>
              <div className="nv-val">{[client?.commune, client?.city].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <div>
              <div className="nv-key">Seguro de crédito</div>
              <div className="nv-val">
                {client?.insurer_status === "ACTIVA" ? (
                  <span className="badge badge-ok">VIGENTE — {fmtClp(client.insurer_credit_line_clp)}</span>
                ) : client?.insurer_status === "CANCEL" ? (
                  <span className="badge badge-warn">CANCELADO</span>
                ) : client?.insurer_status === "RECHAZ" ? (
                  <span className="badge badge-danger">RECHAZADO</span>
                ) : (
                  <span style={{ color: "var(--text-3)" }}>Sin seguro</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="nv-block">
          <h2 className="nv-block-title">Productos</h2>
          <table className="nv-items">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Producto</th>
                <th className="num" style={{ width: 60 }}>Cj</th>
                <th className="num" style={{ width: 60 }}>U/Cj</th>
                <th className="num" style={{ width: 70 }}>Unid.</th>
                <th className="num" style={{ width: 100 }}>Precio bruto</th>
                <th className="num" style={{ width: 100 }}>Precio neto</th>
                <th className="num" style={{ width: 120 }}>Total línea</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={String(it.id)}>
                  <td className="num mono">{String(it.line_number).padStart(2, "0")}</td>
                  <td>
                    <div className="nv-val-strong">{it.product_name}</div>
                    <div className="nv-mini mono">SKU {it.product_sku}{it.brand_name ? ` · ${it.brand_name}` : ""}{it.category_name ? ` · ${it.category_name}` : ""}</div>
                  </td>
                  <td className="num mono">{it.quantity_boxes}</td>
                  <td className="num mono">{it.units_per_box}</td>
                  <td className="num mono">{it.quantity_units}</td>
                  <td className="num mono">{fmtClp(it.price_gross_final as number)}</td>
                  <td className="num mono">{fmtClp(it.price_net_final as number)}</td>
                  <td className="num mono nv-val-strong">{fmtClp(it.line_total as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="nv-totals-block">
          <div className="nv-totals-box">
            <div className="nv-totals-row"><span>Neto productos</span><b>{fmtClp(nv.total_net as number)}</b></div>
            {(nv.total_discount as number) > 0 && (
              <div className="nv-totals-row"><span>Descuento</span><b style={{ color: "var(--info)" }}>−{fmtClp(nv.total_discount as number)}</b></div>
            )}
            <div className="nv-totals-row"><span>Logístico</span><b>{fmtClp(nv.total_logistics as number)}</b></div>
            <div className="nv-totals-row"><span>IVA</span><b>{fmtClp(nv.total_iva as number)}</b></div>
            {(nv.total_ila as number) > 0 && (
              <div className="nv-totals-row"><span>ILA</span><b>{fmtClp(nv.total_ila as number)}</b></div>
            )}
            <div className="nv-totals-row nv-totals-total"><span>Total</span><b>{fmtClp(nv.total_amount as number)}</b></div>
          </div>
        </section>

        {nv.observations && (
          <section className="nv-block">
            <h2 className="nv-block-title">Observaciones</h2>
            <div className="nv-val">{nv.observations as string}</div>
          </section>
        )}

        <footer className="nv-doc-foot">
          <div>Emitida {nv.created_at ? new Date(nv.created_at as string).toLocaleString("es-CL") : ""}</div>
          <div>Mercado Nacional · Sistema de Gestión Comercial</div>
        </footer>
      </article>
    </div>
  );
}
