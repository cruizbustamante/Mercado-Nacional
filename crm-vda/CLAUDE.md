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
│   ├── (dashboard)/        # rutas protegidas
│   │   ├── layout.tsx      # sidebar + topbar con sesión
│   │   └── page.tsx        # home con cards de módulos
│   ├── auth/callback/      # OAuth callback de Supabase
│   ├── login/              # login + server actions
│   ├── layout.tsx          # root layout
│   └── globals.css
├── lib/
│   ├── auth.ts             # getCurrentProfile(), getUserModules()
│   ├── modules.ts          # MODULE_ICONS, MODULE_ROUTES
│   ├── nv/                 # lógica de cálculo de notas de venta
│   ├── supabase/           # client.ts, server.ts, middleware.ts
│   └── types/database.ts   # tipos TS del schema
└── middleware.ts           # auth gate (redirige a /login)
supabase/
└── migrations/
    ├── 001_initial_schema.sql
    ├── 002_seed_data.sql
    └── 003_link_auth_users_trigger.sql
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

Ver el commit log y el sidebar del dashboard como referencia más actualizada. En grandes rasgos al 2026-05-22:

- ✅ Auth + dashboard layout + home
- ⏳ Carga de data maestra (clientes, productos, categorías, marcas) — pendiente decidir si por importación de Sheets o pantallas CRUD
- ⏳ Módulo **Emisión NV** — el más importante, pendiente. Construir cuando los datos maestros estén
- ⏳ Resto de módulos (aprobador, facturador, despacho, etc.) — TBD, el usuario va a sacar varios pero no decidió cuáles
