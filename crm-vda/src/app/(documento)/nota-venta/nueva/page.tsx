import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { NvForm, type NvClient, type NvProduct, type NvWarehouse, type NvPaymentTerm } from "./NvForm";
import "./nv.css";

export default async function NuevaNVPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [clientsRes, productsRes, warehousesRes, paymentTermsRes] = await Promise.all([
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
  ]);

  const clients = (clientsRes.data ?? []) as unknown as NvClient[];
  const products = (productsRes.data ?? []) as unknown as NvProduct[];
  const warehouses = (warehousesRes.data ?? []) as NvWarehouse[];
  const paymentTerms = (paymentTermsRes.data ?? []) as NvPaymentTerm[];

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="nv-root">
      <NvForm
        emisor={{
          full_name: profile.full_name,
          short_name: profile.short_name ?? profile.full_name,
        }}
        today={today}
        clients={clients}
        products={products}
        warehouses={warehouses}
        paymentTerms={paymentTerms}
      />
    </div>
  );
}
