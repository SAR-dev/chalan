# TODO

> **Just landed** (all gates green): onboarding is gone — its fee/zone/weight
> explainer now lives permanently on the merchant support page. Merchants can
> state an item type on their orders (single or CSV), riders are shown what they
> are collecting, admins record a rider's vehicle (settable at approval) which
> shows in the assign dialogs, the admin zone-pricing page has a list/matrix
> toggle (list default), and data tables keep their rows on screen while
> refreshing instead of blanking to skeletons.
>
> | Gate | Result |
> |---|---|
> | `pnpm ci:check` | ✅ 0 |
> | `pnpm test:coverage` | ✅ 1955 passed · 52.96 / 46.01 / 40.79 / 53.68 |
> | `pnpm build` | ✅ 0 |
> | `pnpm db:migrate` | ✅ `0000_init`, `0001_tiny_kang`, `0002_tricky_ulik` |
> | `pnpm test:integration` | ✅ 16/16 |
> | `pnpm test:e2e` | ✅ 109 passed (S1–S66, 26 files) |

---

## 1. Remove the onboarding flow ✅

The support page now covers what onboarding told merchants, so the three-step
wizard goes away.

**Done**

- [x] Deleted the five `(onboarding)` files (git rm + this round).
- [x] `merchant-shell.tsx` — dropped the `!onboardingCompletedAt` redirect; a
      verified merchant lands on `/merchant` directly.
- [x] `api/auth/verify-email/route.ts` — the welcome email's `dashboardUrl` now
      points at `/merchant`.
- [x] Deleted `PATCH /api/merchants/me/onboarding` + `onboarding.spec.ts`.
- [x] `api/merchants/route.ts` + `api/merchants/[id]/route.ts` no longer select
      `onboardingCompletedAt`.
- [x] **`merchant.onboardingCompletedAt` was dead** — dropped the column, the
      seed values (plus a leftover `maxWeightKg` field the fresh seed choked on)
      and migrated it in `0002_tricky_ulik`.
- [x] E2E: `03-onboarding.spec.ts` was **renamed** `03-merchant-registration.spec.ts`
      (S35, 4 tests) rather than deleted, so suite numbers keep no gaps;
      `skipOnboardingIfNeeded` and all 10 call sites are gone.
- [x] Re-checked `hasNavPermission` / `merchantVisibleNavItems` — no
      onboarding-only hrefs remained.

### Support page: reference material ✅

- [x] `support-reference.tsx` — 8 native `<details>` disclosures covering fee
      calculation (zone × zone, base + per-KG above allowance, directional,
      locked at creation), the **real** rejection sentence rendered by calling
      `pricingUnavailableMessage("no-pricing-for-lane", …)` so the wording can
      never drift, the lane-owned weight limit, reading the matrix (em dash =
      not configured, not free), delivery cities, COD earnings, prepaid vs COD,
      and what to do if still stuck.
- [x] Rendered **merchant-only** in `support-page-client.tsx`, guarded by
      `!isAdmin && currentUser?.role === "MERCHANT"` and covered by wiring tests
      (reverting the conditional fails one).

---

## 2. Item type, rider weight, and vehicle assignment ✅

Decisions taken: **item type is free text** (descriptive, never touches
pricing); **one vehicle per rider** (type + optional plate, no capacity);
**vehicle in the assignment dialog is a display aid**, not a filter; **2b is
read-only visibility**, not a verification step.

### 2a. Merchants submit an item type at order creation ✅

- [x] `order.itemType` — nullable text, 60 chars, trimmed; blank → `NULL`.
- [x] `CreateOrderInput` + `itemTypeField()` on `orderCreateSchema`.
- [x] Order form field in `parcel-card.tsx`, with copy that states plainly it
      does not affect the fee.
- [x] CSV import: `item_type` added to `orderImportHeaders` (optional, position 7),
      7 new forgiving aliases, prefilled in the template, mapped in
      `resolve-rows.ts` and round-tripped by `row-to-parcel.ts`.
- [x] Read surfaces: `ORDER_CORE_COLUMNS` (so every list/detail picks it up),
      `itemTypeColumn()` on the shared order lists and warehouse dispatch, the
      detail panel, and `riderParcelColumn()` on the rider queues.

### 2b. Riders see item type and weight ✅

- [x] `riderParcelColumn()` on **both** `rider/pickup` and `rider/delivery` —
      weight and contents as one cell, because they are one decision.
- [x] Rider endpoints already returned both fields (`ORDER_CORE_COLUMNS`).

### 2c. Vehicles — net-new concept ✅

- [x] Schema: `rider.vehicleType` (text column, `riderVehicleTypes` enum hint
      covering FOOT/BICYCLE/BIKE/CAR/VAN/PICKUP_TRUCK) + `rider.vehiclePlate`
      (20 chars, normalized upper-case, space-stripped). Both nullable.
- [x] Admin UI: `edit-rider-dialog` picker (plate only for plate-bearing
      vehicles), a `vehicle` column on the rider list, and a Vehicle row on the
      rider detail — each saying "Not recorded" rather than showing a gap.
- [x] Also settable when a rider application is approved
      (`riderApproveSchema` + the approve dialog, which resets the fields per
      applicant so one rider's bike cannot leak onto the next).
- [x] Migration `0002_tricky_ulik` + seed: 3 of 30 riders get a vehicle, the
      other 27 deliberately have none.
- [x] `riderVehicleLabel()` / `hasRiderVehicle()` in `vehicle-label.ts` — null
      when nothing is declared, distinct from "on foot".

> **Resolved bug:** `riderVehiclePlateSchema`'s `.transform()` used to
> materialise `vehiclePlate: null` on *every* parse, so renaming a rider would
> have silently erased their vehicle. The transform now passes `undefined`
> through, and `validation.spec.ts` pins it.

### 2d. The assignment dialog shows the rider's vehicle ✅

- [x] Both `assign-pickup-rider-dialog.tsx` and
      `bulk-assign-pickup-rider-dialog.tsx` show a vehicle line per rider with a
      "No vehicle recorded" fallback, plus a Contents row carrying the parcel's
      item type — vehicle and contents in the same view before choosing.
- [x] Backend already returned the rider list; no endpoint contract change.

---

## 3. Admin pricing: matrix and list, toggleable ✅

- [x] `ZoneRateMatrix` renders on the admin page alongside the existing table.
- [x] Toggle sits **above** the card, not inside the table toolbar — inside the
      toolbar it would vanish the moment the matrix was selected, stranding the
      admin with no way back. Covered by a test.
- [x] **List is the default**: it is the only view carrying the row actions, and
      an admin arriving here is most often here to add, edit or delete a rate.
- [x] Matrix stays **read-only**; it is a coverage audit ("which lanes am I
      missing?"), not an edit surface.
- [x] `ZoneRateMatrix`'s `rates` prop was widened to the fields it actually
      reads, so the merchant estimate feed and the admin `zone_pricing` rows
      both render it with no casts.
- [x] The matrix is gated on `isLoading` so it cannot claim there are no rates
      while the first fetch is still running.

---

## 4. Keep DataTable rows visible while refreshing ✅

- [x] `data-table/index.tsx` — `showSkeletonRows` only when there is nothing to
      show (`loading && !bulkLoading && visible.length === 0`); a refresh
      overlay (`Loader2` + "Refreshing…", `data-testid="table-refreshing-<id>"`,
      `aria-busy` on the `<Table>`) draws over existing rows otherwise.
- [x] `swrOptions` gained `keepPreviousData: true`, so `data` never collapses
      to `undefined` mid-revalidate.
- [x] `isRefreshing` (= SWR `isValidating`) added to ~19 table-backing hooks;
      ~32 call sites use `loading={isLoading || isRefreshing}`. Feature hooks'
      `isLoading` semantics were deliberately **not** changed — card-style
      consumers would otherwise blank on revalidation.
- [x] `data-table.spec.tsx` — 6 refresh tests; 10 page specs rewritten from
      "shows loading state" to "keeps rows on screen while refreshing".
- [x] Empty state cannot flash: with prior data present the overlay, not the
      empty message, is what renders.

---

## Rough edges (carry-over)

- [ ] `/dashboard/settings` renders `null` while `/api/platform-config` loads,
      so the page is briefly blank. The guard is intentional (it cannot show a
      truthful toggle before the config arrives), but a skeleton would be
      kinder.
- [ ] `getByTestId` matches the testid value **exactly** and does not parse CSS.
      To address an element by two attributes use `container.querySelector`
      (`zone-rate-matrix.spec.tsx` has the pattern).
- [ ] `reuseExistingServer` is `true` locally, so a stray `pnpm start` makes
      Playwright **skip `db:seed:full`**. Stop any running server before
      `pnpm test:e2e`, or tests may pass against stale data.
- [ ] A `docs/CSV-IMPORT.md` still does not exist — `bulk-import/template.tsx`
      refers to sections of it (§3.2, §3.4, §6, §7) that were never written.
      `item_type` should be part of that write-up, but writing the spec is its
      own piece of work, not a follow-up to this one.

## Verification

- [x] `pnpm ci:check`
- [x] `pnpm test:coverage` (floors: 49 / 42 / 37 / 50 global, stricter for
      `src/lib/**` and `src/app/api/**`)
- [x] `pnpm db:generate` (no further changes) + `pnpm db:migrate`
- [x] `pnpm build`
- [x] `INTEGRATION_DATABASE_URL=… pnpm test:integration`
- [x] `pnpm test:e2e`

**Local note:** this machine has 14 logical cores but little free RAM, so the
suite's default worker count can starve it — 60 s timeouts and
`Failed to start forks worker` errors in files unrelated to the change. If that
happens, re-run with `pnpm exec vitest run --coverage --maxWorkers=4`; the
committed `vitest.config.ts` is deliberately left alone because CI is
unaffected.

**PowerShell note:** `pnpm … *>$null; $LASTEXITCODE` is the reliable way to get
an exit code — several tools here write progress to stderr, which PowerShell
surfaces as `NativeCommandError` even on success. Integration tests read
`INTEGRATION_DATABASE_URL` from `.env`'s `DATABASE_URL`; without it the whole
suite skips rather than failing.
