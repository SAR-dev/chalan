# TODO

> **Just landed** (all gates green): zone pricing is now the single source of
> delivery pricing with no platform-wide fallback — an unpriced lane is rejected
> by name and `/dashboard` lists the gaps. The merchant weight limit was dropped
> in favour of the lane's own, plus a merchant Delivery Cities page and a
> zone × zone rate matrix.
>
> | Gate | Result |
> |---|---|
> | `pnpm ci:check` | ✅ 0 |
> | `pnpm test:coverage` | ✅ 1911 passed · 51.99 / 45.28 / 39.85 / 52.66 |
> | `pnpm build` | ✅ 0 |
> | `pnpm db:migrate` | ✅ `0000_init`, `0001_tiny_kang` (squashed) |
> | `pnpm test:integration` | ✅ 16/16 |
> | `pnpm test:e2e` | ✅ 104 passed (S1–S65, 25 files) |

---

## 1. Remove the onboarding flow

The support page now covers what onboarding told merchants, so the three-step
wizard goes away.

**What exists**

```
src/app/(onboarding)/welcome/page.tsx        ← entry after email verification
src/app/(onboarding)/pickup-locations/page.tsx
src/app/(onboarding)/pricing/page.tsx        ← the "how fees work" explainer
src/app/(onboarding)/layout.tsx              ← gates the group
src/app/(onboarding)/error.tsx
```

**Remove / rewire**

- [ ] Delete the five files above.
- [ ] `merchant-shell.tsx:208-213` — drops the `!onboardingCompletedAt` redirect;
      a verified merchant lands on `/merchant` directly.
- [ ] `api/auth/verify-email/route.ts:85` — the welcome email's `dashboardUrl`
      points at `/welcome`, the onboarding entry. Repoint it at `/merchant`.
- [ ] Delete `PATCH /api/merchants/me/onboarding` + `onboarding.spec.ts` — it
      exists only to mark the step complete.
- [ ] `api/merchants/route.ts:46` selects `onboardingCompletedAt` for the admin
      list — drop it with the column (see below).
- [ ] **Decide:** does `merchant.onboardingCompletedAt` become dead? If so,
      drop the column + seed references
      (`seed-content/merchants.ts:29,72,73,180`) and migrate.
- [ ] E2E: `03-onboarding.spec.ts` (S35, 4 tests) and the
      `skipOnboardingIfNeeded` helper — remove the helper and every call site,
      or repoint them at `/merchant`.
- [ ] Re-check `hasNavPermission` / `merchantVisibleNavItems` for any
      onboarding-only hrefs.

**Move the explainer into the support page** — `(onboarding)/pricing/page.tsx`
told merchants how fees, zones and weight limits work, and item 1 of the
previous round put that detail on the pricing page instead. Make sure support
carries it too.

### Support page: make it good enough to stand alone

- [ ] Audit `merchant/support/page.tsx` (33 lines, server) +
      `features/support/components/support-page-client.tsx` (305 lines).
      Today it is a **ticket thread list** — there is no reference material on
      it at all.
- [ ] Add a permanent reference section: how delivery fees are calculated
      (zone → zone, base + per-KG above free weight), what the route weight
      limit means, where the Delivery Cities list lives, and how to read the
      rate matrix.
- [ ] Decide the shape: FAQ accordion vs tabs (Tickets | How pricing works) vs
      a link out to `/merchant/pricing`.
- [ ] Keep the existing ticket flow intact — this is additive.

---

## 2. Item type, rider weight, and vehicle assignment

This one still needs design thought before any code. Split into four parts.

### 2a. Merchants submit an item type at order creation

- [ ] Add `order.itemType` (column + enum or free text — **open, see below**).
- [ ] `CreateOrderInput` + `orderCreateSchema` in `src/lib/validation.ts`.
- [ ] Order form field (`merchant/orders/new/page.tsx`, `parcel-card.tsx`).
- [ ] CSV import: header in `bulk-import/template.tsx`, parse in
      `csv-parse.ts`, resolve in `resolve-rows.ts`, plus the template CSV and
      its spec fixtures.
- [ ] Surface it everywhere an order is read: order table columns, order
      detail, warehouse intake/dispatch, rider screens.

> **Open:** enum or free text? (If it ever drives pricing, filtering or
> reporting, an enum is much easier to aggregate on — but it has to be a list
> merchants will actually pick from.) Does it affect pricing, or is it purely
> descriptive?

### 2b. Riders see item type and weight

- [ ] `parcelWeightKg` already exists on `order`; item type arrives with 2a.
- [ ] Show both on `rider/pickup` and `rider/delivery` — the rider needs to
      know what they are collecting and how heavy it is.
- [ ] Confirm the rider list endpoints already return both fields; add them if
      not.

> **Open:** is this just visibility, or does it become a verification step
> ("confirm the parcel is a 3 kg electronics item")? That changes whether it
> needs an API write or only a read.

### 2c. Vehicles — net-new concept

The `rider` table has **no vehicle field at all** today (`id, name, email,
phone, zone, address, nid*, status, isActive, taskType, warehouseId,
approvedBy/At, createdAt, updatedAt`).

- [ ] Schema: add a vehicle to `rider` — **open** (below).
- [ ] Admin UI to set it: rider management list + rider detail
      (`dashboard/riders/*`) and/or `features/riders/dialogs/*`.
- [ ] Also settable when a rider application is approved.
- [ ] Migration + seed update.

> **Open:** one vehicle per rider, or a pool a rider can be assigned from? Is
> it just a plate/type, or does it carry capacity (which would then constrain
> what parcels they can take — see 2d)?

### 2d. The assignment dialog shows the rider's vehicle

- [ ] `features/orders/dialogs/assign-pickup-rider-dialog.tsx` and
      `bulk-assign-pickup-rider-dialog.tsx` — show the vehicle beside each
      rider.
- [ ] Backend: `POST /api/orders/bulk/assign-pickup-rider` and the single
      assign endpoint need to return the vehicle with the rider list.
- [ ] The admin should be able to see the parcel's item/weight and the rider's
      vehicle in the same view before choosing.

> **Open:** is the vehicle purely an aid ("see it and pick"), or does it
> **filter** the eligible riders — e.g. a parcel over a size limit cannot go to
> a rider whose vehicle cannot carry it? The wording suggests an aid first;
> filtering is a natural follow-up but changes the endpoint contract.

---

## 3. Admin pricing: matrix and list, toggleable

Merchants already get the matrix (`features/platform-config/components/zone-rate-matrix.tsx`,
9 unit tests + E2E S65). The admin page is list-only.

**What exists**

- `src/app/dashboard/zone-pricing/zone-pricing-client.tsx` — `DataTable` with
  Route / Base / Extra per KG / Free / COD / Max weight, **editable** via
  `CreateZonePricingDialog` + `useZonePricing().upsertPricing`.
- `ZoneRateMatrix` — read-only, rows = pickup zone, columns = delivery zone.

**Do**

- [ ] Render `ZoneRateMatrix` on the admin page alongside the existing table.
- [ ] Add a toggle between the two views.
- [ ] Make sure the matrix shows the same rate fields the list does, or links
      through to editing that lane.

> **Open:** should cells open `CreateZonePricingDialog` for that lane (making
> the matrix editable), or stay read-only with editing only in the list?
> **Open:** which view is the default, and should the choice persist? The
> `DataTable` already persists column state in `localStorage`, so that is the
> pattern to follow.

---

## 4. Keep DataTable rows visible while refreshing

**The problem:** the table blanks to skeleton rows on every refresh, which
looks like data loss.

**Diagnosis — two separate mechanisms, only one of them behaves:**

- `src/components/data-table/index.tsx:743` — `loading && !bulkLoading` renders
  `TableSkeletonRows`, **replacing every row**. This is what the user sees.
- `index.tsx:654` already has the right behaviour: a translucent overlay
  (`bg-background/60` + spinner) drawn **over** the existing rows. But it is
  gated on `bulkLoading || refreshing`, and `refreshing` is internal toolbar
  state set only by the manual refresh button (`index.tsx:850-851`). No other
  load path ever reaches it.
- `src/lib/hooks/fetcher.ts` `swrOptions` has **no `keepPreviousData`**, so a
  page/size/filter change drops `data` before the next response lands.

**33 call sites** pass `loading={isLoading}` — dashboard, merchant, warehouse,
rider and `features/*` tables alike. Hence "all instances".

**Do**

- [ ] In `data-table/index.tsx`, show the overlay instead of skeleton rows
      **whenever rows already exist**; keep `TableSkeletonRows` for a genuine
      first load with nothing to show.
- [ ] Add `keepPreviousData: true` to `swrOptions` (or opt in per hook) so
      `data` never collapses to `undefined` mid-revalidate.
- [ ] Audit the 33 `loading={isLoading}` call sites for `data={data ?? []}`,
      which silently renders an empty table while fetching.
- [ ] Unit tests in `components/data-table.spec.tsx`: rows are still in the
      DOM while `loading` is true with prior data, and skeletons appear when
      there are none.
- [ ] Confirm the empty state never flashes during a refresh.

> **Open:** the current overlay dims rows + spinner. Worth deciding whether a
> small "Refreshing…" label makes it clearer that the data is stale rather than
> broken — but the overlay is a good starting point.

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

## Verification

- [ ] `pnpm ci:check`
- [ ] `pnpm test:coverage` (floors: 49 / 42 / 37 / 50 global, stricter for
      `src/lib/**` and `src/app/api/**`)
- [ ] `pnpm db:generate` + `pnpm db:migrate`
- [ ] `pnpm build`
- [ ] `INTEGRATION_DATABASE_URL=… pnpm test:integration`
- [ ] `pnpm test:e2e`

**Local note:** this machine has 14 logical cores but little free RAM, so the
suite's default worker count can starve it — 60 s timeouts and
`Failed to start forks worker` errors in files unrelated to the change. If that
happens, re-run with `pnpm exec vitest run --coverage --maxWorkers=4`; the
committed `vitest.config.ts` is deliberately left alone because CI is
unaffected.
