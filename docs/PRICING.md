# Pricing — Merchant Pricing Page & Packages

> Plan (forward-looking). Describes the merchant **Pricing** page and the
> **packages** feature that drives it. Nothing here is implemented yet.

---

## 1. Goal

Give a merchant one page (`/merchant/pricing`) that answers "what will I be
charged, and what deals do I have?":

1. **Assigned package** — the merchant's active package, current tier, quota
   usage, and what happens next.
2. **Pricing calculator** — a live estimate for a route/weight/COD, with the
   package rule applied so the number matches the real charge.
3. **Zone pricing** — the full zone-to-zone rate card (the single source of
   fees).
4. **Available packages** — the catalog of packages the platform offers
   (admin-assigned; read-only here).

## 2. Non-goals

- No merchant self-purchase/payment flow — packages are **assigned by an admin**
  (decided).
- No change to the ledger model: `ORDER_CHARGE` keeps using the final
  `deliveryFee`, so balances, returns and payouts stay correct automatically.

## 3. Current state

- Fees come from the **zone-pair matrix** (`zone_pricing`), with
  `platform_config` defaults as the fallback — resolved by
  `resolveRoutePricing()` (`src/lib/order-pricing.ts`), shared by order creation
  and the pickup re-pricing.
- Merchants carry only `maxWeightKg`; per-merchant rate fields were removed.
- The merchant page today (`src/app/merchant/pricing/page.tsx`) only shows the
  weight limit + a short explainer.
- Public data already exists: `/api/zone-pricing`, `/api/delivery-cities`,
  `/api/platform-pricing` (hooks in `src/features/platform-config/hooks/`).
- The reusable calculator is `src/components/delivery-fee-calculator.tsx`.

## 4. Packages — model

Packages are a **merchant-level pricing overlay** on the zone matrix, limited by
an order quota. Example: *"first 100 orders at a flat 50, next 100 at 2% off."*

### 4.1 Tables

| Table | Columns |
|-------|---------|
| `pricing_package` | `id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt` |
| `pricing_package_tier` | `id`, `packageId` FK, `sortOrder`, `orderCount` (int), `ruleType` (`FLAT` \| `PERCENT_OFF`), `ruleValue` (numeric 14,2) |
| `merchant_package` | `id`, `merchantId` FK, `packageId` FK, `ordersUsed` (int, default 0), `startedAt`, `isActive`, `assignedBy` |

- One **active** `merchant_package` per merchant (partial unique index on
  `merchantId WHERE isActive`).
- Example tiers: `(sortOrder 1, orderCount 100, FLAT, 50)` then
  `(sortOrder 2, orderCount 100, PERCENT_OFF, 2)`.

### 4.2 Order snapshot

Add nullable columns to `order` so the applied rule is auditable and a later
weight change re-applies the **same** rule:

`packageId`, `packageTierId`, `packageRuleType`, `packageRuleValue`.

### 4.3 Rule engine (`src/lib/packages.ts`)

- `resolveMerchantPackageRule(merchantId)` → walk the active assignment's tiers
  by cumulative `orderCount`; return `{ packageId, tierId, ruleType, ruleValue }`
  or `null` when exhausted / none assigned.
  - `ordersUsed 0–99 → FLAT 50`; `100–199 → PERCENT_OFF 2`; `≥200 → null`.
- `applyPackageRule(fee, rule)`:
  - `FLAT` → the delivery fee **is** `ruleValue` (flat 50 for any zone/weight).
  - `PERCENT_OFF` → `toPaisa(fee * (1 − ruleValue / 100))`.
- Only the **delivery fee** is adjusted; the COD fee and cancellation fee are
  unchanged (decided).

### 4.4 Order flow

- **Creation** (`src/app/api/orders/route.ts`): after `calcDeliveryCharge`,
  apply the active rule → `deliveryFee`; snapshot the rule on the order; then
  `ORDER_CHARGE = deliveryFee + codFee` as today. Weight caps still apply (a
  flat rate does not bypass `maxWeightKg`). Increment `ordersUsed` **in the same
  transaction**.
- **Pickup re-pricing** (`src/features/orders/transitions.ts`): re-apply the
  order's **snapshotted** rule to the recomputed zone fee (FLAT stays flat → no
  delta; PERCENT_OFF recomputes on the new weight).
- **Cancel / return** (`transitions.ts`): decrement the snapshotted assignment's
  `ordersUsed` (floored at 0) so the quota is refunded; the tier re-advances
  automatically.
- **Ledger**: unchanged — the final `deliveryFee` flows through `ORDER_CHARGE`
  and the existing reversal/cancellation rows.

## 5. Merchant Pricing page — design

Route: `/merchant/pricing` (nav item already exists,
`src/lib/nav-config.ts`). Sections top-to-bottom:

### 5.1 Assigned package

- Card: package name, current tier label (e.g. "Flat 50 Tk"), **quota progress**
  ("43 / 100 orders used in this tier"), a progress bar, and a preview of the
  next tier ("next 100 orders: 2% off"). Empty state when none is assigned:
  "No package assigned — standard zone rates apply."
- Data: `GET /api/merchants/me/package` (merchant-scoped) → the active
  assignment + resolved current tier + remaining count.

### 5.2 Pricing calculator

- Reuse `DeliveryFeeCalculator`, extended with an optional `packageRule` prop so
  the estimate applies the same `applyPackageRule` (FLAT/PERCENT_OFF). Shows
  delivery fee, COD fee, merchant earnings, and — when a package is active — a
  "package applied" line.
- Data: `/api/delivery-cities` + `/api/zone-pricing` (route picker),
  `/api/platform-pricing` (fallback), assigned rule from 5.1.

### 5.3 Zone pricing

- A read-only matrix (rows = origin city/zone, columns = destination), cells =
  base rate; expandable row/detail showing extra per kg, free weight, max
  weight, COD %, cancellation fee. Mirrors the public `/rates` page but framed
  as "your rate card".
- Data: `/api/zone-pricing` + `/api/delivery-cities` + `/api/delivery-zones`.

### 5.4 Available packages

- Catalog of active `pricing_package`s (name, description, tier list) with an
  "Your package" badge on the assigned one. Read-only — since an admin assigns,
  the copy is "Ask your admin to switch" (no self-serve button).
- Data: `GET /api/packages` (active packages + tiers; authenticated).

## 6. API surface

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| `GET` | `/api/packages` | any session | active packages + tiers (catalog) |
| `GET` | `/api/merchants/me/package` | merchant | assigned package + tier + quota |
| `POST`/`PATCH`/`DELETE` | `/api/admin/packages`, `/api/admin/packages/[id]` | SUPER_ADMIN | package CRUD |
| `POST` | `/api/admin/packages/[id]/tiers` (+ `[tierId]`) | SUPER_ADMIN | tier CRUD |
| `PATCH` | `/api/merchants/[id]/package` | SUPER_ADMIN | assign / clear (resets `ordersUsed`) |

Validation schemas go in `src/lib/validation.ts`
(`pricingPackageSchema`, `packageTierSchema`, `assignPackageSchema`).

## 7. Admin surface

- New **Packages** section under `/dashboard` (list + create/edit dialog with a
  repeatable tier editor) and an **Assign package** action on the merchant
  row/detail (reusing the existing merchant action menu pattern).

## 8. Files (expected)

- Schema: `src/lib/db/schema.postgres/packages.ts` (+ `orders.ts` snapshot cols),
  migration.
- Lib: `src/lib/packages.ts`, extend `src/lib/order-pricing.ts` if needed.
- API: `src/app/api/packages/`, `src/app/api/admin/packages/…`,
  `src/app/api/merchants/me/package/`, `src/app/api/merchants/[id]/package/`.
- Feature: `src/features/packages/` (hooks + dialogs), extend
  `src/components/delivery-fee-calculator.tsx`.
- Merchant page: rebuild `src/app/merchant/pricing/page.tsx`.
- Seeds: one demo package + assignment.
- Tests: unit (rule engine, tier walk, apply), API specs, e2e.

## 9. Phased implementation

1. **Schema + migration** — packages tables, order snapshot columns.
2. **Rule engine** (`src/lib/packages.ts`) + unit tests.
3. **Order creation** — apply rule, snapshot, increment quota; update
   `orders.spec.ts`.
4. **Cancel/return** — decrement quota; **pickup re-price** — re-apply snapshot.
5. **Admin API + UI** — package CRUD, tier editor, assign action.
6. **Merchant API + page** — `/api/packages`,
   `/api/merchants/me/package`, rebuild the Pricing page (5.1–5.4).
7. **Seeds + e2e** — assign → create order → adjusted fee; cancel → quota
   refunded; page sections render.

## 10. Open questions

- **Package expiry** — time-bound packages (e.g. valid 90 days) or purely
  quota-based? Current model is quota-only.
- **Tier scope** — is `ordersUsed` per assignment (reset on reassign) or
  lifetime per merchant? Proposed: per assignment.
- **Rounding** — `PERCENT_OFF` rounds to paisa via `toPaisa`; confirm a 2% off
  `65 Tk` → `63.70`.
- **Multiple simultaneous packages** — assumed **one** active at a time.
- **Cancelled-before-pickup vs returned** — both refund the quota (decided);
  confirm this also applies to admin cancellations.
