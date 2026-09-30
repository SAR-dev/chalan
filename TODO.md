# TODO

> **Status: all three items implemented and through every gate.**
>
> | Gate | Result |
> |---|---|
> | `pnpm ci:check` | ✅ 0 |
> | `pnpm test:coverage` | ✅ **1911 passed** / 184 files · 51.99 / 45.28 / 39.85 / 52.66 (floors 49 / 42 / 37 / 50) |
> | `pnpm build` | ✅ 0 |
> | `pnpm db:migrate` | ✅ `0003` (platform rates), `0004` (`merchant.maxWeightKg`) |
> | `pnpm test:integration` | ✅ 16/16 |
> | `pnpm test:e2e` | ✅ **104 passed** (S1–S65, 25 files) |

## Context

Zone pricing is the single source of delivery pricing: one `zone_pricing` row
per **ordered** lane (fromZone → toZone), with no platform-wide fallback. An
unpriced lane is rejected with an error that names the pair, and `/dashboard`
shows a coverage checklist of the pairs still missing. These three items carry
that decision through to the merchant-facing product.

---

## 1. Delivery Zone Pricing owns the weight limit ✅

A parcel's maximum weight comes from the lane's `zone_pricing.maxWeightKg`
**only** — a merchant has no separate weight limit.

- **(decided)** Dropped `merchant.maxWeightKg` entirely — column, code and UI.
- **(decided)** Deleted `PUT /api/merchants/[id]/pricing`, its dialog and the
  merchant-detail "Pricing" action; the cap was their only field.
- **(decided)** At pickup on an *unpriced* lane there is no cap: the corrected
  weight is accepted and the fee stays on the creation-time snapshot.

### Done

- [x] `merchant.maxWeightKg` removed from the schema; migration `0004` is one
      statement: `ALTER TABLE "merchant" DROP COLUMN "maxWeightKg"`.
- [x] Order create, bulk create, approve and pickup re-price all read
      `zone_pricing.maxWeightKg`. The **approve** guard re-reads the lane,
      because an admin may have lowered the rate since creation.
- [x] CSV import no longer validates weight at parse time — the limit depends
      on *both* endpoints of a row, neither known while parsing one cell. It is
      reported from the preview through `messagesFor`, so it blocks at the same
      stage as an unpriced lane, and lands in the error CSV.
- [x] `PUT /api/merchants/[id]/pricing`, `pricing-dialog.tsx`, the
      "Set weight limit" menu item, `merchantWeightLimitSchema` and
      `MerchantWeightLimitInput` deleted.
- [x] Admin table/detail, order table, order detail and the approve dialog
      resolve the lane through `features/orders/lane-weight.ts`, which mirrors
      `resolveRoutePricing`'s origin-zone join — so "over limit" means exactly
      what the server means.
- [x] `ParcelCard` lost its `maxWeightKg` prop; it now reads `row.maxWeightKg`.

### Notes

- **Pickup on an unpriced lane has no cap at all.** There is nothing left to
  fall back on (`order` has no `maxWeightKg` column), and blocking an in-flight
  parcel was judged the worse failure. Covered by
  *"accepts a corrected weight on an unpriced lane, keeping the snapshot fee"*.
- **This reverses the earlier choice** to seed new merchants at the 3 KG column
  default — that default disappeared with the column. New merchants are limited
  by whatever lane they ship on.
- Regression guard: `validation.spec.ts` →
  `"merchant has no per-merchant weight limit"` asserts
  `"maxWeightKg" in merchant === false`, pinning the column against coming back.

---

## 2. Merchant: Delivery Cities ✅

A read-only view of what the platform covers, grouped by zone.

- **(decided)** `/merchant/delivery-cities`, own sidebar entry after *Pricing*,
  owner-only — **not** a moderator grant.

### Done

- [x] Route + `MERCHANT_SIDEBAR` entry (after *Pricing*) and added to
      `MERCHANT_OWNER_ONLY_HREFS`.
- [x] Grouped **from the cities, not the zone list**, so an active city on a
      zone we could not load still appears rather than silently vanishing; an
      unknown zone renders as "Unassigned".
- [x] Search matches city **or** zone name; an unmatched query says so rather
      than rendering an empty box. Shows `x of y` when filtered.
- [x] Loading and error states (the two SWR hooks fail independently).
- [x] Per-zone city counts, mobile-friendly, browse-only.
- [x] `data-testid`s + `deliveryCities.merchant*` selectors in `e2e/selectors.ts`.
- [x] E2E **S64**: sidebar discoverability, zone grouping, search narrowing,
      zone-name search, empty state.
- [x] Unit: the entry sits directly after *Pricing*, is not grantable, and
      **a stale grant is not enough** — `hasNavPermission` still refuses.

> This page reads the same public endpoints the order form uses, so there is no
> merchant API to gate — the nav rules are its *only* protection. That is why
> the owner-only claim has an explicit unit test rather than relying on the
> sidebar being hidden.

---

## 3. Merchant Pricing Page: zone × zone matrix ✅

- **(decided)** Cell = **base rate**; selecting a cell reveals the rest of the
  lane (extra per KG, free weight, COD %, cancellation fee).

### Done

- [x] `features/platform-config/components/zone-rate-matrix.tsx` replaces the
      flat table. Rows = pickup zone, columns = delivery zone.
- [x] **Directional** — labelled "Pickup zone" (row axis) and "Delivery zone"
      (column axis) in a two-row header, so it cannot be misread as symmetric.
- [x] Unpriced pairs render a muted em dash with `data-priced="false"` and
      `aria-label="…: not configured"` — never `0 TK`.
- [x] Detail panel for the selected lane; clicking again clears it.
- [x] Sticky row axis during horizontal scroll; empty state when no rates.
- [x] Unit tests (9) cover pricing, directionality, the unpriced lane, the
      detail panel, deselect, empty state and the unknown-zone fallback.
- [x] E2E **S65**: a seeded lane's base rate, the detail on select, both axis
      labels, and the reverse lane priced as its own cell.
- [x] `pricing.zoneMatrix*` selectors added; no stale selectors left behind.
- [x] The fee estimator, "How charges work" and "Weight limit" cards all still
      render.

> **Open (default in force):** rows and columns are the union of the *sides* of
> the loaded rates, so a zone with no rates at all does not appear. A gap only
> shows when both zones already appear elsewhere. Showing *all* active zones —
> with all-dash rows — is a deliberate alternative; the admin-side coverage
> checklist on `/dashboard` reports those gaps instead.

---

## Rough edges worth a future pass

- [ ] `/dashboard/settings` returns `null` while `/api/platform-config` loads,
      so the page renders **blank** for a moment. It cannot show a truthful
      toggle before the config arrives, so the guard is intentional — but a
      skeleton would be kinder. (This is what made S63 flaky at 5 s; the test
      now waits for the response instead.)
- [ ] `getByTestId` matches the testid **value exactly** and does not parse CSS.
      To address an element by two attributes use `container.querySelector`
      (`zone-rate-matrix.spec.tsx` shows the pattern), not
      `getByTestId("a[data-b='c']")`.
- [ ] `reuseExistingServer` is `true` locally, so a stray `pnpm start` makes
      Playwright **skip `db:seed:full`**. Stop any running server before
      `pnpm test:e2e` or tests may pass against stale data.

## Verification

- [x] `pnpm ci:check`
- [x] `pnpm test:coverage`
- [x] `pnpm build`
- [x] `pnpm db:migrate` + `INTEGRATION_DATABASE_URL=… pnpm test:integration`
- [x] `pnpm test:e2e`

**Local note:** this machine has 14 logical cores but little free RAM, so the
suite's default worker count can starve it — 60 s timeouts and
`Failed to start forks worker` errors in files unrelated to the change. If that
happens, re-run with `pnpm exec vitest run --coverage --maxWorkers=4`; the
committed `vitest.config.ts` is deliberately left alone because CI is
unaffected.
