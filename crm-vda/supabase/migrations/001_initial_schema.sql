-- ============================================================
-- Mercado Nacional — Schema Completo
-- Supabase / PostgreSQL
-- ============================================================

-- 0. UTILIDADES
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. CONFIGURACIÓN / REFERENCIA
-- ============================================================

CREATE TABLE roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  grupo        text,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description  text,
  icon         text,
  color        text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE role_module_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_id  uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  can_edit   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, module_id)
);

CREATE TABLE sales_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sales_channels
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE warehouses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL UNIQUE,
  code                  text NOT NULL UNIQUE,
  address               text,
  commune               text,
  city                  text,
  has_dispatch_control  boolean NOT NULL DEFAULT true,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE payment_terms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  days       integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_terms
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE supermarket_chains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  aliases    text[] NOT NULL DEFAULT '{}',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON supermarket_chains
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE system_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  value       text NOT NULL,
  description text,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 2. USUARIOS
-- ============================================================

CREATE TABLE profiles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   uuid UNIQUE,
  email          text NOT NULL UNIQUE,
  full_name      text NOT NULL,
  short_name     text,
  initials       text,
  role_id        uuid NOT NULL REFERENCES roles(id),
  color          text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_profiles_role ON profiles(role_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_auth ON profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Actualizar FK de system_config
ALTER TABLE system_config
  ADD CONSTRAINT fk_system_config_updated_by FOREIGN KEY (updated_by) REFERENCES profiles(id);

CREATE TABLE salesperson_channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, channel_id)
);

CREATE TABLE salesperson_warehouses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  is_default   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, warehouse_id)
);

CREATE TABLE user_module_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id  uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  granted    boolean NOT NULL DEFAULT true,
  can_edit   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, module_id)
);

-- 3. ENTIDADES CORE
-- ============================================================

CREATE TABLE product_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              text NOT NULL,
  name             text NOT NULL,
  category_id      uuid REFERENCES product_categories(id),
  brand_id         uuid REFERENCES brands(id),
  units_per_box    integer NOT NULL DEFAULT 12,
  base_price_net   integer NOT NULL DEFAULT 0,
  base_price_gross integer NOT NULL DEFAULT 0,
  min_price_net    integer NOT NULL DEFAULT 0,
  iva_rate         numeric(5,4) NOT NULL DEFAULT 0.19,
  ila_rate         numeric(5,4) NOT NULL DEFAULT 0.00,
  is_active        boolean NOT NULL DEFAULT true,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE UNIQUE INDEX idx_products_sku ON products(sku) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_active ON products(id) WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE clients (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rut_body               integer,
  rut_dv                 char(1),
  name                   text NOT NULL,
  address                text,
  commune                text,
  city                   text,
  phone                  text,
  email                  text,
  payment_term_id        uuid REFERENCES payment_terms(id),
  salesperson_id         uuid REFERENCES profiles(id),
  channel_id             uuid REFERENCES sales_channels(id),
  credit_line_clp        integer NOT NULL DEFAULT 0,
  credit_line_updated_at timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE UNIQUE INDEX idx_clients_rut ON clients(rut_body) WHERE rut_body IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_clients_salesperson ON clients(salesperson_id);
CREATE INDEX idx_clients_active ON clients(id) WHERE deleted_at IS NULL;

CREATE TABLE client_addresses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label             text,
  address           text NOT NULL,
  commune           text,
  city              text,
  delivery_schedule text,
  is_default        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_addresses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_client_addresses_client ON client_addresses(client_id);

-- 4. PRECIOS Y COSTOS
-- ============================================================

CREATE TABLE logistics_costs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id      uuid REFERENCES warehouses(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE CASCADE,
  cost_net_per_unit integer NOT NULL,
  iva_rate          numeric(5,4) NOT NULL DEFAULT 0.19,
  valid_from        date NOT NULL DEFAULT CURRENT_DATE,
  valid_to          date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON logistics_costs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_logistics_costs_lookup ON logistics_costs(product_id, warehouse_id, client_id, valid_from);

CREATE TABLE discount_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  description             text,
  product_id              uuid REFERENCES products(id),
  category_id             uuid REFERENCES product_categories(id),
  channel_id              uuid REFERENCES sales_channels(id),
  client_id               uuid REFERENCES clients(id),
  discount_type           text NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed_price')),
  discount_value          numeric(12,4) NOT NULL,
  min_quantity            integer,
  bypasses_vb_financiero  boolean NOT NULL DEFAULT false,
  valid_from              date NOT NULL DEFAULT CURRENT_DATE,
  valid_to                date,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON discount_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_discount_rules_active ON discount_rules(is_active, valid_from, valid_to);

-- 5. STOCK
-- ============================================================

CREATE TABLE stock_levels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id),
  warehouse_id   uuid NOT NULL REFERENCES warehouses(id),
  physical_stock integer NOT NULL DEFAULT 0,
  last_sync_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stock_levels
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 6. NOTAS DE VENTA
-- ============================================================

CREATE SEQUENCE nv_correlative_seq START WITH 1;

CREATE TABLE sales_notes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nv_number                text NOT NULL UNIQUE,
  client_id                uuid NOT NULL REFERENCES clients(id),
  salesperson_id           uuid REFERENCES profiles(id),
  nv_date                  date NOT NULL DEFAULT CURRENT_DATE,
  payment_term_id          uuid REFERENCES payment_terms(id),
  warehouse_id             uuid NOT NULL REFERENCES warehouses(id),
  delivery_address         text,
  delivery_schedule        text,
  observations             text,
  status                   text NOT NULL DEFAULT 'PENDIENTE'
                           CHECK (status IN ('PENDIENTE','APROBADO','RECHAZADO','FACTURADO','DESPACHADO')),
  requires_vb_financiero   boolean NOT NULL DEFAULT false,
  vb_financiero_status     text CHECK (vb_financiero_status IN ('PENDIENTE','OTORGADO','RECHAZADO')),
  vb_financiero_by         uuid REFERENCES profiles(id),
  vb_financiero_at         timestamptz,
  rejected_by              uuid REFERENCES profiles(id),
  rejected_at              timestamptz,
  rejection_reason         text,
  approved_by              uuid REFERENCES profiles(id),
  approved_at              timestamptz,
  invoice_number           text,
  invoiced_at              timestamptz,
  invoiced_by              uuid REFERENCES profiles(id),
  credit_note_number       text,
  total_base_net           integer NOT NULL DEFAULT 0,
  total_discount           integer NOT NULL DEFAULT 0,
  total_net                integer NOT NULL DEFAULT 0,
  total_iva                integer NOT NULL DEFAULT 0,
  total_ila                integer NOT NULL DEFAULT 0,
  total_logistics          integer NOT NULL DEFAULT 0,
  total_amount             integer NOT NULL DEFAULT 0,
  total_boxes              integer NOT NULL DEFAULT 0,
  total_units              integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sales_notes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_sn_status ON sales_notes(status);
CREATE INDEX idx_sn_client ON sales_notes(client_id);
CREATE INDEX idx_sn_salesperson ON sales_notes(salesperson_id);
CREATE INDEX idx_sn_date ON sales_notes(nv_date);
CREATE INDEX idx_sn_warehouse ON sales_notes(warehouse_id);
CREATE INDEX idx_sn_invoice ON sales_notes(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX idx_sn_vb ON sales_notes(requires_vb_financiero, vb_financiero_status)
  WHERE requires_vb_financiero = true;

CREATE TABLE sales_note_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_note_id            uuid NOT NULL REFERENCES sales_notes(id) ON DELETE CASCADE,
  product_id               uuid NOT NULL REFERENCES products(id),
  line_number              integer NOT NULL DEFAULT 1,
  quantity_boxes           integer NOT NULL,
  units_per_box            integer NOT NULL,
  quantity_units           integer NOT NULL,
  price_net_base           integer NOT NULL,
  price_gross_base         integer NOT NULL,
  price_net_final          integer NOT NULL,
  price_gross_final        integer NOT NULL,
  min_price_net            integer NOT NULL DEFAULT 0,
  requires_vb_financiero   boolean NOT NULL DEFAULT false,
  iva_rate                 numeric(5,4) NOT NULL DEFAULT 0.19,
  ila_rate                 numeric(5,4) NOT NULL DEFAULT 0.00,
  discount_amount          integer NOT NULL DEFAULT 0,
  logistics_net            integer NOT NULL DEFAULT 0,
  logistics_iva            integer NOT NULL DEFAULT 0,
  line_net                 integer NOT NULL DEFAULT 0,
  line_iva                 integer NOT NULL DEFAULT 0,
  line_ila                 integer NOT NULL DEFAULT 0,
  line_total               integer NOT NULL DEFAULT 0,
  product_sku              text NOT NULL,
  product_name             text NOT NULL,
  category_name            text,
  brand_name               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sales_note_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_sni_note ON sales_note_items(sales_note_id);
CREATE INDEX idx_sni_product ON sales_note_items(product_id);

-- 7. AUDITORÍA NV
-- ============================================================

CREATE TABLE nv_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_note_id   uuid NOT NULL REFERENCES sales_notes(id) ON DELETE CASCADE,
  nv_number       text NOT NULL,
  action          text NOT NULL,
  previous_status text,
  new_status      text,
  user_id         uuid REFERENCES profiles(id),
  user_email      text,
  detail          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nv_log_note ON nv_status_log(sales_note_id);
CREATE INDEX idx_nv_log_action ON nv_status_log(action);
CREATE INDEX idx_nv_log_date ON nv_status_log(created_at);

-- 8. DESPACHO
-- ============================================================

CREATE TABLE dispatches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_note_id   uuid REFERENCES sales_notes(id),
  invoice_number  text,
  warehouse_id    uuid NOT NULL REFERENCES warehouses(id),
  dispatch_date   date NOT NULL,
  driver          text,
  license_plate   text,
  source          text NOT NULL CHECK (source IN ('SYSTEM', 'MANUAL')),
  external_id     text,
  reason          text,
  observations    text,
  registered_by   uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_dispatches_invoice ON dispatches(invoice_number);
CREATE INDEX idx_dispatches_note ON dispatches(sales_note_id);
CREATE INDEX idx_dispatches_date ON dispatches(dispatch_date);

CREATE TABLE dispatch_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id          uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  sales_note_item_id   uuid REFERENCES sales_note_items(id),
  product_id           uuid NOT NULL REFERENCES products(id),
  quantity_dispatched  integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_di_dispatch ON dispatch_items(dispatch_id);
CREATE INDEX idx_di_product ON dispatch_items(product_id);

CREATE TABLE dispatch_routing_exceptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  reason       text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, warehouse_id)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dispatch_routing_exceptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 9. DEUDA Y COBRANZA
-- ============================================================

CREATE TABLE client_debts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id),
  document_number       text,
  invoice_date          date,
  due_date              date,
  invoice_gross         integer NOT NULL DEFAULT 0,
  debt_outstanding      integer NOT NULL DEFAULT 0,
  checks_in_portfolio   integer NOT NULL DEFAULT 0,
  channel               text,
  payment_condition     text,
  payment_status        text,
  external_id           text,
  last_sync_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_debts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_debts_client ON client_debts(client_id);
CREATE INDEX idx_debts_due ON client_debts(due_date);
CREATE INDEX idx_debts_doc ON client_debts(document_number);

CREATE TABLE collection_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id),
  debt_id             uuid REFERENCES client_debts(id),
  document_number     text,
  action_type         text NOT NULL CHECK (action_type IN ('compromiso_pago','observacion','problema','contacto')),
  description         text NOT NULL,
  commitment_date     date,
  commitment_amount   integer,
  status              text NOT NULL DEFAULT 'abierto'
                      CHECK (status IN ('abierto','pendiente','cumplido','incumplido')),
  resolution_date     timestamptz,
  resolution_note     text,
  created_by          uuid NOT NULL REFERENCES profiles(id),
  salesperson_channel text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON collection_actions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_ca_client ON collection_actions(client_id);
CREATE INDEX idx_ca_status ON collection_actions(status);

-- 10. OC SUPERMERCADOS
-- ============================================================

CREATE TABLE purchase_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text NOT NULL UNIQUE,
  chain_id          uuid REFERENCES supermarket_chains(id),
  buyer             text,
  issuer            text,
  order_date        date NOT NULL,
  cancellation_date date,
  warehouse_id      uuid REFERENCES warehouses(id),
  total_amount      integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'ACTIVA'
                    CHECK (status IN ('ACTIVA','PARCIAL','COMPLETADA','VENCIDA','CANCELLED')),
  source_pdf        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_po_chain ON purchase_orders(chain_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_date ON purchase_orders(order_date);

CREATE TABLE purchase_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES products(id),
  line_number       integer,
  sku               text,
  product_name_oc   text,
  upc_code          text,
  provider_code     text,
  quantity_units    integer NOT NULL DEFAULT 0,
  quantity_boxes    integer NOT NULL DEFAULT 0,
  units_per_pack    integer,
  unit_price        integer NOT NULL DEFAULT 0,
  line_amount       integer NOT NULL DEFAULT 0,
  category_name     text,
  brand_name        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_poi_order ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_poi_product ON purchase_order_items(product_id);

CREATE TABLE oc_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  invoice_number    text NOT NULL,
  invoice_date      date,
  buyer             text,
  observations      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON oc_invoices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE INDEX idx_oci_order ON oc_invoices(purchase_order_id);

CREATE TABLE oc_invoice_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oc_invoice_id           uuid NOT NULL REFERENCES oc_invoices(id) ON DELETE CASCADE,
  purchase_order_item_id  uuid NOT NULL REFERENCES purchase_order_items(id),
  boxes_invoiced          integer NOT NULL DEFAULT 0,
  amount_invoiced         integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ocii_invoice ON oc_invoice_items(oc_invoice_id);
CREATE INDEX idx_ocii_poi ON oc_invoice_items(purchase_order_item_id);

-- 11. ANALYTICS
-- ============================================================

CREATE TABLE sales_master (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   text,
  nv_number        text,
  sales_note_id    uuid REFERENCES sales_notes(id),
  client_id        uuid REFERENCES clients(id),
  product_id       uuid REFERENCES products(id),
  salesperson_id   uuid REFERENCES profiles(id),
  client_name      text,
  salesperson_name text,
  classification   text,
  product_sku      text,
  product_name     text,
  category_name    text,
  brand_name       text,
  boxes            integer NOT NULL DEFAULT 0,
  units            integer NOT NULL DEFAULT 0,
  net_amount       integer NOT NULL DEFAULT 0,
  total_cost       integer NOT NULL DEFAULT 0,
  margin           integer NOT NULL DEFAULT 0,
  margin_pct       numeric(7,4),
  invoice_date     date,
  year             integer,
  month            integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sm_date ON sales_master(invoice_date);
CREATE INDEX idx_sm_year_month ON sales_master(year, month);
CREATE INDEX idx_sm_salesperson ON sales_master(salesperson_id);
CREATE INDEX idx_sm_client ON sales_master(client_id);
CREATE INDEX idx_sm_classification ON sales_master(classification);
CREATE INDEX idx_sm_category ON sales_master(category_name);
CREATE INDEX idx_sm_brand ON sales_master(brand_name);

-- 12. COSTOS OPERACIONALES
-- ============================================================

CREATE TABLE operational_cost_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name    text NOT NULL,
  name          text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_name, name)
);

CREATE TABLE operational_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES operational_cost_categories(id),
  year        integer NOT NULL,
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_clp  integer NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_id, year, month)
);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON operational_costs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 13. AUDITORÍA GENERAL
-- ============================================================

CREATE TABLE audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id  uuid,
  action     text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','RESTORE')),
  user_id    uuid REFERENCES profiles(id),
  user_email text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_table ON audit_log(table_name, created_at);
CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_date ON audit_log(created_at);
