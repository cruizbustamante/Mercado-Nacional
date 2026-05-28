@AGENTS.md

# Mercado Nacional — CRM

CRM interno de **Mercado Nacional** (distribuidora de licores, Chile). Reemplaza un sistema legacy hecho en Google Apps Script + Sheets (queda en `../apps-script/` como referencia, no se ejecuta).

## Stack

- **Next.js 16.2.6** (App Router, React 19.2, Turbopack)
- **Tailwind v4**
- **Supabase** (Postgres 17.6, `@supabase/ssr` + `@supabase/supabase-js`)
- **Vercel** (Hobby, region iad1)
- **TypeScript** estricto

## Estructura

```
src/
├── app/
│   ├── (dashboard)/              # módulos generales con sidebar global
│   │   ├── layout.tsx            # sidebar + topbar (DashboardShell client)
│   │   └── page.tsx              # home con cards-dashboard (stats live)
│   ├── (admin)/                  # rutas admin con header propio, sin sidebar
│   │   ├── layout.tsx
│   │   └── admin/                # /admin/{clientes,productos,mapeo-upc,cargadores/...}
│   ├── (supermercados)/          # MÓDULO SUPER aislado, sin sidebar global
│   │   ├── layout.tsx            # header + TabsNav (4 tabs arriba)
│   │   └── supermercados/
│   │       ├── page.tsx          # Tab Cumplimiento (dashboard KPIs)
│   │       ├── analisis/         # Tab Análisis (marca/categoría/SKU/cadena)
│   │       ├── ordenes/          # Tab Órdenes + @modal/ (intercepting routes)
│   │       ├── oc/[id]/          # detalle full page + editor inline de facturas
│   │       ├── alertas/          # Tab Alertas accionables
│   │       ├── _components/      # TabsNav (client)
│   │       ├── _lib/             # queries.ts, period.ts
│   │       └── supermercados.css
│   ├── (documento)/              # /nota-venta sin shell de dashboard
│   ├── auth/callback/
│   ├── login/                    # split editorial 40/60 + LoginForm CC
│   ├── warm.css                  # tokens y components compartidos
│   ├── layout.tsx                # root layout
│   └── globals.css
├── lib/
│   ├── auth.ts                   # getCurrentProfile(), getUserModules()
│   ├── home-stats.ts             # stats live por módulo (cards del home)
│   ├── modules.ts                # MODULE_ICONS, MODULE_ROUTES
│   ├── nv/                       # cálculo de NV
│   ├── upc.ts                    # canonUpc + variantesUpc (match DUN runtime)
│   ├── file-to-text.ts           # PDF/DOC/DOCX/HTML → texto plano
│   ├── oc-parser.ts              # parser OC supermercados (MarkItDown format)
│   ├── supabase/                 # client.ts, server.ts, middleware.ts
│   └── types/database.ts
└── middleware.ts                 # auth gate (TODO: migrar a proxy.ts en Next 16)
supabase/
└── migrations/                   # solo 001 + 002 en disco, resto aplicado via MCP
```

## Conceptos del dominio

- **Profile** = un usuario interno (vendedor, aprobador, etc.). Vinculado a `auth.users` vía `auth_user_id`.
- **Rol** (admin, ceo, cfo, jefe_ventas, vendedor, aprobador, facturador, bodega) → set de **módulos** visibles vía `role_module_permissions`.
- **Módulo** = una sección del CRM (emisor_nv, aprobador, finanzas, etc.). El sidebar se construye desde la DB según el rol del usuario logueado.
- **NV (Nota de Venta)** = orden interna previa a la factura. Estados: `PENDIENTE → APROBADO/RECHAZADO → FACTURADO → DESPACHADO`. Si el precio de venta cae bajo `min_price_net` requiere V°B° financiero.
- **Cálculo NV** vive en `src/lib/nv/calculate.ts` — portado de `_prepararDatosNV()` de Apps Script. Mantener compatible.

## Auth flow

1. Middleware (`src/middleware.ts`) intercepta toda request y llama `updateSession(request)`.
2. Si no hay user de Supabase Auth → redirect a `/login`.
3. El login es un Server Action (`src/app/login/actions.ts`) que llama `supabase.auth.signInWithPassword`.
4. La función `getCurrentProfile()` resuelve `auth.users.id` → `profiles` row vía `auth_user_id`.
5. Hay un trigger `on_auth_user_created` que auto-vincula `auth_user_id` a `profiles` cuando se crea un user con email que matchea un profile seedeado (ver migration 003).

> ⚠️ El warning `middleware → proxy` de Next.js 16 está pendiente de migrar. Mecánico, en un commit aparte cuando se decida.

## Convenciones

- **DB:** nombres de tablas/columnas en `snake_case` en inglés. Texto de UI y comentarios en español.
- **Identificadores monetarios** son `integer` en CLP (no decimales). El IVA/ILA se redondea con `Math.round`.
- **Cookies y `headers()`** son async en Next.js 16 — siempre `await`.
- **Rutas protegidas** van bajo `src/app/(dashboard)/`. Las nuevas pantallas de módulos deberían crearse allí (ej: `src/app/(dashboard)/emisor-nv/page.tsx`).
- Los iconos actuales son emojis en `src/lib/modules.ts`. Plan: migrar a `lucide-react` cuando el usuario lo confirme.

## Comandos

```bash
npm run dev      # next dev
npm run build    # next build (Turbopack)
npm run lint     # eslint
```

`.env.local` requerido con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (las mismas están como env vars en Vercel).

## Estado de la migración

Ver el commit log como referencia más actualizada. En grandes rasgos al 2026-05-28:

- ✅ Auth + dashboard layout
- ✅ **Home rediseñado "Centro de Comando"** (mockup mn-home-centro-comando v1.0):
  - PageHeader sobrio (sin "Hola, Admin") + quick actions Nueva NV + Cargar OC
  - Pulso del negocio (4 KPIs): Facturación mes, Cumplimiento OC, Deuda clientes, OC vencidas (wine card)
  - 8 cards de módulos en 2 secciones (Operaciones + Gestión) sobrios sin KPIs internos
  - Bloque "Requiere atención hoy" con OC vencidas priorizadas por severidad
  - Inter font + paleta editorial (bg-base/surface, ink/ink-2/ink-3, wine, pos/neg/warn/orange)
- ✅ Login rediseñado split editorial 40/60
- ✅ Data maestra: cargadores Excel + CRUDs modal
  - **Ficha producto** edita `ila_rate` e `iva_rate` por SKU (no solo via Excel)
- ✅ **Emisión NV** completa: cálculo + PDF + persistencia, badge seguro de crédito, uso de crédito real
- ✅ **Módulo Supermercados rediseñado v2.0** (fusión Análisis + Cumplimiento):
  - Layout full-width sin `max-w-7xl`, padding mínimo `px-3 sm:px-5 lg:px-6` para aprovechar todo el ancho
  - **3 pestañas con ancho igual (grid)**: Análisis · Órdenes · Alertas. Cumplimiento eliminada (duplicaba "Por cadena")
  - Texto blanco en pestañas activas vía `style={{ color: "#fff" }}` + warm.css envuelto en `@layer base`
  - **Tab Análisis (/supermercados)** (fusión completa): 4 KPIs + filtros (cadena/marca/categoría con `FilterSelect.tsx` client) + detalle mensual YoY + 6 cards (Por cadena, Por marca, Por categoría, Top productos, Razones, Performance ranking). Clic en cualquier fila aplica filtro a todo el dashboard
  - **Tab Órdenes**: KPI bar 8 cols + acordeón por cadena con mini-dashboard + tabla densificada con columnas Edad (días desde emisión con color) · Cajas (fact/pedidas) · Pendiente $ · PDF (link al `source_pdf`). N°OC con truncate+title para Rendic/SCPD de 21 dígitos
  - **Tab Alertas**: 4 cards severidad + cola priorizada
  - Modal OC + editor facturas: estilos legacy preservados (warm.css + supermercados.css)
  - `/supermercados/analisis` queda como redirect 307 a `/supermercados`
- ✅ **Cadenas separadas**: Rendic, Alvi y SCPD ahora son cadenas propias en `supermarket_chains` (no aliases de SMU). 30 OCs históricas reasignadas. Distribución: Walmart 23 · Rendic 15 · Cencosud 10 · SCPD 9 · Tottus 8 · Alvi 6
- ✅ **Parser OC Walmart** (Comercionet ORD_WM): `buyer` ahora captura "Información Comprador" (CD real como "6009 Centro De Distribución Lo Aguirre" / "CD 6020 El Peñón"), no "Receptor" que es BVDA. 23 OCs Walmart con backfill aplicado
- ✅ **Cálculo facturación**: `unit_price` de OC es NETO por caja en TODAS las cadenas (incluye Walmart). Fórmula: precio_unit_neto = round(unit_price_caja / unidades_por_caja); neto_línea = unidades_totales × precio_unit_neto; ILA = neto × ila_rate (variable por SKU); IVA = (neto + log) × 0.19. Garantiza que la factura SII impresa cuadre exacto.
- ✅ **Módulo Costos y Rappel**: costos por trimestre, acuerdos rappel por cadena
- ✅ **Módulo Finanzas** (fase 1): línea de crédito, historial de cargas, cargador de seguros
- ✅ **Listado NV** con KPIs reactivos, filtros y paginación
- ✅ **RLS Supabase aplicado en todas las 43 tablas públicas** (Fase 0→4): helper `current_role_name()` SECURITY DEFINER, políticas por rol; audit_log append-only; vista `v_stock_available` con security_invoker. Activar leaked password protection en Auth dashboard pendiente (manual)
- ⏳ Resto de módulos (Despacho, Stock) — placeholder con badge "Pronto"
- ⏳ Finanzas fase 2: cartolas bancarias + conciliación de pagos

## Convenciones críticas

- **Paleta del sistema** (en `globals.css` via `@theme`): bg-base/surface/muted/subtle, ink/ink-2/ink-3, line/line-2, wine/wine-2/wine-text, pos/neg/warn/orange/info (+ `-soft` variantes), ch-walmart/cencosud/smu/tottus/other. Usar clases Tailwind estáticas (no interpoladas).
- **Inter font** en home y módulo Supermercados; el resto del dashboard mantiene Fraunces/Instrument/JetBrains.
- **`warm.css` en `@layer base`**: las reglas de `.warm { color: var(--text) }` y resets de `a`/`button`/`input` deben estar dentro de `@layer base { ... }`. Sin esto, ganan en cascade sobre utilidades Tailwind (`text-white`, `bg-wine`) y los botones wine aparecen con texto negro. Fallback: `style={{ color: "#fff" }}` inline.
- **Casts de joins Supabase**: usar `as unknown as TipoEsperado` (PostgREST infiere relaciones FK como arrays incluso si conceptualmente son 1:1). Cast directo rompe build de prod aunque dev funcione.
- **`tsc --noEmit` antes de push**: cuando agregaste nuevos SELECT con joins. Vercel falla con TS2352 si no lo respetás.
- **Tailwind v4 clases estáticas**: NO usar interpolación como `bg-${tone}`. Definir maps `TONE_BG = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" }` y usar `TONE_BG[tone]`. Si no, las clases no se generan en el build.
- **`unit_price` de OC**: SIEMPRE es neto por caja (Cencosud, Walmart, Tottus, SMU). Verificado contra factura real OC 3251101692. NO desbrutar.
- **Precio unitario en facturación**: redondear a entero (CLP) primero y derivar el neto producto desde el unitario × cantidad_unidades, no desde `cajas × unit_price_caja`. Garantiza cuadre exacto en factura SII.
- **ILA por SKU** (no por categoría): `products.ila_rate` editable en ficha producto. 0.205 vinos, 0.315 licores fuertes, 0.10 cervezas/sin alcohol, 0.18 energéticas.
- **Margen $/%**: viene de `products.unit_cost_net` (cargable via Excel o CRUD). Si NULL, vistas muestran "—".
- **Venta perdida**: campo `purchase_order_items.lost_sale_reason` (valores: `sin_stock` / `no_entro_cd` / `fuera_plazo` / `error_mapeo` / `otro`).
- **Cadenas de supermercado independientes**: Rendic, Alvi y SCPD son cadenas separadas en `supermarket_chains` (NO aliases de SMU), aunque Rendic Hermanos legalmente sea parte del grupo SMU. Decisión del usuario para ver desempeño por unidad operacional.
- **Parser Walmart `buyer`**: capturar "Información Comprador" del HTML Comercionet ORD_WM, NO "Receptor:" (ese es BVDA, el vendedor). Los valores reales son CDs como "6009 Centro De Distribución Lo Aguirre" o "CD 6020 El Peñón".
