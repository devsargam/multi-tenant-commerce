# PRD: Database Schema — Scalable Commerce

**Status:** Phase 0 implemented (schema + migrations scaffolded; route handlers still in-memory)
**Owner:** Sargam Poudel
**Last updated:** 2026-05-14
**ORM decision:** Drizzle ORM on `node-postgres` (native `pg` driver)

---

## 1. Context

`scalable-commerce` is a Turborepo monorepo with:

- `apps/api` — Express 5 API (currently in-memory products CRUD)
- `apps/web` — Next.js storefront
- `apps/admin-web` — Vite + React admin console (products CRUD UI)

The API currently uses an in-memory `Map` for products. We need a persistent database to back the admin and storefront across all ecommerce domains (catalog, inventory, customers, orders, payments, fulfillment).

## 2. Goals

- Define the full data model required to support a production ecommerce admin and storefront.
- Be specific enough that an ORM schema (Prisma / Drizzle) can be generated directly from this document.
- Establish conventions (money, timestamps, soft deletes, snapshots) that all future tables must follow.
- Stage the rollout so the existing `apps/admin-web` Products page is the first thing wired up.

## 3. Non-goals

- Picking the ORM / migration tool (tracked as an open question).
- Authentication implementation details (covered separately).
- Search infrastructure (Postgres FTS is enough for v1).
- Multi-store / multi-tenant support (deferred).
- Multi-currency price lists (deferred; orders snapshot currency).

## 4. Assumptions

- **Database:** PostgreSQL 15+ (JSONB, `gen_random_uuid()`, enums, `citext`, `generated` columns).
- **Stack:** Node.js + TypeScript. ORM choice deferred.
- **Scale target v1:** ≤ 100k products, ≤ 1M orders/year — single primary, no sharding.

## 5. Conventions (apply to every table)

| Concern | Rule |
|---|---|
| Primary key | `id uuid` default `gen_random_uuid()` |
| Timestamps | `created_at timestamptz` and `updated_at timestamptz` on every table |
| Soft delete | `deleted_at timestamptz null` on user-visible entities only |
| Money | `*_cents int` (integer minor units) + `currency char(3)`. **Never** float |
| Slugs | Lowercase, hyphenated, unique within scope (`products.slug`, `categories.slug`) |
| Enums | Postgres `enum` types for fixed sets — not free-text strings |
| Audit | `created_by`, `updated_by` (FK → `admin_users`) where it matters |
| Snapshots | Orders copy address + line item price/name. Never join "live" data for historical orders |
| JSONB | Use sparingly for extensible metadata (`metadata jsonb`); indexed fields should be real columns |

---

## 6. Schema

### 6.1 Catalog

#### `products`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | |
| name | text | |
| description | text | markdown, long-form |
| short_description | text | for cards |
| status | enum(`draft`,`active`,`archived`) | |
| brand_id | uuid FK → brands | nullable |
| default_variant_id | uuid FK → product_variants | nullable, for "starting price" |
| tax_class_id | uuid FK → tax_classes | nullable |
| seo_title, seo_description | text | nullable |
| metadata | jsonb | |
| created_at, updated_at, deleted_at | timestamptz | |

#### `product_variants`
The buyable unit. SKU/price/stock live here, not on `products`.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK → products | ON DELETE CASCADE |
| sku | text unique | |
| barcode | text | UPC/EAN, nullable |
| name | text | e.g. "Black / Large" |
| price_cents | int | |
| compare_at_price_cents | int | strike-through "was" price |
| cost_cents | int | for margin |
| currency | char(3) default `'USD'` | |
| weight_grams | int | shipping calc |
| dimensions | jsonb | `{length, width, height, unit}` |
| position | int | display order |
| is_default | bool | |
| created_at, updated_at | timestamptz | |

#### `product_options` / `product_option_values` / `variant_option_values`
Configurable axes (Size, Color).

- `product_options(id, product_id FK, name, position)`
- `product_option_values(id, option_id FK, value, position)`
- `variant_option_values(variant_id FK, option_value_id FK)` — composite PK

#### `product_images`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| product_id | uuid FK | |
| variant_id | uuid FK | nullable, for variant-specific imagery |
| url | text | |
| alt | text | |
| position | int | |
| width, height | int | nullable |

#### `categories`
Tree-shaped via self-referencing `parent_id`.

`(id, parent_id null FK self, slug unique, name, description, image_url, position)`

#### `product_categories`
M:N join. `(product_id, category_id)` composite PK.

#### `tags` / `product_tags`
Flat labels. `tags(id, slug unique, name)`, `product_tags(product_id, tag_id)`.

#### `brands`
`(id, slug unique, name, logo_url, description)`

### 6.2 Inventory

#### `inventory_locations`
`(id, name, address jsonb, is_default)` — warehouses or physical stores.

#### `inventory_items`
| Field | Type | Notes |
|---|---|---|
| variant_id | uuid FK | |
| location_id | uuid FK | |
| on_hand | int | physical stock |
| reserved | int | held by pending orders |
| available | int generated | `on_hand - reserved` |
| reorder_point | int | nullable |
| PK | (variant_id, location_id) | composite |

#### `inventory_movements`
Append-only ledger.

`(id, variant_id, location_id, delta int, reason enum(purchase, sale, adjustment, return, transfer), reference_type, reference_id, note, created_by, created_at)`

### 6.3 Customers

#### `customers`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | citext unique | |
| email_verified_at | timestamptz | nullable |
| phone | text | nullable |
| first_name, last_name | text | |
| password_hash | text | nullable (guest checkout) |
| accepts_marketing | bool | |
| default_billing_address_id | uuid FK → addresses | nullable |
| default_shipping_address_id | uuid FK → addresses | nullable |
| metadata | jsonb | |
| created_at, updated_at | timestamptz | |

#### `addresses`
`(id, customer_id FK, label, first_name, last_name, company, line1, line2, city, region, postal_code, country char(2), phone, is_default_billing, is_default_shipping)`

### 6.4 Cart & Order

#### `carts`
`(id, customer_id null FK, session_token text, currency, subtotal_cents, status enum(active, abandoned, converted), expires_at, created_at, updated_at)`

Guest carts use `session_token`. Abandoned-cart sweeper uses `(status, expires_at)`.

#### `cart_items`
`(id, cart_id FK, variant_id FK, quantity int, unit_price_cents int, metadata jsonb)` — snapshot price at add-to-cart time.

#### `orders`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| number | text unique | human-readable, e.g. `#1042` |
| customer_id | uuid FK | nullable for guest |
| email | citext | always captured |
| status | enum(`pending`,`paid`,`fulfilled`,`shipped`,`delivered`,`cancelled`,`refunded`) | |
| payment_status | enum(`unpaid`,`authorized`,`paid`,`partially_refunded`,`refunded`,`failed`) | |
| fulfillment_status | enum(`unfulfilled`,`partial`,`fulfilled`) | |
| currency | char(3) | |
| subtotal_cents | int | items pre-discount/tax/shipping |
| discount_total_cents | int | |
| tax_total_cents | int | |
| shipping_total_cents | int | |
| total_cents | int | grand total |
| billing_address | jsonb | snapshot, not FK |
| shipping_address | jsonb | snapshot, not FK |
| notes | text | customer-facing |
| internal_notes | text | admin-only |
| placed_at | timestamptz | |
| cancelled_at | timestamptz | nullable |

#### `order_items`
`(id, order_id FK, variant_id FK, sku, name, quantity, unit_price_cents, total_cents, tax_cents, discount_cents, metadata)` — denormalize `sku`/`name` so orders survive product deletion.

#### `order_events`
Timeline for the admin order detail page.

`(id, order_id FK, type enum(created, paid, shipped, ...), payload jsonb, created_by, created_at)`

### 6.5 Payments

#### `payments`
`(id, order_id FK, provider text, provider_payment_id text, amount_cents, currency, status enum(pending, authorized, captured, failed, refunded), method enum(card, paypal, bank, cod, ...), card_last4, captured_at, raw_response jsonb)`

#### `refunds`
`(id, payment_id FK, order_id FK, amount_cents, reason text, status, created_by, created_at)`

### 6.6 Shipping

#### `shipments`
`(id, order_id FK, location_id FK, carrier, tracking_number, tracking_url, status enum(pending, in_transit, delivered, returned), shipped_at, delivered_at)`

#### `shipment_items`
`(shipment_id FK, order_item_id FK, quantity int)`

#### `shipping_zones` / `shipping_rates`
- `shipping_zones(id, name, countries text[])`
- `shipping_rates(id, zone_id FK, name, type enum(flat, weight, price_based), price_cents, min_weight, max_weight, min_subtotal, max_subtotal)`

### 6.7 Discounts

#### `discounts`
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | text unique | nullable for auto-applied |
| type | enum(`percentage`,`fixed_amount`,`free_shipping`) | |
| value | int | percent (0–100) or cents |
| starts_at, ends_at | timestamptz | |
| usage_limit | int | nullable |
| usage_limit_per_customer | int | nullable |
| min_subtotal_cents | int | nullable |
| applies_to | enum(`all`,`products`,`categories`) | |

#### `discount_redemptions`
`(discount_id FK, order_id FK, customer_id FK, amount_cents)` — enforces limits.

### 6.8 Tax

- `tax_classes(id, name)` — e.g. "Standard", "Reduced", "Zero".
- `tax_rates(id, tax_class_id FK, country char(2), region text, rate numeric(5,4), name)` — e.g. CA-ON 0.1300 "HST".

### 6.9 Reviews

#### `product_reviews`
`(id, product_id FK, customer_id FK null, rating smallint check 1..5, title, body, status enum(pending, approved, rejected), created_at)`

### 6.10 Admin & Audit

#### `admin_users`
`(id, email unique, password_hash, name, role enum(owner, admin, manager, staff), last_login_at, is_active, created_at)`

#### `admin_sessions`
`(id, admin_user_id FK, token_hash, ip, user_agent, expires_at)`

#### `audit_logs`
`(id, admin_user_id FK, entity_type text, entity_id uuid, action enum(create, update, delete), diff jsonb, created_at)`

---

## 7. Indexes

| Table | Index |
|---|---|
| products | `(status)`, `(slug)`, GIN on `metadata` (if filtered) |
| product_variants | `(product_id)`, `(sku)` |
| orders | `(customer_id)`, `(status)`, `(placed_at desc)`, `(number)` |
| order_items | `(order_id)`, `(variant_id)` |
| inventory_items | composite PK already covers it |
| carts | `(session_token)`, `(customer_id)`, `(status, expires_at)` |
| customers | `(email)` covered by unique |
| discount_redemptions | `(discount_id, customer_id)` |

---

## 8. Rollout phases

Each phase ships an admin-web page backed by real data.

| Phase | Tables | Admin surface |
|---|---|---|
| 1 | products, product_variants, product_images, categories, product_categories, brands | Products list/detail (already scaffolded) |
| 2 | inventory_locations, inventory_items, inventory_movements | Inventory page |
| 3 | customers, addresses | Customers page |
| 4 | carts, cart_items, orders, order_items, order_events | Orders page |
| 5 | payments, refunds, shipments, shipment_items, shipping_zones, shipping_rates | Order detail actions |
| 6 | discounts, discount_redemptions, tax_classes, tax_rates | Promotions / Settings |
| 7 | admin_users, admin_sessions, audit_logs, product_reviews | Settings / Reviews |

## 9. Open questions

1. ~~**ORM:** Prisma, Drizzle, Kysely, or raw `pg` + `node-pg-migrate`?~~ **Resolved: Drizzle ORM + `node-postgres`.** See §11.
2. **Hosting:** Local Postgres in `docker-compose.yml` (done for dev), managed in prod TBD (Neon / Supabase / RDS).
3. **Multi-currency:** Defer; orders snapshot a single `currency`.
4. **Multi-store / multi-tenant:** Defer; no `store_id` column added.
5. **Search:** Postgres FTS for v1; evaluate Meilisearch/Typesense later.
6. **File storage:** Where do product images live? (S3 / R2 / local volume.) Affects `product_images.url`. **Still open.**
7. **Soft delete scope:** Currently only `products`. Decide whether to extend to customers/orders.

## 10. Acceptance criteria

- Every table conforms to Section 5 conventions.
- Schema can be initialized from a single migration sequence with no manual SQL.
- `apps/api` Products endpoints return identical shapes to today after migration (no breaking change to `apps/admin-web`).
- Seed script populates ≥ 1 row per table for local dev.
- All foreign keys have explicit `ON DELETE` behavior (cascade, set null, or restrict — chosen per table).

---

## 11. Implementation (Phase 0 — done)

The schema and migration tooling are live in `apps/api`. Route handlers still use the in-memory store; the next step is to port them onto Drizzle (tracked in §12).

### 11.1 Stack

| Concern | Choice | Why |
|---|---|---|
| ORM | **Drizzle ORM** (`drizzle-orm`) | SQL-first, no runtime codegen, snake_case via `casing` option, typed `pgTable` defs |
| Driver | **`node-postgres`** (`pg.Pool`) | Native, well-supported, works with Drizzle's `drizzle-orm/node-postgres` adapter |
| Migrations | **`drizzle-kit`** | `generate` produces SQL; `migrate.ts` applies it via `drizzle-orm/node-postgres/migrator` |
| Env loading | **`dotenv`** | Reads `apps/api/.env` for `DATABASE_URL` |

### 11.2 File layout

```
apps/api/
├── .env.example                  # DATABASE_URL, PORT
├── drizzle.config.ts             # drizzle-kit config (snake_case, ./drizzle out dir)
├── drizzle/
│   ├── 0000_low_jubilee.sql      # generated: 35 tables, 16 enums, 472 lines
│   └── meta/                     # drizzle-kit snapshot for incremental diffs
└── src/db/
    ├── client.ts                 # pg.Pool + drizzle({ casing: "snake_case" })
    ├── migrate.ts                # CREATE EXTENSION citext + apply migrations
    └── schema/
        ├── _shared.ts            # citext customType, timestamps + softDelete mixins
        ├── enums.ts              # every pgEnum from §5
        ├── brands.ts
        ├── tax.ts
        ├── products.ts           # products, product_variants, product_options, *_values, product_images
        ├── categories.ts         # categories (self-referencing), product_categories, tags, product_tags
        ├── inventory.ts          # inventory_locations, inventory_items (generated `available`), inventory_movements
        ├── customers.ts          # customers, addresses
        ├── orders.ts             # carts, cart_items, orders, order_items, order_events
        ├── payments.ts           # payments, refunds
        ├── shipping.ts           # shipments, shipment_items, shipping_zones, shipping_rates
        ├── discounts.ts          # discounts, discount_redemptions
        ├── reviews.ts            # product_reviews (rating BETWEEN 1 AND 5)
        ├── admin.ts              # admin_users, admin_sessions, audit_logs
        └── index.ts              # barrel: `export * from "./..."`
```

### 11.3 Convention → Drizzle mapping

How each rule from §5 is enforced in code:

| Convention | Drizzle implementation |
|---|---|
| `id uuid` default `gen_random_uuid()` | `uuid("id").primaryKey().defaultRandom()` |
| `created_at` / `updated_at` | `timestamps` mixin in `_shared.ts` — both `timestamptz NOT NULL DEFAULT now()` |
| `deleted_at` | `softDelete` mixin (currently only spread into `products`) |
| Money as cents | `integer("price_cents")` etc.; never `numeric`/`real` for money |
| `citext` email | `customType` in `_shared.ts`; used by `customers.email`, `orders.email`, `admin_users.email` |
| Enums | `pgEnum(...)` in `enums.ts`, imported by table files |
| Snake-case columns | `drizzle({ casing: "snake_case" })` in client + `drizzle.config.ts` |
| Explicit `ON DELETE` | `.references(() => other.id, { onDelete: "cascade" \| "set null" \| "restrict" })` on every FK |
| Generated column | `inventory_items.available` uses `.generatedAlwaysAs(sql\`on_hand - reserved\`)` |
| Check constraints | `product_reviews` adds `check("...", sql\`rating BETWEEN 1 AND 5\`)` |
| Indexes | Per-table config callback returns `{ name: index("...").on(t.col) }` |
| JSONB | `jsonb("metadata").$type<Record<string, unknown>>()` for type-safe payloads |

### 11.4 Migration commands

All run from repo root, scoped to `api`:

```bash
pnpm --filter api db:generate   # diff schema → new SQL in apps/api/drizzle/
pnpm --filter api db:migrate    # apply pending migrations (also CREATE EXTENSION citext)
pnpm --filter api db:push       # push schema directly (dev convenience, skips migration files)
pnpm --filter api db:studio     # open Drizzle Studio against DATABASE_URL
```

Workflow: edit a `src/db/schema/*.ts` file → `db:generate` → commit the new SQL file under `drizzle/` → `db:migrate` to apply.

### 11.5 Local infrastructure

`docker-compose.yml` now defines a `postgres` service:

- Image: `postgres:16-alpine`
- Credentials: `postgres` / `postgres`, db `scalable_commerce`
- Port: `5432:5432`
- Volume: `postgres-data` (persistent across `compose down`)
- Healthcheck: `pg_isready` — `api` waits for it via `depends_on.condition: service_healthy`
- `api` service now receives `DATABASE_URL=postgres://postgres:postgres@postgres:5432/scalable_commerce`

For host-machine dev (running `pnpm --filter api dev` outside docker), point `DATABASE_URL` at `localhost:5432`. Copy `apps/api/.env.example` to `apps/api/.env`.

### 11.6 TypeScript notes for future contributors

- **`noUncheckedIndexedAccess` is off** in `apps/api/tsconfig.json` only. Drizzle's table-proxy types in the index/check callback (`(t) => ({ ... })`) aren't compatible with that strict flag. Localized to this package; the shared `@repo/typescript-config/base.json` still enables it.
- Schema files use **`.js` extensions on relative imports** (`import { ... } from "./_shared.js"`) because `module: NodeNext` requires explicit extensions even in `.ts` source.
- Self-referencing FKs (e.g. `categories.parent_id`, `customers.default_billing_address_id` → `addresses.id` cycle) use Drizzle's `(): AnyPgColumn =>` callback pattern to break the type cycle.

### 11.7 Verification

- `pnpm --filter api check-types` — clean
- `pnpm --filter api build` — clean
- `pnpm --filter api db:generate` — emits `drizzle/0000_low_jubilee.sql` with **35 `CREATE TABLE`** and **16 `CREATE TYPE`** statements (matches PRD §6 exactly)

---

## 12. Next steps

| # | Task | Notes |
|---|---|---|
| 1 | Apply migration to a running Postgres | `docker compose up postgres -d && pnpm --filter api db:migrate` |
| 2 | Add `src/db/seed.ts` | Re-create the in-memory demo data (products, customer, cart) as DB rows |
| 3 | Port `apps/api/src/index.ts` route handlers to Drizzle queries | Phase 1 of §8 — products first, response shapes must stay identical for `admin-web` |
| 4 | Decide on file storage for `product_images.url` (§9, Q6) | Blocks variant-image upload UI in admin-web |
| 5 | Add a `customer/order/admin` seed once those handlers are ported | Hits §10 acceptance criterion on per-table seeds |
