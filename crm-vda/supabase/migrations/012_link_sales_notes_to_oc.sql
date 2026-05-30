-- 012_link_sales_notes_to_oc
-- Trazabilidad NV → OC: permite facturar las OC de supermercado a través del
-- módulo Facturación (NV en estado APROBADO = pendiente de facturación) y, al
-- facturarlas, devolver folio + cantidades al módulo Supermercados para alimentar
-- el cumplimiento (fill rate). Columnas nullable: solo se setean en NV de origen OC.

alter table public.sales_notes
  add column if not exists purchase_order_id uuid
    references public.purchase_orders(id) on delete set null;

create index if not exists idx_sales_notes_purchase_order_id
  on public.sales_notes(purchase_order_id);

alter table public.sales_note_items
  add column if not exists purchase_order_item_id uuid
    references public.purchase_order_items(id) on delete set null;

create index if not exists idx_sales_note_items_po_item_id
  on public.sales_note_items(purchase_order_item_id);

comment on column public.sales_notes.purchase_order_id is
  'OC de supermercado de origen (null para NV manuales). Permite devolver el folio y cantidades facturadas al módulo Supermercados.';
comment on column public.sales_note_items.purchase_order_item_id is
  'Línea de OC de origen (null para NV manuales). Mapea cada línea de NV a su línea de OC para el writeback de cumplimiento.';
