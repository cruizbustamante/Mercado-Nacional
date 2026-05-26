export type Role =
  | "admin"
  | "ceo"
  | "cfo"
  | "jefe_ventas"
  | "vendedor"
  | "aprobador"
  | "facturador"
  | "bodega";

export type NVStatus =
  | "PENDIENTE"
  | "APROBADO"
  | "RECHAZADO"
  | "FACTURADO"
  | "DESPACHADO";

export type VBStatus = "PENDIENTE" | "OTORGADO" | "RECHAZADO";

export interface Profile {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  short_name: string | null;
  initials: string | null;
  role_id: string;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role?: { name: Role; display_name: string; grupo: string | null };
}

export interface SalesChannel {
  id: string;
  name: string;
  display_name: string;
  nv_prefix: string;
  nv_last_correlative: number;
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  has_dispatch_control: boolean;
  is_active: boolean;
}

export interface PaymentTerm {
  id: string;
  name: string;
  days: number;
  is_active: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Brand {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  brand_id: string | null;
  units_per_box: number;
  base_price_net: number;
  base_price_gross: number;
  min_price_net: number;
  iva_rate: number;
  ila_rate: number;
  is_active: boolean;
  deleted_at: string | null;
  max_discount_pct: number;
  unit_cost_net: number | null;
  unit_cost_updated_at: string | null;
  supplier: string | null;
  cc_vinos: string | null;
  wine_line: string | null;
  grape: string | null;
  category?: ProductCategory;
  brand?: Brand;
}

export interface Client {
  id: string;
  rut_body: number | null;
  rut_dv: string | null;
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  payment_term_id: string | null;
  salesperson_id: string | null;
  channel_id: string | null;
  credit_line_clp: number;
  credit_line_updated_at: string | null;
  deleted_at: string | null;
  payment_term?: PaymentTerm;
  salesperson?: Profile;
  channel?: SalesChannel;
}

export interface ClientAddress {
  id: string;
  client_id: string;
  label: string | null;
  address: string;
  commune: string | null;
  city: string | null;
  delivery_schedule: string | null;
  is_default: boolean;
}

export interface SalesNote {
  id: string;
  nv_number: string;
  client_id: string;
  salesperson_id: string | null;
  channel_id: string | null;
  nv_date: string;
  payment_term_id: string | null;
  warehouse_id: string;
  delivery_address: string | null;
  delivery_schedule: string | null;
  observations: string | null;
  status: NVStatus;
  requires_vb_financiero: boolean;
  vb_financiero_status: VBStatus | null;
  vb_financiero_by: string | null;
  vb_financiero_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  invoiced_by: string | null;
  credit_note_number: string | null;
  total_base_net: number;
  total_discount: number;
  total_net: number;
  total_iva: number;
  total_ila: number;
  total_logistics: number;
  total_amount: number;
  total_boxes: number;
  total_units: number;
  created_at: string;
  updated_at: string;
  client?: Client;
  salesperson?: Profile;
  warehouse?: Warehouse;
  payment_term?: PaymentTerm;
  items?: SalesNoteItem[];
}

export interface SalesNoteItem {
  id: string;
  sales_note_id: string;
  product_id: string;
  line_number: number;
  quantity_boxes: number;
  units_per_box: number;
  quantity_units: number;
  price_net_base: number;
  price_gross_base: number;
  price_net_final: number;
  price_gross_final: number;
  min_price_net: number;
  requires_vb_financiero: boolean;
  iva_rate: number;
  ila_rate: number;
  discount_amount: number;
  logistics_net: number;
  logistics_iva: number;
  line_net: number;
  line_iva: number;
  line_ila: number;
  line_total: number;
  product_sku: string;
  product_name: string;
  category_name: string | null;
  brand_name: string | null;
}

export interface LogisticsCost {
  id: string;
  product_id: string | null;
  warehouse_id: string | null;
  client_id: string | null;
  cost_net_per_unit: number;
  iva_rate: number;
  valid_from: string;
  valid_to: string | null;
}

export interface StockAvailable {
  id: string;
  product_id: string;
  warehouse_id: string;
  physical_stock: number;
  committed_units: number;
  available_stock: number;
  last_sync_at: string | null;
}

export interface ProductCost {
  id: string;
  product_id: string;
  quarter: string;
  quarter_start: string;
  unit_cost_net: number;
}

export interface RappelAgreement {
  id: string;
  chain_id: string;
  label: string | null;
  rappel_pct: number;
  centralizacion_pct: number;
  merma_pct: number;
  extra_net_pct: number | null;
  extra_net_fixed: string | null;
  reposicion_pct: number;
  total_pct: number;
  fecha_acuerdo: string | null;
  fecha_actualizacion: string | null;
  is_active: boolean;
  chain?: { id: string; name: string };
}
