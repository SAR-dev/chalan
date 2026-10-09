# IMPROVEMENTS

> An audit of the Chalan codebase for bugs, correctness/security risks, code
> quality and possible improvements. This is a **plan**, not a changelog: no
> code is changed by this document.
>
> **Method.** Four focused read-only audits (API layer · data layer · frontend ·
> shared lib / security / tests), followed by hand-verification of every
> high-impact finding in this file. Every item cites a `file:line` that was
> opened and read; the large "Verified clean" section at the end exists so
> future agents do not re-audit settled ground.
>
> **Re-verify before acting** — line numbers move. The codebase is unusually
> disciplined (strict TS, transactional money paths, drift-guard tests), so the
> signal below is concentrated in a handful of real bugs, plus consistency
> drift between bulk and single endpoints.
>
> Status legend: **P0** data loss / security / broken core flow · **P1** wrong
> behaviour a user can hit · **P2** quality / reliability · **P3** polish / docs.

---

## Health snapshot

| Gate | Result |
|---|---|
| `pnpm typecheck` | green |
| `git status` | clean on `develop` (`01ae1c4` merge of `main`) |
| Unit suite | **2528 passed / 45 skipped** (2573 total), 239 files + 1 skipped · 237 s |
| `console.*` in request path | none outside `logger`, `migrate.ts`, `global-error.tsx`, service-worker registration |
| `TODO`/`FIXME`/`@ts-ignore` | none actionable; the `01XXXXXXX` matches are phone placeholders |
| Concentration of risk | a few money/authorization paths and the bulk-vs-single parity gap |

The strongest observations are about **parity**: when a single-item route is
later given a bulk sibling, the bulk route tends to drop the guardrails
(transaction, validation gate, side effect, rate limit).

---

## P0 — Critical

### P0-1. `order.merchantEarnings` CHECK constraint contradicts the signed earnings model — valid orders 500

- **Where:** `src/lib/db/schema.postgres/orders.ts:373` (constraint), `src/lib/pricing.ts:135-142` (`calcMerchantEarnings`), writers at `src/features/orders/create-order.ts:227-231`, `src/app/api/orders/route.ts:393-397`, `src/app/api/orders/bulk/route.ts:318-321`, `src/features/orders/transitions.ts:482-486` and `590-594`.
- **Evidence:**
  - `calcMerchantEarnings` is documented as *"Signed on purpose: when the fees exceed the COD collected the merchant is net-negative, and clamping to 0 would hide that debt"* and returns `toPaisa(productCost - deliveryFee - codFee)`.
  - The table enforces a `check("order_merchant_earnings_nonneg", ...)` of the form `merchantEarnings >= 0`.
  - `orderCreateSchema.productCost` (`src/lib/validation.ts:313`) only requires non-negative — there is no floor against delivery+COD fees.
  - The seed works around it: `src/lib/db/seed/seed-content/orders.ts:223` computes `Math.max(0, productCost - deliveryFee - codFee)`.
- **Impact:** A COD order whose fees exceed the collectible amount (easy at low COD values — e.g. COD 10 on a lane fee 60) fails the INSERT with Postgres `23514`. The same shortfall at the `delivered` or `picked-up` transition fails mid-fulfilment. No route maps `23514`, so it surfaces as an unhandled **500**.
- **Fix (choose one, document it):**
  1. **Drop the CHECK** (aligns with the signed-ledger convention the code comments already assert), or
  2. **Keep it and guard every write**: add a Zod/transition rule that rejects `productCost < deliveryFee + codFee` with a 4xx, and clamp the stored value — but then the ledger's signed balance and the column disagree, so option 1 is cleaner.
  - Add an integration test that inserts a fee-heavy order and asserts the chosen behaviour.

### P0-2. Authorization decisions read from the lagging replica

- **Where:** `src/lib/api-auth.ts:29` (`loadSession` → `dbRead` selecting `profile.isActive`, `profile.role`, `user.banned`, `user.twoFactorEnabled`, `merchant.emailVerifiedAt`), `src/lib/api-keys.ts:105` and `:124` (`authenticateApiKey` → `dbRead` selecting `apiKey.revokedAt`, then `merchant.status`).
- **Evidence:** `src/lib/db/index.ts` routes `dbRead` to `DATABASE_URL_READ_ONLY` when set. The comment at `api-auth.ts:5-10` justifies the replica read for *latency*, but the columns selected include every security gate.
- **Impact:** With a replica configured, an admin **ban**, **deactivation**, **2FA-policy change**, **API-key revocation**, or **merchant suspension** is written to the primary but not honoured on subsequent requests until replication catches up — a window where a revoked actor keeps acting.
- **Fix:** Read authorization-critical columns from `db` (primary); keep display-only fields (`name`, `tableRowsPerPage`, `announcementsSeenAt`, `phone`) on `dbRead`. Same for `authenticateApiKey`'s `revokedAt` and `merchant.status`. Add a comment documenting which columns are security-relevant.
- **Note:** A default deploy with no replica is unaffected — this is a deployment-correctness bug, not an always-on one. Still P0 because the failure mode is a security control silently not applying.

### P0-3. Bulk payout approve/reject diverge from the single-item guards

- **Where:** `src/app/api/payouts/bulk/approve/route.ts` (whole file), `src/app/api/payouts/bulk/reject/route.ts:38-62`; contrast `src/app/api/payouts/[id]/approve/route.ts:41-84` and `src/app/api/payouts/[id]/reject/route.ts:44-83`.
- **Evidence:**
  - Single approve locks the row `FOR UPDATE`, **recomputes `amount` from the linked orders**, and rejects a request with **zero** backing orders (`"This payout request has no linked orders."`). Bulk approve does none of these — it only flips `status` and stamps reviewer fields, preserving a possibly-stale amount and approving an empty request.
  - Single reject clears `order.payoutRequestId` **inside the same transaction** as the status change. Bulk reject commits `REJECTED` first and nulls `order.payoutRequestId` in a **separate statement** (`:59-62`). The payout-creation query only looks for `isNull(order.payoutRequestId)` (`src/app/api/payouts/route.ts:232`), so a crash/error between the two statements permanently strands those merchant earnings on a `REJECTED` request — unpayable.
  - Bulk approve/reject also skip the `rateLimitByIp` the single routes apply (`[id]/approve:28`).
- **Impact:** Money state can be wrong/stranded; a caller can approve a payout with no orders behind it.
- **Fix:** Extract a shared `approvePayout(tx, id, me)` / `rejectPayout(tx, id, me, reason)` used by both single and bulk; run each id inside one `db.transaction` with the same `FOR UPDATE`, amount recompute, order-count guard, and rate limiting as the single path.

### P0-4. False-success toasts: failed mutations reported as success

- **Where:**
  - `src/app/dashboard/merchants/merchants-client.tsx:102-127` (`confirmBulkSuspend` / `confirmBulkReactivate`) and `:165-182` (`handleConfirm`).
  - `src/app/dashboard/team/team-client.tsx:110-115` (`handleToggleActive`) and `:134-151` (`handleChangeWarehouse`).
  - `src/features/riders/dialogs/rider-application-detail-dialog.tsx:118-122` (`handleApprove`) and `:140-145` (`handleReject`) — no `else`, so a failed PATCH leaves the dialog open with **no** feedback at all.
- **Evidence:** `use-merchants.ts:118-145` returns `{ ok: false, error }` on non-2xx; the call sites above `await` and then unconditionally `toast.success(...)`. The same file gets it right elsewhere (`team-client.tsx:117-126`, `src/app/dashboard/merchants/[id]/…`), so this is a missed branch, not a missing capability.
- **Impact:** An admin is told a merchant was suspended / a staff account disabled when it was not. Riders' applications can neither be approved nor rejected with no error shown.
- **Fix:** Branch on `result.ok`; `toast.error(result.error ?? "…")` and skip the success toast when it fails. Add a unit test asserting a rejected `suspendMerchant` surfaces an error toast.

### P0-5. COD settlement computes cash totals from a single 20-row page

- **Where:** `src/app/warehouse/cod-settlement/page.tsx:78-98` (server fetch `limit = 20`), `src/app/warehouse/cod-settlement/cod-settlement-client.tsx:105-166` (`settled` / `unsettledOrdersList` filter in memory), `:259-281` (stat cards), `:285-336` (`DataTable` with `data={visible}` and **no** `serverPaginated`/`total`/`onPageChange`).
- **Evidence:** The server returns at most 20 `DELIVERED` orders for the warehouse; the client then filters those 20 in memory to build the Settled/Awaiting tabs and sums `unsettledCash`/`settledCash`. `unsettledCount` comes from the correct server count (`warehouseUnsettledOrders`), so the count tile and the cash tile disagree with each other.
- **Impact:** With >20 delivered orders, cash totals are wrong, tabs are incomplete, and pagination is client-side over the page subset.
- **Fix:** Push the settled/unsettled filter server-side (query param + `count(*)`), and pass `serverPaginated`, `total`, and `onPageChange` to the table; derive the cash totals from server aggregates, not the page.

---

## P1 — High

### P1-1. Bulk order create has no idempotency and emits no webhooks

- **Where:** `src/app/api/orders/bulk/route.ts` (whole file); compare `src/features/orders/create-order.ts:100-118` and `:317-336`.
- **Evidence:** The single-create path reads an `Idempotency-Key` and calls `emitWebhookEvent({ tx, … })` inside the create transaction. Grep of the bulk route shows neither an idempotency read nor any `emitWebhookEvent` call. Its transaction starts at `:296` with a comment about the pre-write guard but no event emit.
- **Impact:** A retried bulk import duplicates every order **and its balance transactions/charges**. Merchants using R2 webhooks silently receive no `order.created` events for bulk orders.
- **Fix:** Thread an `Idempotency-Key` per row (or per request) through bulk create, and enqueue `order.created` per inserted order inside the existing transaction.

### P1-2. Idempotent order-create replay can read the winner from the replica

- **Where:** `src/app/api/orders/route.ts:273-288` and `:506-508`, `src/features/orders/create-order.ts:103-118` and `:341-343`, `src/app/api/v1/orders/route.ts:177-187`.
- **Evidence:** `findByKey()` uses `dbRead`. The unique index + `onConflictDoNothing` makes the *write* safe; but the loser of a race re-reads via `findByKey()` on the replica and, under replication lag, sees nothing → returns `400 "Duplicate request"` / `409` instead of replaying the winner.
- **Impact:** Same key, same moment, different answer depending on replica lag.
- **Fix:** Read idempotency pre-checks **and** post-conflict re-reads from `db` (primary). This is the canonical read-your-writes case.

### P1-3. `usePayouts` revalidation never matches the list keys — stat tiles go stale

- **Where:** `src/features/payouts/hooks/use-payouts.ts:126,145,166,186,207,224,244`; contrast `src/features/merchants/hooks/use-merchants.ts:108`.
- **Evidence:** Every mutator calls `_globalMutate((key: string) => key === KEY)` where `KEY = "/api/payouts"`. But the list key is built by `buildTableUrl` and carries query params (`/api/payouts?limit=20&offset=0`) and `allUrl` adds more — so `key === KEY` matches nothing. `use-merchants` uses `key.startsWith(KEY)`, which does.
- **Impact:** Payout count cards fed by `allPayoutRequests` never refresh after approve/reject/mark-paid.
- **Fix:** `key.startsWith(KEY)`.

### P1-4. Bulk merchant approve skips the email-verification gate and the approval email

- **Where:** `src/app/api/merchants/bulk/approve/route.ts:21-44`; contrast `src/app/api/merchants/[id]/approve/route.ts:45-47` and `:82-86`.
- **Evidence:** Single approve returns `badRequest("Merchant must verify their email before approval")` when `emailVerifiedAt` is null and enqueues `merchantApprovedTemplate` in the same transaction. Bulk approve only checks `status = PENDING` and flips to `ACTIVE`; no verification predicate, no email.
- **Impact:** Two admin surfaces produce different account states; unverified merchants activated with no notification.
- **Fix:** Add `isNotNull(merchant.emailVerifiedAt)` to the bulk select/update `WHERE` and enqueue the approval email per merchant (reuse the single-approve transaction helper).

### P1-5. Blink SSRF via merchant webhook URL

- **Where:** `src/lib/webhooks.ts:279` (`fetch(endpoint.url, …)`), schema `src/lib/validation.ts:1005-1008`, guard `src/lib/host-guard.ts:30` (only wired into `src/app/api/admin/mail-config/test/route.ts:26`).
- **Evidence:** `webhookEndpointCreateSchema` validates only `z.url()` + `startsWith("https://")`. `fetch` follows redirects by default and there is no private-range/DNS check, so a merchant can point at a public host that redirects to `http://169.254.169.254/…` or an internal service. Delivery is blind (status/error stored), the classic SSRF exfil channel.
- **Impact:** Authenticated merchant/API-key can probe internal services / cloud metadata.
- **Fix:** Reuse `isPrivateHost` in the webhook create/update schema and re-check immediately before `fetch` (DNS-rebind defense); set `redirect: "manual"` (or validate the redirect target).

### P1-6. Page-scoped and zero-masked stat counts

- **Where:**
  - `src/app/warehouse/riders/riders-client.tsx:126` — `totalRiders` = `riders.length` (one page) instead of the already-destructured `total` (`:35`). Caps at 20.
  - `src/app/dashboard/orders/orders-client.tsx:102-120` — counts filter `allOrders`, but `useOrders` is called without `includeAllOrders` (`:87`), so `allOrders` is **always `[]`** (`features/orders/hooks/use-orders.ts:141`); the `|| initialCounts` fallback masks it and tiles never update after approve/cancel.
  - `src/app/merchant/orders/page.tsx:87-108` — tab badges computed from one server page.
  - Zero-masking via `arr.length || initialCounts.x`: `merchants-client.tsx:146-157`, `payouts-client.tsx:147-158`, `rider-applications-client.tsx:76-91` — a search that matches zero rows falls back to the unfiltered total while the table shows 0.
- **Fix:** Use server aggregates for tiles (`/api/orders/counts` exists; derive per-status counts server-side), pass `total` where already available, and use `??` on the response rather than `||` on a derived array. For filtered views, compute tiles from query-less server counts.

### P1-7. NID review is a read-then-write race with an unguarded update

- **Where:** `src/app/api/merchants/[id]/nid/verify/route.ts:26-76`.
- **Evidence:** Reads `nidVerifiedAt`/`nidRejectedAt` (`:26-47`), then updates with `where(eq(merchant.id, id))` only (`:75`) — not conditioned on the reviewed flags, not in a transaction. Two concurrent approve/reject requests both pass the pre-check; the second overwrites the first and both write audit rows.
- **Fix:** Wrap in `db.transaction`, `FOR UPDATE`, and add `isNull(nidVerifiedAt) AND isNull(nidRejectedAt)` to guard **and** update.

### P1-8. Webhook / API-key creation caps are check-then-insert TOCTOU

- **Where:** `src/app/api/integrations/webhooks/route.ts:58-70`, `src/app/api/integrations/api-keys/route.ts:67-80`.
- **Evidence:** Both count via `dbRead` then insert with no lock/unique guard; concurrent requests can exceed `MAX_*`. The count also materialises all rows (`.then(rows => rows.length)`) instead of `count(*)`.
- **Fix:** Enforce the cap in a transaction locking the merchant row (or an advisory lock); use `count(*)::int`.

---

## P2 — Reliability & quality

| ID | Finding | File:line | Fix |
|---|---|---|---|
| P2-1 | `mail_config` "one active" invariant not enforced in DB (unlike `merchant_balance`, `merchant_package`, `label_template`) | `src/lib/db/schema.postgres/platform.ts:254-269`; activate `…/mail-config/[id]/activate/route.ts:26-36` | Add a partial unique index `WHERE isActive = true`; map violation to 409 |
| P2-2 | Webhook `failureCount` written from a stale snapshot (`endpoint.failureCount + 1`, reset to `0`), weakening auto-disable under concurrent drains | `src/lib/webhooks.ts:252-257, 308-315, 331-345` | Atomic `failureCount = failureCount + 1` / `GREATEST(failureCount - 1, 0)` |
| P2-3 | Admin password reset can target a peer `SUPER_ADMIN` (ban route already forbids this) | `src/app/api/admin/users/[id]/password/route.ts:14-39`; contrast `…/ban/route.ts:41-46` | Mirror the ban guard on the super-admin target |
| P2-4 | Three team-warehouse writes with no transaction (`warehouse.managedBy` can disagree with `profile.warehouseId` after a partial failure) | `src/app/api/team/[id]/warehouse/route.ts:46-62` | Wrap in `db.transaction` |
| P2-5 | CSV export does not neutralise formula injection (`=`, `+`, `-`, `@`, tab/CR) | `src/lib/csv.ts:8-14` | Prefix cells matching `/^[=+\-@\t\r]/` with `'`, add a case to `csv.spec.ts` |
| P2-6 | `v1/orders` rate-limit key uses raw client `x-forwarded-for` (spoofable), unlike `rateLimitByIp` everywhere else | `src/app/api/v1/orders/route.ts:65-67, 152-154` | Use `rateLimitByIp`, or key solely on `keyId` |
| P2-7 | `merchants/[id]` PATCH `.or(quota, profile)` requires full profile; a partial profile body 400s despite the comment | `src/app/api/merchants/[id]/route.ts:91-104`; `src/lib/validation.ts:610-615, 673-679` | Use `merchantProfileSchema.partial().extend({ maxModerators: …optional() })` |
| P2-8 | `drainWebhooks` network path (fetch, non-2xx, timeout, stale-`SENDING`, enqueue-failure swallow) is untested — which is why P1-5 survived | `src/lib/webhooks.ts:203-299`; `src/lib/webhooks.spec.ts` | Add a spec stubbing `fetch`; assert refusal of private/redirect targets, failure threshold, timeout, and "enqueue throws → transition still commits" |
| P2-9 | Print-label e2e stubs the download and asserts only that the button does not throw; the unit PDF test checks page size/count but not per-field text | `e2e/specs/38-print-label.spec.ts:27-40`; `src/lib/label/generate-pdf.spec.ts:10-19` | Capture the real blob in e2e (Playwright download event) and parse it with `pdf-lib`; assert every bound field's text appears |
| P2-10 | `orderId`… field font is very small (2.5–4 mm) on a 100×150 mm label; a browser-generated label can read as "QR only" at default zoom | `src/lib/label/default-template.ts:29-101`; published template in DB | Consider a minimum legible body size and re-check with a phone photo; see "Known defect" below |

---

## P3 — Polish, docs, dead code

| ID | Finding | File:line |
|---|---|---|
| P3-1 | Stale brand in two merchant emails (`"Welcome to Kikuya!"`) while everything else uses `siteConfig.name`; rename script misses this file | `src/lib/mail-templates.ts:111, 118`; `scripts/rename-brand.mjs` |
| P3-2 | Test-only backdoor (`__isMock`) inside production `emitWebhookEvent` | `src/lib/webhooks.ts:130` |
| P3-3 | `LOG_LEVEL` changes logger verbosity but is undocumented | `src/lib/logger.ts:37`; missing from `.env.example` / `docs/ENV.md` |
| P3-4 | `DASHBOARD_URL` / `MERCHANT_URL` / `RIDER_URL` / `WAREHOUSE_URL` documented as **Required** but referenced nowhere in code/compose/workflows | `docs/ENV.md:241-244` |
| P3-5 | `vercel.json` cron schedule (daily `drain-email-outbox`, 4 jobs missing) contradicts the heartbeat cadence (60 s) | `vercel.json:2-11`; `src/lib/cron-heartbeat.ts:33-39` |
| P3-6 | Stale comment claims `cleanup-uploads` ships with `?dryRun=1`; compose schedules it live and `compose-cron.spec.ts` asserts that | `scripts/setup-pg-cron.sql:85-87` |
| P3-7 | Icon-only buttons (copy/revoke key, delete webhook) have no accessible name | `src/features/integrations/components/api-keys-card.tsx:120-129, 214-221, 341-352` |
| P3-8 | Duplicate `data-testid` per row (`users-actions`) violates the documented per-row scoping | `src/app/dashboard/users/users-client.tsx:150,158,166,176` |
| P3-9 | Number inputs that cannot be cleared (`Number("") || old`) | `src/app/dashboard/label-designer/label-designer-client.tsx:314-319,337-342`; `src/app/dashboard/merchants/[id]/detail-client.tsx:370-371` |
| P3-10 | Dead code: unused `_view*` state/fetch; `_get*SearchValue`; `_pickup`; `_replaceOne`; duplicated settled/unsettled filters | `src/app/dashboard/nid-reviews/page.tsx:64-78`; `src/app/merchant/finance/page.tsx:98-132`; `src/app/merchant/orders/page.tsx:80`; `src/features/merchants/hooks/use-merchants.ts:111-116`; `src/app/warehouse/cod-settlement/cod-settlement-client.tsx:105-164` |
| P3-11 | Team table declares `sortValue` but never `sortable`/server sort, so `initialSortId="role"` does nothing | `src/app/dashboard/team/team-client.tsx:153-244, 259-276` |
| P3-12 | COD settlement `searchColumns` references `"deliveryCity"` but the column id is `"deliveryAddressOnly"` — city search silently no-ops | `src/app/warehouse/cod-settlement/cod-settlement-client.tsx:289-294`; `src/features/orders/components/order-table-columns.tsx:305-309` |
| P3-13 | `rejectPayout` sends a JSON body without `Content-Type` (all siblings set it) | `src/features/payouts/hooks/use-payouts.ts:175-178` |
| P3-14 | Duplicate unreachable `.catch(() => null).catch(() => null)` | `src/features/orders/hooks/use-orders.ts:191-194,396-399,446-449` |
| P3-15 | Non-null assertion on `res.plaintext!`; clipboard write fire-and-forget then success toast | `src/features/integrations/components/api-keys-card.tsx:68, 120-129` |
| P3-16 | Merchant-note save failure is silent (`if (!res.ok) return`) | `src/features/orders/components/order-detail-view.tsx:187-196` |

---

## Known defect from the user: "PDF downloaded from `/rider` shows only the QR code"

**Status:** reproduced the *generator* correctly, but not yet the browser symptom.

- The published template in the dev DB (`label_template` where `publishedAt is not null`) contains all eleven fields (`qr`, `orderId`, `recipientName`, `recipientPhone`, `recipientAddress`, `separator`, `merchantName`, `destinationCity`, `weight`, `codAmount`, `siteName`) with all inputs mapped by `src/lib/label/label-inputs.ts:20-35`.
- Feeding that exact template + representative `LabelData` through the real pipeline in Node (`@pdfme/generator` + the bundled woff2 + `labelPlugins`) produces a PDF whose content stream contains **9 text-showing operations** — so the shared generate path is not dropping text.
- `pdfme@6` has **no per-schema try/catch** (`node_modules/@pdfme/generator/dist/index.js:296-348`): a font error would reject the whole call and show the error toast, not a text-less PDF. So "QR only" almost certainly means the template or the inputs reaching the button had only a QR — i.e. a **client-side template/subscription** issue, or the "tiny fonts read as blank at default zoom" perception (P2-10).
- The gap that let this ship unverified: `e2e/specs/38-print-label.spec.ts` stubs the download (`:27-40`) and only asserts the button re-enables, while `generate-pdf.spec.ts` asserts page size and page count, not per-field text.

**Next steps:**
1. Reproduce in a real browser (Playwright `page.waitForEvent("download")`), parse the captured PDF with the already-present `pdf-lib`, and dump per-field text.
2. Confirm whether the rider's `usePublishedLabelTemplate` (`src/features/platform-config/hooks/use-label-template.ts:55-87`) resolved a template whose `schemas[0]` had degraded, and whether `/api/label-template` was returning the expected row at the time.
3. Close the loop with the P2-9 test so a text-less label can never pass CI again.

---

## Possible improvements (not bugs)

These are opportunities, ordered by leverage.

1. **Bulk/single parity as a first-class rule.** P0-3, P1-1, P1-4 and P1-8 all share one root cause: a bulk sibling re-implementing a single route without its guardrails. Extract shared helpers (`approvePayout`, `createOrders`, `approveMerchants`) and add a source-scan test that flags a `bulk/*/route.ts` with no matching single-route import.
2. **Make "authorization reads on the primary" enforceable.** A small helper (`dbSecurityRead`) plus a source-scan spec would prevent P0-2 regressions.
3. **A PDF-content assertion helper** used by both the unit spec and e2e, so label output is verified end-to-end (P2-9).
4. **Webhook delivery test harness** (P2-8) — the highest-risk untested module.
5. **Explicit CSV-injection policy** in `lib/csv.ts` + tests (P2-5).
6. **Document the deployment reality of read replicas:** if `DATABASE_URL_READ_ONLY` is set, which reads are allowed to lag, and which are not (P0-2).
7. **Consolidate "counts" endpoints/patterns.** Several pages recompute page-scoped counts client-side (P1-6); a shared server `counts` projection would remove the whole class.
8. **Docs sweep:** `LOG_LEVEL`, the four unused `*_URL` vars, Vercel cron (P3-3…P3-5), and the stale unit counts in `ROADMAP.md`. Cheap and removes operator confusion.
9. **Speed up the unit suite.** Vitest reports the run spends 237 s spawning 240 isolated workers, and suggests `isolate: false` for a ~65 s saving. Worth testing in `vitest.config.ts` now that specs share few globals.
10. **R3 (notifications)** and the remaining P2 roadmap items remain the product backlog — see `ROADMAP.md`. R3 is unblocked and shares R2's event source.

---

## Suggested execution plan

**Phase 0 — stop the bleeding (P0).**
1. P0-1 earnings CHECK decision (schema + guard + integration test).
2. P0-4 false-success toasts (frontend-only, quick, high user-visible value).
3. P0-3 payout bulk parity (money).
4. P0-2 security reads on the primary.
5. P0-5 COD settlement server-side filter + totals.

**Phase 1 — correctness parity (P1).**
P1-1 bulk create idempotency/webhooks · P1-2 idempotency primary reads · P1-4 bulk merchant approve gate/email · P1-7 NID race · P1-8 caps in a transaction · P1-3 revalidation key · P1-6 server counts.

**Phase 2 — hardening & tests (P2).**
SSRF guard (P1-5) · webhook failureCount atomicity + delivery spec (P2-2, P2-8) · mail_config partial unique (P2-1) · team-warehouse transaction (P2-4) · csv injection (P2-5) · v1 rate limit (P2-6) · merchant PATCH schema (P2-7) · print-label PDF assertion (P2-9, and the user-reported defect).

**Phase 3 — polish (P3).**
Brand/doc/dead-code/a11y/testid sweep; then re-run `pnpm ci:check` → `pnpm test:unit:run` → `pnpm build` → `pnpm test:e2e` (+ `pnpm test:integration` for P0-1, P2-1), and consider raising the coverage floors with the new tests.

---

## Verified clean (do not re-audit)

- Money paths are transactional with `FOR UPDATE` and consistent lock ordering (orders → balance): `payouts/route.ts`, `payout-settlement.ts`, `balance/payment/*`.
- API-key mint/auth: SHA-256 hash-only at rest, timing-safe compares; cron auth timing-safe; upload/tracking tokens hashed.
- Storage backends defend path traversal; uploads are magic-byte sniffed and size-limited.
- Nonce-based CSP with a real nonce reader; HSTS/`poweredByHeader` pinned by `security-headers.spec.ts`; `worker-src` for the QR worker.
- Every API route has a session guard (`route-auth-guard.spec.ts` over all 134 route files).
- Pagination clamped (`MAX_LIMIT=100`, `MAX_OFFSET=100_000`); no unbounded list queries found.
- FK indexes present across the schema; trigram indexes back `ILIKE` search; partial unique indexes enforce the one-pending-payment / one-active-bundle / one-default-label invariants.
- Migration ledger hashing/baseline/advisory-lock logic matches drizzle; `0007` drop is safe.
- Timezone/business-day arithmetic (`BUSINESS_TIMEZONE`, `businessToday`, `sumMoney`) is correct.
- Bulk order **transitions** reuse the single-item authorize/guard/finance logic with `FOR UPDATE`, status re-checks and transactional audit/history/webhooks.
- Shells correctly gate auth/roles/2FA; error/loading/not-found boundaries exist for all role segments.
- Structured `logger` used on the request path; PII redaction present.

> The four source-level drift guards (`docs-drift`, `ci-workflow`, `compose-cron`, `route-auth-guard`) are a real asset — extend them rather than starting new ones.

---

## Final health note

Recorded while writing this plan (branch `develop`, HEAD `01ae1c4`):

- `pnpm typecheck` — green.
- `pnpm test:unit:run` — **2528 passed / 45 skipped** (2573 total), 239 passing files + 1 skipped, 237 s.
- `git status` — only `IMPROVEMENTS.md` untracked; no source file was modified.
- `pnpm build` and the Playwright suite were **not** re-run as part of this audit.

> Note: `ROADMAP.md` still records "2526 pass / 2570 total". The suite now runs
> 2528 / 2573, so the Roadmap's health block is two tests stale — worth a
> sentence-only update.
