import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { NvForm, type NvClient, type NvProduct, type NvWarehouse, type NvPaymentTerm } from "./NvForm";
import "./nv.css";

export default async function NuevaNVPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [clientsRes, productsRes, warehousesRes, paymentTermsRes, configRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, rut_body, rut_dv, name, address, commune, city, credit_line_clp, insurer_credit_line_clp, payment_term:payment_terms(id, name)")
      .is("deleted_at", null)
      .order("name")
      .limit(500),
    supabase
      .from("products")
      .select("id, sku, name, units_per_box, base_price_net, base_price_gross, min_price_net, iva_rate, ila_rate, category:product_categories(name), brand:brands(name)")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase.from("warehouses").select("id, code, name").eq("is_active", true),
    supabase.from("payment_terms").select("id, name, days").eq("is_active", true).order("days"),
    supabase.from("system_config").select("key, value").in("key", ["logistics_cost_net_per_unit", "logistics_cost_iva_rate", "vb_tolerance_clp"]),
  ]);

  const clients = (clientsRes.data ?? []) as unknown as NvClient[];
  const products = (productsRes.data ?? []) as unknown as NvProduct[];
  const warehouses = (warehousesRes.data ?? []) as NvWarehouse[];
  const paymentTerms = (paymentTermsRes.data ?? []) as NvPaymentTerm[];

  const cfg = new Map((configRes.data ?? []).map((r) => [r.key, r.value]));
  const config = {
    logisticsNetPerUnit: parseFloat(cfg.get("logistics_cost_net_per_unit") ?? "360"),
    logisticsIvaRate: parseFloat(cfg.get("logistics_cost_iva_rate") ?? "0.19"),
    vbToleranceClp: parseFloat(cfg.get("vb_tolerance_clp") ?? "5"),
  };

  const { data: lastNvRow } = await supabase
    .from("sales_notes")
    .select("nv_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNvNum = lastNvRow?.nv_number
    ? parseInt(String(lastNvRow.nv_number).replace(/\D/g, ""), 10)
    : 0;
  const nextNvNumber = String(lastNvNum + 1).padStart(6, "0");

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="nv-root">
      <NvForm
        emisor={{
          id: profile.id,
          full_name: profile.full_name,
          short_name: profile.short_name ?? profile.full_name,
        }}
        today={today}
        nextNvNumber={nextNvNumber}
        clients={clients}
        products={products}
        warehouses={warehouses}
        paymentTerms={paymentTerms}
        config={config}
      />
    </div>
  );
}
