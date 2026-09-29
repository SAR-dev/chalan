# TODO

Two tracks:

- **Track A — Project audit.** Fixes and improvements from a full read of the
  repo (security, correctness, performance/DB, tests/CI, code quality, docs).
- **Track B — Prepaid packages.** The feature that is still in flight.

Items are ordered by severity inside each section and cite the evidence
(`file:line`). Tick them off as they land.

---

# Track A — Project audit

## A0. Blockers (do these first)

- [x] **The unit suite is red right now.** `src/app/__tests__/ci-workflow.spec.ts:25`
      fails (`expected '' not to be ''`) because the `e2e` job in
      `.github/workflows/ci.yml:152` is commented out — `jobBlock("e2e")` finds no
      `  e2e:` key. Either re-enable the job or delete/replace the guard test;
      do not leave the suite failing.
- [ ] **Rotate the Neon password (the URL itself is already gone).**
      The live `neondb_owner` connection string has been removed from
      `.github/workflows/ci.yml` (both env vars now point at the job's own
      Postgres service), so it is no longer in the working tree. It is still in
      **git history**, so the password must be rotated and the history purged.
- [x] **Stop running the integration job against a shared remote database.**
      `ci.yml:121-134` starts a `postgres:17` service that nothing uses; the
      migrate + integration steps hit Neon instead. Point both env vars at
      `postgres://postgres:postgres@localhost:5432/delivery`.
- [x] **Fix the commented-out `e2e` block's indentation** while you are in there:
      `.github/workflows/ci.yml:152+` uses a column-0 `#  e2e:` prefix with a
      mojibake comment (`â€”`), unlike the rest of the file.

## A1. Security & authorization

- [x] **R2 storage exposes private folders.** `src/lib/storage/r2.ts:57-73` returns
      `R2_PUBLIC_URL/<path>` for every folder; the local driver enforces
      owner-only access for `nids`/`avatars` (`src/app/uploads/[...path]/route.ts:43-53`)
      but R2 has no equivalent. `.env.vercel` points at a public `pub-*.r2.dev`
      domain, so NID scans/selfies are world-readable. Serve private folders via
      short-lived presigned URLs through an authenticated route, or hard-fail at
      boot when a public URL would expose them.
- [x] **Enforce merchant moderator grants server-side everywhere.**
      `hasNavPermission` (`src/lib/nav-config.ts:335-344`) is only checked in
      `payouts/route.ts:191`, `merchants/[id]/route.ts:90` and the moderators
      routes. A moderator granted only "Support" can still create/cancel orders
      and change NID via the API: `api/orders/route.ts:188-193`,
      `api/orders/bulk/route.ts`, `features/orders/transitions.ts:510-515`,
      `api/merchants/[id]/nid/route.ts:34-39`, `api/support/route.ts:114-116`,
      `api/pickup-locations/route.ts:109-115`. Add a shared
      `requireMerchantGrant(me, href)` and call it in each.
- [x] **Add `failClosed: true` to anonymous rate-limited routes.**
      `rateLimitByIp` returns no limit when the IP is unresolvable unless
      `failClosed` is set (`src/lib/rate-limit.ts:231-242`), and
      `resolveClientIp` returns `null` when `TRUSTED_PROXY_HOPS` is unset
      (`src/lib/client-ip.ts:84-91`) — the documented default. Missing on
      `api/uploads/token/route.ts:11`, `api/rider-applications/route.ts:35`,
      `api/orders/[id]/receiver-note/route.ts:21`.
- [x] **Verify the pickup location belongs to the calling merchant.**
      `api/orders/route.ts:242` and `api/orders/bulk/route.ts:95-103` resolve the
      location's warehouse but never check `pickupLocation.merchantId === me.merchantId`,
      so a merchant can book against another merchant's shop address.
- [x] **Re-verify email when a merchant changes it.**
      `api/merchants/[id]/route.ts:170-184` writes `merchant.email` and the Better
      Auth `user.email` while leaving `emailVerifiedAt` set — an unverified
      address keeps "verified" status and bypasses the change-email flow
      (`src/lib/auth.ts:98-103`). Clear the flag and re-issue a token, or route
      through Better Auth.
- [x] **`/api/users/me` skips the account-state gate.**
      `api/users/me/route.ts:85,134` call `auth.api.getSession()` directly, so a
      deactivated (`isActive=false`) account with a live session can still read
      its profile and PATCH name/avatar/phone. Use
      `requireSessionForAccountState()` / `requireSession()`.
- [x] **Apply the CSRF origin check to bodyless mutations.**
      `isAllowedOrigin` only runs inside `parseBody` (`src/lib/validation.ts:49-57`),
      so approve/suspend/reactivate/ban/unban/activate/`active` and every DELETE
      (packages, zone-pricing, delivery-cities/zones, mail-config) rely on
      `SameSite=Lax` alone. Export `requireAllowedOrigin(req)` and call it at the
      top of each mutating handler.
- [x] **Broaden the admin IP allowlist.** `src/proxy.ts:150-151` matches only
      `/dashboard` and `/api/admin`, so `/api/payouts`, `/api/team`,
      `/api/packages`, `/api/audit-logs`, `/api/email-logs`,
      `/api/announcements`, `/api/rider-applications` and
      `/api/merchants/[id]/balance` are unprotected.
- [x] **Bound the mail-config SSRF and stop echoing SMTP errors.**
      `api/admin/mail-config/test/route.ts:30-45` connects to an arbitrary
      admin-supplied host/port and returns the raw SMTP error. Restrict the host
      and return a generic message (log the detail).
- [x] **Tighten `isAllowedOrigin`'s Host trust.** `src/lib/csrf.ts:27-32` always
      adds origins derived from the request's own URL/Host; when
      `NEXT_PUBLIC_SITE_URL` is unset this weakens the check. Use configured
      origins only.
- [x] **Stop shipping `trackingToken` in list projections.**
      `src/lib/db/order-columns.ts:14` (via `ORDER_CORE_COLUMNS`, used at
      `api/orders/route.ts:131`) sends the receiver-note write capability for
      orders a warehouse admin has no relationship with. Include it only in
      owner-scoped detail responses.
- [x] **Prevent banning peer Super Admins.**
      `api/admin/users/[id]/ban/route.ts:37-39` only blocks self-ban, so any
      SUPER_ADMIN can ban the others.
- [x] **Rate-limit mail-triggering endpoints.**
      `api/merchants/[id]/verify-email/route.ts:57-77`,
      `api/team/[id]/resend-activation/route.ts`,
      `api/merchants/[id]/moderators/[userId]/resend-activation/route.ts` send
      mail with no throttle.
- [ ] **Authenticate before buffering the body** in the bulk transition routes
      (`api/orders/bulk/{approve,dispatch,cancel,receive,settle-cod,assign-pickup-rider}/route.ts`
      call `parseBody` before `applyBulkOrderTransition` checks the session).
- [ ] **Remove `.env.vercel` from the working tree** (untracked local file — left
      in place; delete it when you no longer need it). The demo-mode hardening
      half is **done**: `isDevModeEnabled()` now also requires
      `NODE_ENV !== "production"`.

## A2. Correctness & data integrity

- [x] **Stop swallowing non-JSON responses in mutation hooks.**
      `src/features/orders/hooks/use-orders.ts:231,263` (`createOrder`,
      `createOrders`) call `await res.json()` with no `.catch()`, unlike every
      sibling hook. A 502/HTML error throws, and
      `src/app/merchant/orders/new/page.tsx:202-223` has no `try/finally`, so the
      submit button stays disabled forever. Same bare pattern in
      `use-payouts.ts:118,137,178,216`, `use-merchant-balance.ts:61,79,101,120`,
      `use-delivery-cities.ts:54,73`, `use-delivery-zones.ts:45,64`,
      `use-zone-pricing.ts:45`, `use-email-logs.ts:47`. Standardise on
      `res.json().catch(() => null)` (shared `parseJson(res)`) + `try/finally`.
- [x] **Write audit rows in the transaction they belong to.**
      `api/packages/[id]/request/route.ts:99-106` and
      `api/admin/package-requests/[id]/route.ts:66-73,139-150` call `logAudit`
      without the `tx`, so an audit row can survive a rolled-back transaction and
      it consumes a second pooled connection.
- [ ] **Remove MJML compilation from inside transactions.**
      `api/merchants/route.ts:296-301`, `api/merchants/[id]/approve/route.ts:81-85`,
      `api/team/route.ts:172-180`, `api/team/[id]/resend-activation/route.ts:52-60`,
      `api/merchants/[id]/moderators/route.ts:178-186` render templates
      (`src/lib/mail-templates.ts:94`) while holding row locks. Render before
      opening the transaction and pass `{subject, html}` into `enqueueEmail`.
- [x] **Establish one lock order to remove a deadlock.** Payout creation locks
      `merchant_balance` → `order` (`api/payouts/route.ts:211-233`) while order
      transitions lock `order` → balance (`features/orders/transitions.ts:850-901`).
- [x] **Give paginated lists a stable default `ORDER BY`.** Routes apply
      `orderBy` only when `?sort=` is present (`api/orders/route.ts:171-177`,
      `api/merchants/route.ts:187-193`, `api/riders/route.ts:167-173`,
      `api/payouts/route.ts:160-166`, `api/warehouses/route.ts:48-54`,
      `api/admin/users/route.ts:62-68`, `api/team/route.ts:78-84`,
      `api/pickup-locations/route.ts`), so OFFSET paging can repeat or skip rows.
      Default to `desc(createdAt), desc(id)`.
- [x] **Type the Better Auth session list honestly.**
      `src/features/account/components/account-settings.tsx:150` does
      `data as unknown as Session[]` against a locally-invented interface; derive
      the type from `authClient.listSessions()` instead.
- [ ] **Replace the non-null-assertion cluster.** `biome.json:44` disables
      `noNonNullAssertion` and ~30 `!` uses follow, several before the null guard
      (`api/orders/route.ts:232`, `api/payouts/route.ts:215,226,250`,
      `api/riders/route.ts:81`, and the order dialogs). Narrow with a local const
      and re-enable the rule incrementally.

## A3. Performance & database

- [ ] **Default the page limit.** `parsePagination` returns `limit: undefined`
      when `?limit` is absent (`src/lib/pagination.ts:38-47`), and every list
      route only applies `.limit()` when defined — so omitting the param returns
      the whole table. This is the single highest-leverage fix; it affects ~14
      routes.
- [ ] **Stop `DataErrorBanner` from firing unbounded fetches.**
      `src/lib/hooks/use-data-error.ts:23-72` issues 10 bare-key SWR calls on
      every portal mount (`dashboard-shell.tsx:16-26`, `warehouse-shell.tsx:16-21`,
      `merchant-shell.tsx:32-35`, `rider-shell.tsx:15-20`), which combined with the
      item above pulls entire tables per page load. Use `?limit=1` probes or only
      the current page's resource.
- [ ] **Batch the bulk order transition loop.**
      `features/orders/transitions.ts:1003-1053` does per-row UPDATE + financials
      + audit + status history (≈400-600 round trips for a 100-order batch) while
      holding every row lock, and the guards (`:107-114,155-159,200-204,255-259`)
      query `db` instead of `tx`. Use set-based `UPDATE ... WHERE id IN (...)`,
      hoist shared merchant/rider lookups, pass `tx` to the guards, and write
      audits/history as one multi-row insert.
- [ ] **Batch bulk payout settlement.** `api/payouts/bulk/mark-paid/route.ts:40-63`
      loops `settlePayoutAsPaid` (~5 queries each) plus N separate `logAudit`
      writes inside one transaction.
- [ ] **Project columns in SSR list pages.** `dashboard/orders/page.tsx:18`,
      `dashboard/merchants/page.tsx:19`, `dashboard/orders/[code]/page.tsx:20,28,29`,
      `dashboard/merchants/[id]/page.tsx:20`, `dashboard/support/page.tsx:19`,
      `dashboard/warehouses/page.tsx:18` and the three support pages use
      `select()` (all columns) and ship the result as `initialData`, bypassing the
      lean projections the API routes use.
- [ ] **Add the missing composite indexes for the default list sorts.**
      `order (merchantId, createdAt)`, `order (warehouseId, createdAt)`,
      `order (deliveryRiderId, createdAt)`, `order (pickupRiderId, createdAt)`,
      `payout_request (merchantId, requestedAt)`, `merchant (status, createdAt)` —
      the existing composites lead with `status`, which breaks the sort.
- [ ] **Drop the redundant single-column indexes** on `order`
      (`order_merchant_id_idx`, `order_warehouse_id_idx`, `order_status_idx`) and
      on `payout_request`/`balance_transaction`, which are already covered as
      leading columns of their composites
      (`src/lib/db/schema.postgres/orders.ts:206-226`, `finance.ts:76-84`).
- [ ] **Use `dbRead` for all read paths** — `api/admin/zone-pricing/route.ts:5`,
      `api/admin/delivery-cities/route.ts:5`, `api/admin/delivery-zones/route.ts:5`,
      `api/platform-config/route.ts:6`, `api/riders/[id]/route.ts:6`,
      `api/team/[id]/warehouse/route.ts:12` use the write pool — and size
      `readPool` like `pool` (`src/lib/db/index.ts:25-30`).
- [ ] **Size the pool for the deployment target.** `src/lib/db/index.ts:12-17` uses
      `max: 20` with no serverless guard (up to 20×N connections).
- [ ] **Lazy-load `mjml`.** `src/lib/mail-templates.ts:1` is pulled into almost
      every route via `auth.ts` → `api-auth.ts`, so a heavy dependency is
      evaluated for the whole API surface. Use `await import("mjml")` inside the
      template functions.
- [ ] **Parallelise the analytics aggregates.** `api/orders/analytics/route.ts:74,86,96,129`
      run four sequential queries sharing one `where`.
- [ ] **Push JS-side filters into SQL.** `api/packages/route.ts:30-36`
      (`isActive` filter) and `api/announcements/active/route.ts:53-55` (role
      filter, also unbounded) fetch then filter in JS.
- [ ] **Invalidate cross-resource SWR caches after order mutations.**
      `use-orders.ts:177-182,237-242` only invalidate `/api/orders*`, so merchant
      balance and package quota go stale after create/deliver/cancel.
- [ ] **Dynamic-import the heavy client pieces.** No `next/dynamic` anywhere;
      recharts is statically pulled into the client home page
      (`src/app/merchant/page.tsx:13`), and `papaparse`
      (`merchant/orders/import/import-client.tsx:12`) and all dialogs are eagerly
      bundled.

## A4. Tests & CI

- [ ] **Spec `src/proxy.ts` and un-exclude it from coverage.**
      `vitest.config.ts:39` hides a 290-line security module (role isolation,
      portal 404s, upload rate limiting, IP allowlist, CSP nonce) from both the
      gate and the suite. Cover the redirect/404/429/CSP/`x-pathname` cases.
- [ ] **Spec the untested security/scope helpers:** `src/lib/csrf.ts`
      (no origin case in `validation.spec.ts`), `src/lib/db/order-scope.ts`
      (warehouse visibility predicate), `src/lib/cron-auth.ts` (wrong secret,
      unset secret), `src/lib/hooks/use-table-filters.ts` (`buildTableUrl`),
      `src/lib/db/order-lookup.ts`, `src/lib/db-helpers.ts`, and
      `src/lib/payout-settlement.ts` (the `not_found`/`not_approved`/`no_orders`
      branches).
- [ ] **Make the retry-fragile e2e tests idempotent.**
      `e2e/specs/12-payouts.spec.ts:34,40-47` consumes the seeded APPROVED payout,
      so a CI retry (`retries: 2`) fails with the wrong error; and
      `e2e/specs/22-packages.spec.ts:158-196` asserts `activePackage` count 0 for
      MERCHANT_3 before creating one. Create the fixtures inside the tests (as
      `12-payouts.spec.ts:143` already does) or reset state in `beforeEach`.
- [ ] **Remove vacuous assertions.** `e2e/specs/02-business-flows.spec.ts:70-73`
      asserts `toBeGreaterThanOrEqual(0)` (always true);
      `e2e/specs/20-typed-counts.spec.ts:47` asserts `Object.keys(...).length > 0`
      instead of the known key set; and ~33 e2e tests assert only
      `getByRole("heading").first()` after login, which passes on a broken page —
      assert one tagged, page-specific element instead.
- [ ] **Convert the remaining text/role selectors on taggable elements** to
      `data-testid` (policy: AGENTS.md, e2e section): `01-core-flows.spec.ts:38,46`
      (options), `02-business-flows.spec.ts:70` (button), `08-email.spec.ts:154,218`
      (toasts — the `[data-sonner-toast]` helper already exists),
      `09-bulk-import.spec.ts:137,140`, `10-activation.spec.ts:284,312`,
      `22-packages.spec.ts:152`, `03-onboarding.spec.ts:44` (`text=Dashboard`),
      `01-core-flows.spec.ts:192`.
- [ ] **Add per-directory coverage floors.** `vitest.config.ts:45-50` is global
      only, so `src/lib/db/seed/**` (≈60 untested files, counted in the
      denominator) can be 0% while the headline number passes. Exclude the seeds
      (or test their content) and add glob thresholds for `src/lib/**` and
      `src/app/api/**`, then re-baseline.
- [ ] **Strengthen the auth-guard check.** `src/app/api/route-auth-guard.spec.ts:23-29,97-114`
      is string-presence only — a route with `requireSession(` in a comment
      passes. Pair it with a behavioural test or an AST check, plus a negative
      fixture proving the matcher catches an ungated route.
- [ ] **Add accessibility tests.** `@axe-core/playwright` on landing, login,
      dashboard orders, and an open dialog — the app has custom dialogs, tables
      and sidebars with no automated a11y coverage.
- [ ] **Add a built-app smoke step** to the `build` job (`pnpm start` + curl
      `/api/health`, `/api/ready`, `/`, `/login`) so a broken build is caught
      without a database.
- [ ] **Consider visual regression** (`toHaveScreenshot`) for the branding preview
      and `/track/[id]`, which currently have contrast-math tests but no pixel
      coverage.
- [ ] **Add type-level tests** (`expectTypeOf`) for `transitions` update shapes,
      `validation.ts` schemas and `pagination.ts` parsers.
- [ ] **CI hygiene:** add
      `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` to
      `ci.yml` (and a serialized group for `deploy.yml`); cache
      `~/.cache/ms-playwright` keyed on the Playwright version (`ci.yml:193`);
      add a least-privilege `permissions: contents: read`; and consider dropping
      the standalone `test` job since `coverage` runs the same suite plus the gate.
- [ ] **Fix the docs drift this audit found:** `AGENTS.md:173` says the e2e suite
      is "S1-S54 across 21 files / 87 tests" — it is S1–S60, 22 files, 96 tests.

## A5. Code quality & dead code

- [ ] **Delete verified-orphan files:** `src/features/warehouses/components/warehouse-table-columns.tsx`,
      `src/features/merchants/dialogs/balance-payment-dialog.tsx`,
      `src/features/team/dialogs/team-member-dialog.tsx`,
      `src/features/orders/components/tracking-cell.tsx`,
      `src/features/orders/components/address-modal.tsx`.
- [ ] **Delete or wire up the orphan seed paths:** `src/lib/db/seed/audit-logs.ts:7`
      and `src/lib/db/seed/email-logs.ts:7` are never called by any orchestrator,
      so their `seed-content/` data is dead too.
- [ ] **Delete the unused order-column factories** (`order-table-columns.tsx:83,116,196,262,308,359,379,461,475`),
      which nothing imports, and make `useOrderColumns:518` compose
      `orderCodeColumn()`/`parcelWeightColumn()` instead of re-implementing them.
- [ ] **Delete smaller dead exports:** `constants.ts:190 BALANCE_TX_TYPE_TONES`,
      `portal-mode.ts:22 PORTAL_MODES`, `types.ts:136 MerchantBalance`,
      `types.ts:148 MerchantRegistrationInput`, `validation.ts:286 orderApproveSchema`,
      `validation.ts:505 merchantVerifyEmailSchema`,
      `hooks/use-table-filters.ts:7 TableFilters`,
      `seed-content/riders.ts:26 RIDER_IDS`,
      `order-pricing.ts:156 resolveMerchantPackageRule`,
      `use-merchants.ts:110 _replaceOne`.
- [ ] **Remove the dead `RESOURCE_KEYS` entry** `"/api/security-config"`
      (`src/lib/hooks/fetcher.ts:18`) — no such route exists, so an unscoped
      `useDataError()` would always error — and fix the stray `\` typo at
      `fetcher.ts:25`.
- [ ] **Extract `replaceContentKeywords`** — byte-identical in
      `src/app/faq/page.tsx:16`, `src/app/help/[slug]/page.tsx:29`,
      `src/app/privacy/page.tsx:14`, `src/app/terms/page.tsx:14`.
- [ ] **Centralise the duplicated formatters** (`formatDate` ×7, `formatTimestamp`
      ×3, `formatStamp` ×2 — e.g. `dashboard/users/users-client.tsx:44`,
      `rider/earnings/page.tsx:24`, `dashboard/audit-logs/audit-logs-client.tsx:12`)
      into `src/lib/format.ts`.
- [ ] **Move the out-of-place Zod schemas into `src/lib/validation.ts`**
      (AGENTS.md rule): `api/admin/mail-config/route.ts:11`,
      `api/admin/mail-config/test/route.ts:14`,
      `api/merchants/resend-verification/route.ts:14`,
      `api/orders/bulk/assign-pickup-rider/route.ts:6`,
      `api/orders/bulk/dispatch/route.ts:6`.
- [ ] **Use `logger` in the cron routes** instead of `console.log`
      (`api/cron/cleanup-sessions/route.ts:47`, `cleanup-audit-logs/route.ts:47`,
      `cleanup-email-logs/route.ts:48`, `drain-email-outbox/route.ts:24`,
      `cleanup-uploads/route.ts:74,97,119`).
- [ ] **Extract the two inline dialogs** in
      `src/features/pickup-locations/components/pickup-locations-manager.tsx:255,375`
      into `dialogs/`, and use `ConfirmDialog` for the delete path (AGENTS.md:
      every dialog in its own file; destructive actions use a confirmation).
- [ ] **Deduplicate the 12 identical error boundaries** (`src/app/error.tsx:15`,
      `global-error.tsx:14`, and each portal's `error.tsx`) into one shared
      `<ErrorFallback>` that logs through `logger`.
- [ ] **Decide on the list pages that skip the DataTable pattern**
      (`dashboard/packages/page.tsx:237`, `dashboard/settings/page.tsx`,
      `delivery-zones/delivery-zones-client.tsx`, `zone-pricing/zone-pricing-client.tsx`,
      `delivery-cities/delivery-cities-client.tsx`): convert to
      `useTableFilters` + `serverPaginated`, or document them as exceptions.
- [ ] **Remove the unused `cross-env` devDependency** (`package.json:89`).

## A6. Docs & DX

- [ ] **Resolve the 67 dangling `ROADMAP` references** in `src/**` (e.g.
      `src/lib/balance-ledger.ts:2`, `src/lib/logger.ts:1`, `src/lib/api-auth.ts:14`)
      — no `ROADMAP*` file exists. Restore the document or inline the rationale.
- [ ] **Fix the missing doc link** `CONTRIBUTING.md:574` → `docs/CSV-IMPORT.md`
      does not exist (bulk import is now built — document it or drop the link).
- [ ] **Correct `AGENTS.md`'s domain count** — it says "12 domains" but
      `src/features/` has 15 (`packages`, `support`, `users` are unlisted).
- [ ] **Delete the tracked `config.yml`** (Cloudflare tunnel UUID) — not a secret,
      but it does not belong in the repo.
- [ ] **Link `TODO.md` from `CONTRIBUTING.md`/`AGENTS.md`** so the backlog is
      discoverable.

---

# Track B — Prepaid packages

## Goal

Merchants can browse packages, request a purchase, and pay **manually** (bKash /
bank transfer). An admin confirms the payment and the package (a prepaid
**bundle**) activates: it discounts the delivery fee and carries an order quota
that drains as the merchant ships.

## Decisions (locked)

- **Wallet = the existing `merchant_balance`.** No second balance table. Credit =
  negative balance, amount due = positive. Top-ups reuse the existing
  `PAYMENT_PENDING` → `PAYMENT_CONFIRMED` manual-confirmation flow
  (`src/app/api/merchants/[id]/balance/payment/route.ts`).
- **Guard scope = bundles-only for v1.** No global "block orders when credit is
  low". Postpaid billing stays as-is; bundles are the prepaid part.
- **Purchase = request → admin approval.** Merchant requests a package; admin
  confirms the manual transfer; approval activates the bundle.
- **Admin can still assign a package directly** (ops override / comped deals).
- **Bundles adjust the delivery fee only.** COD and cancellation fees are
  unchanged; no new ledger transaction types.
- **Price is snapshotted onto the request** in `package_purchase_request.amount`
  (migration **0009**), so editing `pricing_package.price` later cannot change
  what an already-requested purchase is worth. Approval credits the wallet with a
  `PAYMENT_CONFIRMED` row (`paymentMethod: "PACKAGE"`).
- **Bundles are quota-only — no expiry.** A bundle stays active until its quota
  is used up or an admin ends it; no `expiresAt` column.
- **No stacking while active, one request at a time.** A merchant cannot request
  while a bundle is active or another request is `PENDING` (a settled request is
  history, not a lock). Approval defensively deactivates any leftover bundle.

## Phase 6b — Wallet / Top-ups tab + request top-up

Top-up history already exists in the append-only `balance_transaction` ledger
(`type` `PAYMENT_PENDING` → `PAYMENT_CONFIRMED`, or `REJECTED` with a reason),
returned by `GET /api/merchants/[id]/balance` (`balance/route.ts`). Reusing
`merchant_balance` keeps it — this phase is UI + submission, not new storage.

- [ ] Merchant finance page: **Wallet / Top-ups tab** — filter the existing
      transaction feed to payment rows (`PAYMENT_PENDING` / `PAYMENT_CONFIRMED`
      / rejected), columns: date, amount, method, account, note, status,
      reviewedBy
- [ ] Merchant finance page: show **Available credit** (`-min(balance, 0)`) and
      **Awaiting confirmation** (`pendingBalance`)
- [ ] **Request top-up** dialog (amount, method, account, note) → reuses
      `POST /api/merchants/[id]/balance/payment` (manual transfer; one PENDING
      at a time)
- [ ] Show pending top-up state + the rejection reason when declined
- [ ] Admin: pending top-up review queue on the merchant balance page (confirm /
      reject already implemented: `balance/payment/[txId]/confirm|reject`)
- [ ] Reuse the same top-up flow to fund package purchases (link from the
      Packages page / purchase dialog)

## Phase 7 — Admin UI

- [ ] Assign-package action on the merchant row/detail (reuse action-menu
      pattern; `ConfirmDialog`)

## Phase 8 — Merchant UI

- Rebuild `/merchant/pricing`:
  - [ ] calculator (reuse `DeliveryFeeCalculator`)
  - [ ] zone rate card matrix
- [ ] `DeliveryFeeCalculator` — add optional `packageRule` prop
- [ ] `quoteParcel()` (`features/orders/quote-parcel.ts`) — add optional
      `packageRule` so the order-form preview matches the charge

## Phase 9 — Tests

- [ ] Integration: partial unique indexes, snapshot FK `set null`
- [ ] E2E (next serial **S61**): cancel/return refunds quota; bulk create
      spanning a tier boundary. S58–S60 already cover admin CRUD, request →
      approve → active bundle, rejection not locking the merchant out, and
      quota / next-tier progress
- [ ] Keep coverage floors (48/41/37/49); raise after

## Definition of done

- [ ] Ledger reconciliation invariant still holds with a bundle applied
- [ ] Concurrency test: two creates at a tier boundary
- [ ] No change to ledger transaction types
