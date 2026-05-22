-- ============================================================
-- CRM VDA — Datos Semilla (Seed Data)
-- ============================================================

-- 1. ROLES
-- ============================================================
INSERT INTO roles (name, display_name, grupo, description) VALUES
  ('admin',       'Administrador',    'direccion',   'Acceso total al sistema'),
  ('ceo',         'CEO',              'direccion',   'Gerente general'),
  ('cfo',         'CFO',              'direccion',   'Gerente de finanzas'),
  ('jefe_ventas', 'Jefe de Ventas',   'comercial',   'Jefatura comercial'),
  ('vendedor',    'Vendedor',         'comercial',   'Ejecutivo de ventas'),
  ('aprobador',   'Aprobador',        'operaciones', 'Aprobador de notas de venta'),
  ('facturador',  'Facturador',       'operaciones', 'Emisor de facturas'),
  ('bodega',      'Bodega',           'operaciones', 'Operador de bodega');

-- 2. MÓDULOS
-- ============================================================
INSERT INTO modules (name, display_name, description, icon, color, sort_order) VALUES
  ('emisor_nv',       'Emisión NV',       'Crear notas de venta',       'document-text', '#0854A0', 1),
  ('aprobador',       'Aprobador',        'Validar notas de venta',     'checklist',     '#1A9898', 2),
  ('finanzas',        'Finanzas',         'Control de crédito y V°B°',  'money-bills',   '#C35500', 3),
  ('facturador',      'Facturador',       'Emitir facturas',            'receipt',       '#5B738B', 4),
  ('comercial',       'Comercial',        'Análisis de ventas',         'chart-line',    '#0854A0', 5),
  ('deuda_clientes',  'Deuda Clientes',   'Cobranza y crédito',         'credit-card',   '#BB0000', 6),
  ('despacho',        'Despacho',         'Gestión de envíos',          'truck',         '#256F3A', 7),
  ('oc_supermercados', 'OC Supermercados', 'Órdenes de compra',          'cart',          '#1A9898', 8),
  ('stock',           'Stock',            'Control de inventario',       'boxes',         '#5B738B', 9),
  ('op_licores',      'Op. Licores',      'Análisis operacional',        'analytics',     '#840606', 10);

-- 3. PERMISOS POR ROL → MÓDULO
-- ============================================================
-- admin: todos los módulos con edición
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, true
FROM roles r, modules m
WHERE r.name = 'admin';

-- ceo
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, false
FROM roles r, modules m
WHERE r.name = 'ceo'
  AND m.name IN ('comercial','deuda_clientes','finanzas','despacho','op_licores','stock','oc_supermercados');

-- cfo
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, CASE WHEN m.name = 'finanzas' THEN true ELSE false END
FROM roles r, modules m
WHERE r.name = 'cfo'
  AND m.name IN ('finanzas','deuda_clientes','comercial','despacho','op_licores','stock','oc_supermercados');

-- jefe_ventas
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, CASE WHEN m.name IN ('emisor_nv','comercial') THEN true ELSE false END
FROM roles r, modules m
WHERE r.name = 'jefe_ventas'
  AND m.name IN ('comercial','emisor_nv','deuda_clientes','despacho','oc_supermercados');

-- aprobador
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, CASE WHEN m.name IN ('aprobador','emisor_nv','facturador') THEN true ELSE false END
FROM roles r, modules m
WHERE r.name = 'aprobador'
  AND m.name IN ('aprobador','finanzas','comercial','emisor_nv','facturador','despacho','deuda_clientes','oc_supermercados','stock');

-- vendedor
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, CASE WHEN m.name = 'emisor_nv' THEN true ELSE false END
FROM roles r, modules m
WHERE r.name = 'vendedor'
  AND m.name IN ('emisor_nv','deuda_clientes','despacho','oc_supermercados','comercial');

-- facturador
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, CASE WHEN m.name = 'facturador' THEN true ELSE false END
FROM roles r, modules m
WHERE r.name = 'facturador'
  AND m.name IN ('facturador','despacho','oc_supermercados','stock');

-- bodega
INSERT INTO role_module_permissions (role_id, module_id, can_edit)
SELECT r.id, m.id, CASE WHEN m.name = 'despacho' THEN true ELSE false END
FROM roles r, modules m
WHERE r.name = 'bodega'
  AND m.name IN ('despacho','oc_supermercados');

-- 4. CANALES DE VENTA
-- ============================================================
INSERT INTO sales_channels (name, display_name) VALUES
  ('mayorista',     'Mayorista'),
  ('supermercado',  'Supermercado');

-- 5. BODEGAS / CENTROS DE DISTRIBUCIÓN
-- ============================================================
INSERT INTO warehouses (name, code, address, commune, city, has_dispatch_control) VALUES
  ('CD Santiago',    'STG', NULL, NULL, 'Santiago',     true),
  ('Villa Alegre',   'VA',  NULL, NULL, 'Villa Alegre', false);

-- 6. CONDICIONES DE PAGO
-- ============================================================
INSERT INTO payment_terms (name, days) VALUES
  ('Contado',   0),
  ('30 días',  30),
  ('60 días',  60),
  ('90 días',  90),
  ('120 días', 120);

-- 7. CADENAS DE SUPERMERCADOS
-- ============================================================
INSERT INTO supermarket_chains (name, aliases) VALUES
  ('Walmart',     ARRAY['WALMART','LIDER','LIDER EXPRESS','ACUENTA','A CUENTA','CENTRAL MAYORISTA']),
  ('SMU',         ARRAY['SMU','UNIMARC','OK MARKET','ALVI','MAYORISTA 10']),
  ('Cencosud',    ARRAY['CENCOSUD','JUMBO','SANTA ISABEL','EASY']),
  ('Tottus',      ARRAY['TOTTUS','FALABELLA']),
  ('Sodimac',     ARRAY['SODIMAC','IMPERIAL']),
  ('Otro',        ARRAY['OTRO']);

-- 8. CONFIGURACIÓN DEL SISTEMA
-- ============================================================
INSERT INTO system_config (key, value, description) VALUES
  ('logistics_cost_net_per_unit', '360',       'Costo logístico neto por unidad (CLP)'),
  ('logistics_cost_iva_rate',     '0.19',      'Tasa IVA aplicada al costo logístico'),
  ('iva_rate_default',            '0.19',      'Tasa IVA por defecto (19%)'),
  ('vb_tolerance_clp',            '5',         'Tolerancia en CLP para V°B° financiero'),
  ('nv_prefix',                   '',          'Prefijo para número de NV'),
  ('nv_padding',                  '6',         'Dígitos de padding para correlativo NV'),
  ('company_name',                'Viña de Aguirre', 'Razón social'),
  ('company_rut',                 '',          'RUT de la empresa');

-- 9. CATEGORÍAS DE COSTOS OPERACIONALES
-- ============================================================
INSERT INTO operational_cost_categories (name, description) VALUES
  ('almacen',    'Costos de almacenamiento y bodegaje'),
  ('transporte', 'Costos de transporte y distribución'),
  ('rrhh',       'Recursos humanos operativos'),
  ('servicios',  'Servicios básicos y mantención'),
  ('seguros',    'Seguros y garantías'),
  ('otros',      'Otros costos operacionales');

-- 10. PERFILES DE USUARIOS
-- ============================================================
INSERT INTO profiles (email, full_name, short_name, initials, role_id, color) VALUES
  ('cruizbusta@gmail.com',      'Administrador',             'Admin',       'CR', (SELECT id FROM roles WHERE name = 'admin'),       '#333333'),
  ('vdacruiz@gmail.com',        'Administrador VDA',         'Admin VDA',   'CV', (SELECT id FROM roles WHERE name = 'admin'),       '#333333'),
  ('vdardeaguirre@gmail.com',   'Rodrigo de Aguirre',        'Rodrigo',     'RA', (SELECT id FROM roles WHERE name = 'ceo'),         '#0854A0'),
  ('vdamsanchez@gmail.com',     'Manuel Sánchez',            'Manuel',      'MS', (SELECT id FROM roles WHERE name = 'cfo'),         '#C35500'),
  ('vdacnavas@gmail.com',       'Claudia Navas',             'Claudia',     'CN', (SELECT id FROM roles WHERE name = 'cfo'),         '#C35500'),
  ('vdasdeaguirre@gmail.com',   'Sebastián de Aguirre',      'Sebastián',   'SA', (SELECT id FROM roles WHERE name = 'jefe_ventas'), '#0854A0'),
  ('vdakgonzalez@gmail.com',    'Krishna González',          'Krishna',     'KG', (SELECT id FROM roles WHERE name = 'aprobador'),   '#1A9898'),
  ('vdaimontenegro@gmail.com',  'Iván Montenegro',           'Iván',        'IM', (SELECT id FROM roles WHERE name = 'aprobador'),   '#5B738B'),
  ('vdajmontenegro@gmail.com',  'Juan Manuel Montenegro',    'Juan Manuel', 'JM', (SELECT id FROM roles WHERE name = 'vendedor'),    '#5B738B'),
  ('vdacossa@gmail.com',        'Carlos Ossa',               'Carlos',      'CO', (SELECT id FROM roles WHERE name = 'vendedor'),    '#1A9898'),
  ('vdadhernandez@gmail.com',   'Daniel Hernández',          'Daniel',      'DH', (SELECT id FROM roles WHERE name = 'vendedor'),    '#C35500'),
  ('vdacarce@gmail.com',        'Cecilia Arce',              'Cecilia',     'CA', (SELECT id FROM roles WHERE name = 'facturador'),  '#5B738B'),
  ('vdaacallejas@gmail.com',    'Bodega Villa Alegre',       'Villa Alegre','AC', (SELECT id FROM roles WHERE name = 'bodega'),      '#256F3A');

-- 11. ASIGNACIÓN VENDEDORES → CANALES
-- ============================================================
-- Sebastián: Supermercado + Mayorista
INSERT INTO salesperson_channels (profile_id, channel_id)
SELECT p.id, c.id
FROM profiles p, sales_channels c
WHERE p.email = 'vdasdeaguirre@gmail.com'
  AND c.name IN ('mayorista', 'supermercado');

-- Carlos, Daniel, Juan Manuel: Solo Mayorista
INSERT INTO salesperson_channels (profile_id, channel_id)
SELECT p.id, c.id
FROM profiles p, sales_channels c
WHERE p.email IN ('vdacossa@gmail.com', 'vdadhernandez@gmail.com', 'vdajmontenegro@gmail.com')
  AND c.name = 'mayorista';

-- 12. ASIGNACIÓN VENDEDORES → BODEGAS DEFAULT
-- ============================================================
-- Daniel Hernández → Villa Alegre
INSERT INTO salesperson_warehouses (profile_id, warehouse_id, is_default)
SELECT p.id, w.id, true
FROM profiles p, warehouses w
WHERE p.email = 'vdadhernandez@gmail.com' AND w.code = 'VA';

-- Sebastián, Carlos, Juan Manuel → Santiago
INSERT INTO salesperson_warehouses (profile_id, warehouse_id, is_default)
SELECT p.id, w.id, true
FROM profiles p, warehouses w
WHERE p.email IN ('vdasdeaguirre@gmail.com', 'vdacossa@gmail.com', 'vdajmontenegro@gmail.com')
  AND w.code = 'STG';

-- 13. COSTO LOGÍSTICO BASE (global)
-- ============================================================
INSERT INTO logistics_costs (product_id, warehouse_id, client_id, cost_net_per_unit, iva_rate)
VALUES (NULL, NULL, NULL, 360, 0.19);

-- 14. USER MODULE OVERRIDES (permisos especiales del sistema actual)
-- ============================================================
-- Krishna González: acceso a stock (no viene del rol aprobador)
INSERT INTO user_module_overrides (profile_id, module_id, granted, can_edit)
SELECT p.id, m.id, true, false
FROM profiles p, modules m
WHERE p.email = 'vdakgonzalez@gmail.com' AND m.name = 'stock';

-- Cecilia Arce: acceso a stock (no viene del rol facturador por default, pero ya está en role_module_permissions)
-- (en el sistema actual tiene stock, y en nuestro esquema facturador ya lo tiene)

-- 15. VIEW: STOCK DISPONIBLE
-- ============================================================
CREATE OR REPLACE VIEW v_stock_available AS
SELECT
  sl.id,
  sl.product_id,
  sl.warehouse_id,
  sl.physical_stock,
  COALESCE(committed.committed_units, 0) AS committed_units,
  sl.physical_stock - COALESCE(committed.committed_units, 0) AS available_stock,
  sl.last_sync_at
FROM stock_levels sl
LEFT JOIN LATERAL (
  SELECT SUM(sni.quantity_units) AS committed_units
  FROM sales_note_items sni
  JOIN sales_notes sn ON sn.id = sni.sales_note_id
  WHERE sni.product_id = sl.product_id
    AND sn.warehouse_id = sl.warehouse_id
    AND sn.status IN ('PENDIENTE', 'APROBADO', 'FACTURADO')
) committed ON true;

-- ============================================================
-- FIN SEED DATA
-- ============================================================
