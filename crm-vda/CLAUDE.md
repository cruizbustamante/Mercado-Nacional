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

Ver el commit log como referencia más actualizada. En grandes rasgos al 2026-05-24:

- ✅ Auth + dashboard layout + home rediseñado (cards-dashboard con stats live)
- ✅ Login rediseñado split editorial 40/60
- ✅ Data maestra: cargadores Excel (clientes, productos, seguros) + CRUDs modal
- ✅ **Emisión NV** completa con cálculo replicado de Apps Script + PDF + persistencia
- ✅ **Módulo Supermercados** completo:
  - Route group propio sin sidebar
  - 4 tabs: Cumplimiento (dashboard) · Análisis comercial · Órdenes · Alertas
  - Detalle OC con parallel/intercepting routes (modal sin perder filtros)
  - Editor de facturas inline + bulk + sidebar conciliación
  - Mapeo DUN→SKU (1 fila = 1 DUN, auto-remap)
  - Alertas accionables auto-calculadas
  - Mobile responsive (tablas → cards verticales en <900px)
- ✅ Cargador de **seguros** corregido: `applyInsurance` recibe `ApplyInput` directo en vez de re-procesar FormData
- ✅ **Módulo Finanzas** (fase 1): línea de crédito por cliente, historial de cargas, cargador de seguros integrado
- ⏳ Resto de módulos (Despacho, Stock) — solo placeholder, todavía sin implementación
- ⏳ Finanzas fase 2: cartolas bancarias + conciliación de pagos

## Convenciones críticas

- **Casts de joins Supabase**: usar `as unknown as TipoEsperado` (PostgREST infiere relaciones FK como arrays incluso si conceptualmente son 1:1). Cast directo rompe build de prod aunque dev funcione.
- **`tsc --noEmit` antes de push**: cuando agregaste nuevos SELECT con joins. Vercel falla con TS2352 si no lo respetás.
- **Margen $/%**: viene de `products.unit_cost_net` (cargable via Excel cargador productos o CRUD individual). Si está NULL, las vistas muestran "—".
- **Venta perdida**: campo `purchase_order_items.lost_sale_reason` (manual, valores: `sin_stock` / `no_entro_cd` / `fuera_plazo` / `error_mapeo` / `otro`).
