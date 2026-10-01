# ROADMAP

> Forward-looking only — shipped work lives in git history and in the
> `ROADMAP <id>` annotations left beside the code it changed.
>
> **Health:** `pnpm ci:check` green (814 files) · Unit **2009 pass / 16 skip**
> (195 spec files) · coverage **54.04 / 47.37 / 42.17 / 54.85** against floors
> **49 / 42 / 37 / 50** · E2E **129 tests / 31 files / S1–S71**, run locally
> only (`pnpm test:e2e`) by decision — CI stays on lint, typecheck, coverage
> and build · `route-auth-guard.spec.ts` enforces server-side auth on every API
> route · real-DB integration suite green in CI · `pnpm build` green.
>
> **Every change verifies with:** `pnpm ci:check` → `pnpm test:unit:run` →
> `pnpm build` → `pnpm test:e2e` (+ `pnpm test:integration` when DB invariants
> move).
>
> **Source of this document:** a full re-audit (product · data layer ·
> operability · accessibility) performed against the current tree. Every entry
> cites a `file:line` that was verified by hand — re-verify before acting, and
> update the citation if the line has moved.

---

## How to work this roadmap

| Band | Meaning | Bar to merge |
|---|---|---|
| **R0 Correctness** | the app shows or stores wrong data today | full gate + `pnpm test:integration` if DB invariants move |
| **R1 Quality gates** | a bug could ship unnoticed | `pnpm ci:check` **plus a test that fails without the fix** |
| **R2 Accessibility** | a user cannot operate the product with AT/keyboard | axe or Lighthouse pass on the touched route |
| **R3 Platform & ops** | silent failure risk in production | `pnpm build` + deploy dry-run |
| **R4 Product** | growth / market fit | spec first, then build |
| **R5 Polish** | consistency and dead weight | `pnpm ci:check` |

**R0 is the whole point.** Nothing in R4 ships until R0 is clear.

### Decisions already made (recorded so they are not re-opened)

| Decision | Detail |
|---|---|
| **E2E runs locally, not in CI** | `pnpm test:e2e` (129 tests, ~7.5 min) is run by hand before merge. It is deliberately **not** wired into `.github/workflows/ci.yml` because of runner cost — do not "helpfully" re-add an `e2e` job. The `e2e:` block in `ci.yml:169-215` stays commented out on purpose. |
| **Coverage floors are a floor, not a target** | Raise them as tests land; never lower them to make CI pass. |

---

# R0 — Correctness (fix now)

**11 of 12 shipped.** Each one was verified by reverting the fix and watching
its test fail, so none of these are trust-me entries. Full detail — the
`file:line` citations, the reasoning and the non-vacuity check — lives in git
history under the id.

| ID | Shipped |
|---|---|
| R0.1 | `GET /api/orders/summary` — merchant money cards aggregated over the whole account instead of one 20-row page |
| R0.2 | `?queue=` on `/api/orders`; the rider queues stop re-filtering locally, so the rows and the footer `total` agree |
| R0.3 | Date presets go through `businessPresetRange()` (Asia/Dhaka) instead of the browser's midnight |
| R0.4 | `public/sw.js` stops caching authenticated HTML — both the navigation path and the install-time `cache.addAll(["/"])` one |
| R0.5 | `stale-orders` added to both compose crontabs; `compose-cron.spec.ts` discovers cron routes from disk and checks the HTTP method each is called with |
| R0.6 | Outbox failures requeue with 2/4/8/16-minute backoff and park as FAILED at attempt 5 |
| R0.7 | Retention defaults single-sourced in `src/lib/env.ts`, with `docs-drift.spec.ts` asserting the SQL and `docs/ENV.md` match |
| R0.9 | Both activate toggles became compare-and-swap — a concurrent flip 409s instead of silently collapsing |
| R0.10 | `orders/payable` gets a total order (`createdAt DESC, id DESC`) so OFFSET pages cannot overlap or gap |
| R0.11 | Guards and `buildUpdate` read through `tx`; `resolveRoutePricing` and `pickupWarehouseId` accept a runner; session resolution moved to `dbRead` |
| R0.12 | Dead `warehouseId IS NULL` branch removed from 6 sites (decision: the state cannot exist) |

### R0.8 Retention scheduled by cron should be observable (deferred)

Nothing notices when cron stops: `cleanup-uploads` and `drain-email-outbox`
emit `logger.info` only, `stale-orders` a `logger.warn`, and the cron
container has no healthcheck (`docker/compose.cluster.yml:149-169`).

**Fix:** a watchdog that compares each job's last successful run to 2× its
schedule and emits `logger.error` (or a page) on breach; give the cron
container a healthcheck and stop writing logs into an ephemeral container.

**Why it is deferred:** it needs somewhere to persist "last run" — a new table
plus migration, or reusing `audit_log` (5 rows/day for the daily jobs, but
1440 for `drain-email-outbox`). That is an architecture call, and this is the
sole R0 item about *noticing* a problem rather than *having* one — so the other
eleven shipped rather than being held behind it.

---
# R1 — Quality gates

**8 of 8 shipped**, with the same bar as R0: each guard was checked to fail
when its fix is reverted. Full detail lives in git history under the id.

| ID | Shipped |
|---|---|
| R1.1 | `timeout-minutes` on every CI job — quality 10, security 5, deploy 30 (build 20, coverage 25 and integration 15 already had theirs). Nothing timed out before GitHub's 6h default kill |
| R1.2 | Specs for the two unauthenticated routes: `uploads/token` (partially mocks `@/lib/upload-token` so the real HMAC + 15-min TTL path runs) and `merchants/resend-verification` (asserts the no-enumeration contract, that nothing sends for an unknown or already-verified address, and that only the token hash is persisted) |
| R1.3 | Testids on the four footer controls, on `FormDialog's Cancel, and on the orders status tabs — plus `e2e/specs/31-pagination.spec.ts` (S73), the first E2E coverage server-side pagination has had. **It found a real bug on its first run:** in server mode the footer handed pagination to `onPageChange` and never advanced its own `page`, so the label read "Page 1 of N" and Previous was permanently disabled on all 24 server-paginated tables. Fixed in `data-table/index.tsx` — `handlePageChange` advances local state as well, and the footer now displays the clamped `currentPage` |
| R1.4 | AGENTS.md corrected (S65 / 104 tests → S73 / 132; floors 48 / 41 / 37 / 49 → 49 / 42 / 37 / 50), and `docs-drift.spec.ts` now asserts serial uniqueness, no gaps, and that the documented floors equal `vitest.config.ts` — the check that would have caught the duplicate S68 |
| R1.5 | `src/features/**` floor at 27 / 25 / 21 / 28, set ~2 points under the measured 29.56 / 27.31 / 23.64 / 30.34 across 111 files. The config comment that called this directory "deliberately not floored" now records why the floor was added |
| R1.6 | Investigated rather than guessed: `test-setup.ts` already runs `cleanup()` and wipes `document.body` per test, so the timeout was masking nothing. Lowered to 30s, **measured** two specs failing at 34.8s and 37.2s, and restored 60s as a load guard with the comment rewritten to keep isolation and load as separate concerns |
| R1.7 | `.github/dependabot.yml` — npm + github-actions, weekly, minor bumps grouped so one PR exercises the gate instead of one per dependency |
| R1.8 | `.github/workflows/codeql.yml` — `javascript-typescript` with `security-extended`, weekly. `pnpm audit` checks dependencies and `dependency-review` is advisory; neither reads this source |

---
# R2 — Accessibility (WCAG 2.1 AA)

Ordered by user impact. Every "0 hits" claim below was verified by grep.

### R2.1 `aria-current` is never used in navigation (0 hits)

`src/components/navigation/role-sidebar.tsx` and `mobile-header.tsx` signal
the active item with background colour alone, so a screen-reader user hears an
undifferentiated list of links with no sense of place. The `<nav>` landmarks
also carry no `aria-label`.

**Fix:** `aria-current={active ? "page" : undefined}` on the `<Link>` in both
files, plus `aria-label="Main"` on the `<nav>`s. Two lines, whole app.

### R2.2 The bulk "select all" checkbox is `aria-hidden`

`src/components/data-table/bulk-actions.tsx:36` puts `aria-hidden="true"` on
the `<th>` wrapping the focusable select-all input at `:39`. Its subtree leaves
the accessibility tree while staying in the tab order — a keyboard user tabs
onto a control that announces as nothing, and a screen-reader user never finds
bulk select at all. This is the primary bulk affordance on every list page.

**Fix:** drop `aria-hidden`; add `aria-label="Select all rows on this page"`.
Check the per-row cells for the same shape.

### R2.3 Row click is mouse-only

`src/components/data-table/index.tsx:794` puts `onClick` on a `<tr>` with no
`tabIndex`, no `onKeyDown` and no role, while `:797` applies `cursor-pointer`
— which makes it *look* interactive. WCAG 2.1.1. Live use:
`src/app/warehouse/riders/riders-client.tsx`.

**Fix:** fix centrally in `DataTable` — either make the primary cell a real
link/button, or add `tabIndex={0}` + `Enter`/`Space` handling + an `aria-label`
describing the destination. Don't make every page remember.

### R2.4 No form error association (0 `aria-describedby`, 0 `aria-errormessage`)

Only nine `aria-invalid` sites exist and none points at a message. `FormErrors`
renders a `role="alert"` banner (`src/components/form-errors.tsx:22`), so
*something* announces — but not which field failed. Focus never moves to the
first invalid input on submit.

**Fix:** in the shared input primitive, emit a stable id, wire
`aria-invalid` + `aria-describedby` automatically from the error prop, mark
`required`, and move focus to the first invalid field on failed submit.

### R2.5 Icon-only links have no accessible name

`src/app/rider/delivery/page.tsx` (and the pickup sibling) render a map link
whose only content is an `<svg>` — announced as "link, blank". This is the
rider's primary action in that column.

**Fix:** `aria-label={`Open delivery location in maps for order ${code}`}` on
every icon-only `<a>`/`<button>` in the file.

### R2.6 No `prefers-reduced-motion` (0 hits) with infinite animations

`animate-ping` loops forever at `src/app/landing/page.tsx`, `src/features/announcements/components/announcements-inbox.tsx`
and `src/app/dashboard/announcements-inbox/inbox-client.tsx`; every skeleton
uses `animate-pulse`. WCAG 2.3.3.

**Fix:** one `@media (prefers-reduced-motion: reduce)` block in
`globals.css` + a static fallback for skeletons.

### R2.7 Async state changes are not announced

`aria-live` / `role="status"` appears in only three or four places. Missing:
the auth-init spinners in all four shells (`dashboard-shell.tsx:63`,
`warehouse-shell.tsx:59`, `merchant-shell.tsx:226` — a screen-reader user
lands on a blank region), the DataTable refresh overlay
(`data-table/index.tsx:663`), and result counts on tab/filter change.

**Fix:** `role="status"` + visually-hidden copy on the overlay; a polite live
region announcing result counts; `aria-busy` on the shells' loading state.

### R2.8 Five dialogs are missing descriptions

`order-details-dialog.tsx`, `quick-filters.tsx`,
`announcement-detail-modal.tsx`, `order-details-drawer.tsx` (title only) and
`image-zoom.tsx` (raw `DialogPrimitive.Popup` with **no `DialogTitle` at
all`). `FormDialog` itself is correct — the pattern is bypassed at these call
sites.

**Fix:** one sentence of purpose on each; make `description` required in
`FormDialog`'s type so a new dialog cannot regress.

### R2.9 Light-mode contrast fails on `--muted`

`src/app/globals.css:53-76` — `--muted-foreground` on `--muted` computes to
≈ **4.32:1**, below the 4.5:1 AA threshold, on a surface that backs table meta
rows and empty-state helper copy. Dark mode (≈ 5.4:1) is fine.

**Fix:** drop `--muted-foreground` to ~`oklch(0.50 0.02 256)` in `:root`.

### R2.10 Touch targets on the densest controls

`src/components/ui/button.tsx:22-33` — `h-7` (28px), `h-6` (24px), `size-6`
(24px) variants. WCAG 2.5.8 (AA) requires 24px so this technically passes;
2.5.5 (AAA, 44px) is missed everywhere. It bites in exactly the context this
product is for — riders and warehouse staff on phones.

**Fix:** raise the floor to `min-h-11 min-w-11` on icon variants (or a
non-layout-affecting `::after` hit-area expander).

---

# R3 — Platform, ops & performance

### R3.1 No error tracking, metrics or alerting anywhere

Zero hits for `sentry|opentelemetry|prom-client|prometheus|posthog|newrelic`
across the repo and `package.json`. `@vercel/analytics` is imported in
`src/app/layout.tsx:1`, but the app deploys to Docker, so it reports nothing.
There is no uptime rule, no alert, nothing in `.github/` but `ci.yml` and
`deploy.yml`.

**Fix:** wire an error reporter through `src/instrumentation.ts`. Minimum bar
in the meantime: an uptime check on `/api/ready`, which already returns 503
correctly (`src/app/api/ready/route.ts:43`).

Two related gaps are folded in here rather than kept as their own items —
both are symptoms of this same missing layer, not separate pieces of work:

- **No request or access logging.** Only unhandled 500s reach the log
  (`src/lib/with-error-handler.ts:61-66`): no slow-request line, no 4xx line,
  no route latency. `logger.child()` is implemented (`src/lib/logger.ts:78-86`)
  and called nowhere, and `src/lib/redact.ts` exists but is not wired into
  `emit()`.
- **No slow-query or pool-saturation signal.** No `log_min_duration_statement`,
  no `statement_timeout` on the pool (`src/lib/db/index.ts`), no `pool.waiting`
  gauge. `pg_stat_statements` is enabled in `docker/compose.postgres.yml` and
  documented in `docs/DEPLOYMENT.md` — nothing queries it, so a query taking
  30s simply hangs a request with no signal.

### R3.2 The in-cluster upload limit is per-instance

`src/proxy.ts:186` keeps `uploadWindows` as an in-process `Map`; the comment
at `:178` admits it. With four app instances in `compose.cluster.yml`, each
allows its own 20/min — **80/min/IP**. The map is also only pruned when an
upload arrives (`:191-195`), so it grows keyed by attacker-controlled IP
between requests.

**Fix:** route uploads through the same Redis limiter the rest of the app uses
(`src/lib/rate-limit.ts`); prune on a timer.

### R3.3 There is no display formatting layer

≈27 `toLocaleString`/`toLocaleDateString` call sites, most passing a bare
locale and **none** passing `timeZone`. The worst instance is public and
unauthenticated:

- `src/app/track/[id]/lib.ts:32-43` hardcodes `en-US`, passes no `timeZone`,
  and runs **server-side** — so a customer in Dhaka and an ops user in the
  same office can see different timestamps for one order.
- `src/features/orders/components/tracking-timeline.tsx:99-110` is a
  near-duplicate using `undefined`, so two views of one timeline can disagree.

Currency is split-brain too: `CURRENCY_SUFFIX = "TK"`
(`src/lib/constants.ts:36`) vs a second unrelated `CURRENCY`
(`src/config/site.ts:82`), with `formatTk()` (`src/lib/pricing.ts:99`)
hardcoding `en-US` grouping.

**Fix:** `src/lib/format.ts` exporting `formatDateTime()` and `formatMoney()`
both pinned to `BUSINESS_TIMEZONE` and an explicit locale; codemod the ~27
call sites; retire the duplicate `CURRENCY`.

### R3.4 Three-way hostname conflict, committed tunnel identity

`config.yml:2-4` hardcodes a tunnel UUID and `hostname: sarn.top` and is not
gitignored; `deploy.yml:44` defaults `NEXT_PUBLIC_SITE_URL` to
`https://chalan.sarn.top`; compose runs `cloudflared` from a
`CLOUDFLARE_TUNNEL_TOKEN`. Three mechanisms, two names, one committed secret
shape.

**Fix:** pick one, move `config.yml` under `.gitignore` or delete it, and
assert no hostname literal survives in the tree.

### R3.5 A bulk order transition runs ~900 statements in one transaction

`src/features/orders/transitions.ts:975-1071` (`applyBulkOrderTransition`) is
used by all six `/api/orders/bulk/*` routes with up to **100 ids**
(`src/lib/validation.ts:14-18,826`). Per order it runs:

- `guard` + `buildUpdate` — for `approve`, the merchant lookup (`:108`) plus
  `resolveRoutePricing` (`src/lib/order-pricing.ts:60-127`) is **5 sequential
  queries** → 500 round trips; for `dispatch`/`assign-pickup-rider` the *same*
  `riderId` is re-read once per order (`:163`, `:208`)
- one `UPDATE … RETURNING` (`:1019-1026`)
- `settleOrderFinancials` — up to 4 statements (`:1043` area) → 400
- `logAudit` + `orderStatusHistory` inserts (`:1044-1069`) → 200

All while holding `FOR UPDATE` on up to 100 `order` rows plus
`merchant_balance`.

**Fix:** prefetch riders/merchant once per distinct key; group identical
updates into `UPDATE … WHERE id IN (…)`; one `insert(auditLog).values([...])`;
one `insert(orderStatusHistory).values([...])`; move guard reads onto `tx`
(see R0.11).

### R3.6 Eight bulk endpoints fan out one audit INSERT per row

`Promise.all(rows.map(logAudit))` at
`src/app/api/merchants/bulk/approve/route.ts:45`,
`…/suspend/route.ts:29`, `…/reactivate/route.ts:28`,
`src/app/api/payouts/bulk/approve/route.ts:47`, `…/reject/route.ts:64`,
`…/mark-paid/route.ts:53`,
`src/app/api/email-logs/bulk/mark-sent/route.ts:44`,
`src/app/api/announcements/bulk/route.ts:36` — up to 100 concurrent
single-row round trips. `logAudit` already builds a `values` object
(`src/lib/audit.ts:66-79`), so `logAuditMany(inputs, tx)` doing one
`values([...])` is a small change across eight files.

### R3.7 Three full passes over `order` per `/dashboard/orders` view, nothing cached

- `src/app/dashboard/orders/page.tsx:17` — unpredicated `count(*)` over `order`
- `:19-26` — a second pass, `GROUP BY status`
- SWR then fetches `/api/orders`, which runs a **third** `count(*)`
  (`src/app/api/orders/route.ts:155-165`) — and for `SUPER_ADMIN` the `where`
  is `undefined` (`:88-89`), so the count is unpredicated again.

There is **no caching layer at all** — no `unstable_cache`, no cache tags, no
`revalidate`. Redis exists but is used only for rate limiting
(`src/lib/rate-limit.ts`). The same per-render `count(*)` shape repeats across
~20 list endpoints and every `dashboard/*` server page
(`dashboard/page.tsx:21-57` alone runs 6 counts).

Related: `src/app/api/orders/analytics/route.ts:77-147` runs four separate
aggregate queries (`ordersByDay`, `ordersByStatus`, `deliveryPerformance`,
`codSummary`) sharing one identical `WHERE` (`:64`) — for `SUPER_ADMIN` that
predicate is only `createdAt >= now-30d` (`:63`), so the same index range is
walked four times per dashboard poll. The three non-`groupBy` aggregates
collapse into **one** pass with `FILTER`, exactly the technique already used in
`src/app/api/orders/counts/route.ts:40-47`.

**Fix:** `unstable_cache` with tags and a 30–60 s TTL on the aggregates; merge
the analytics passes with `FILTER`.

### R3.8 Two FK columns on the largest table have no index

`order.packageId` and `order.packageTierId` are declared FKs with
`onDelete: "set null"` (`schema.postgres/orders.ts:129-135`) and **neither has
an index** — the DDL at `drizzle/postgres/0001_slim_kid_colt.sql` creates both
constraints and no matching `CREATE INDEX`, while the sibling
`merchantPackageId` does get `order_merchant_package_id_idx`.

Because the FK is `SET NULL`, every parent delete must scan `order` for
references: `src/app/api/packages/[id]/tiers/[tierId]/route.ts:136` and
`src/app/api/packages/[id]/route.ts:133` — routine admin edits — each do a
full sequential scan of the biggest table.

Also missing: a btree on `user.createdAt`. The `"user"` table has exactly
**two** indexes, both trigram GIN on `name` and `email`, yet
`src/app/api/admin/users/route.ts:59-74` and `…/team/route.ts:76-90` default to
`ORDER BY user.createdAt DESC` — an unindexed sort of the whole user set per
page.

**Fix:** `index("order_package_id_idx").on(t.packageId)`,
`index("order_package_tier_id_idx").on(t.packageTierId)`,
`index("user_created_at_idx").on(t.createdAt)`. All three are additive
migrations with no data backfill — run `pnpm db:generate` then `pnpm db:push`.

### R3.9 Public token lookups scan the whole table

`src/lib/activation.ts:81-85` filters `WHERE user.activationToken = $1` and
`src/app/api/auth/verify-email/route.ts:43` filters
`WHERE merchant.emailVerificationToken = $1`. Neither column is indexed — and
both are **unauthenticated** endpoints, so every click on an activation link
is a sequential scan reachable by anyone.

**Fix:** partial unique indexes `WHERE activationToken IS NOT NULL` and
`WHERE emailVerificationToken IS NOT NULL`.

### R3.10 Cross-table `ILIKE OR` search defeats every trigram index

`src/app/api/orders/route.ts:100-107` ORs `ilike` across
`order.id/recipientName/recipientPhone` **and** `merchant.businessName` **and**
`warehouse.name/city` in a single predicate evaluated after four LEFT JOINs
(`:144-152`). A trigram GIN index can serve a same-table bitmap-OR, not ORs
spanning joined tables — the planner's realistic choice is "join everything,
then filter". Same shape at `src/app/api/payouts/route.ts:45-55`.

**Good news:** every targeted column *does* have a trigram index (96
`CREATE INDEX` statements, 30 of them `gin_trgm_ops`), so the "NID search uses
ILIKE" comment at `schema.postgres/merchants.ts:105` is backed by a real
index. The gap is **query shape**, not missing indexes.

**Fix:** per-table `EXISTS` subqueries, or a `UNION` of per-table hits, or a
maintained `tsvector` column.

### R3.11 Unbounded and uncached roster responses

`src/app/api/merchants/route.ts:64-91` — the RIDER and WAREHOUSE_ADMIN
branches return **every** merchant with no pagination and no `Cache-Control`
(unlike `warehouses/route.ts:78` and `pickup-locations/route.ts:109`, which
correctly set `private, max-age=30`), sorted by `businessName` with no index to
serve the sort. It is fetched on rider and warehouse work tables.

Same shape at `src/app/api/admin/package-requests/route.ts:19-46`,
`src/app/api/packages/route.ts:32-55` (plus a JS-side `tiers.filter` per
package at `:87-91`) and `src/app/api/delivery-cities/route.ts:7-20`.

**Fix:** at minimum `Cache-Control` + a generous default limit on the merchant
roster; give `merchant.businessName` an index if the sort stays.

---

# R4 — Product & growth

> The notification design deferred under **P4.1** of the previous roadmap
> carries forward as R4.1 — the design work was kept, only the build moved.

### R4.1 Notification system

No notification primitive exists: two hits for "notification" in the entire
codebase, both prose (`src/app/apply/rider/page.tsx:279` and a seed subject
line). **Zero** `webhook`, **zero** SSE/WebSocket — `socket` and `EventSource`
return no matches. Email goes through a real outbox, so the transport for the
first tier already exists.

**Ship in this order:**

1. In-app notifications driven by the email-outbox events (order created,
   dispatched, delivered, failed, cash submitted, payout approved) — the
   events are already emitted, only the sink is missing.
2. Per-event delivery preferences.
3. Webhooks + API keys for merchants (unblocks R4.3).
4. SMS for delivery/COD confirmations (R4.4).

### R4.2 Bangla / i18n — decide *now*, before more copy lands

Zero i18n framework (`next-intl`, `i18next`, `useTranslation` all return 0
matches), `lang="en"` hardcoded at `src/app/layout.tsx:87`,
`src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:89`, and **308**
`aria-label=` / `placeholder=` / `title=` / `emptyMessage=` literals across
`src/app/**` and `src/features/**` alone — before counting plain JSX copy.
`src/lib/content-keywords.ts` is branding-only, not translation.

Retrofitting a catalog over ~500 string sites later is far more expensive
than standing up `messages/en.json` today with `config/content.ts` as its
first consumer.

**Decision to record explicitly:** *English-only is permanent*, or *Bangla
ships in a later phase*. Either answer is fine — not deciding is not.

### R4.3 Merchant integration surface: API keys, webhooks, OpenAPI

Zero hits for `webhook`, `api-key`, `apiKey`, `openapi`, `swagger`. Merchants
cannot push orders programmatically at all. This is the single biggest barrier
to onboarding anyone above small volume, and it is the reason every merchant
conversation ends in "can we integrate?".

**Ship:** `/api/v1/orders` behind API keys, signed webhooks on order state
changes (the state machine at `src/features/orders/transitions.ts` is the
event source), and a docs page generated from Zod schemas (already
centralised in `src/lib/validation.ts`).

### R4.4 SMS — either wire it or fix the copy

`src/app/track/page.tsx:49` says "the delivery SMS or the parcel label" and
`:205` says "Check the SMS or your merchant sent" — but only two `SMS` hits
exist in the codebase and no provider is ever called. The product promises a
channel it does not have.

### R4.5 Route optimisation and auto-assignment

No route optimisation (`routeOptim` → 0 hits) and no auto-assignment
(`autoAssign`, `assignedRider` → 0 hits). Dispatch is fully manual
(`dispatch` → 107 hits, all manual transitions). The first real ROI win for a
fleet.

### R4.6 Delivery windows and time slots

No `deliveryWindow` or `timeSlot` anywhere. For a Dhaka same-day market this
is table stakes for merchant-facing quoting.

### R4.7 Invoices and printable parcel labels

No `invoice`, `barcode` or label print beyond the rider apply page's
`rider-apply-print` button. Merchants need a printable packing slip and a
scannable parcel label — the rider app has photo/signature capture already
(`deliveryProof`, `signature` present), so POD is covered; the label is not.

### R4.8 Promotional and volume-based pricing

No `coupon`, `promo`, `subscription` or `coupon` logic. The pricing engine is
already sophisticated — multi-zone matrix (`delivery_zone` → `zone_pricing`),
packages with tiers, a calculator — so the commercial lever is the missing
piece, not the machinery.

### R4.9 Reporting exports

CSV is wired generically in the DataTable, but there is no curated report
(per-merchant performance, cash reconciliation, rider productivity) and no
scheduled email report. `delivery-performance`, `cod-settlement`, `finance`
and `earnings` dashboards exist — they are not exportable.

---

# R5 — Consistency & polish

### R5.1 In-card brand on mobile — shipped on 3 pages, 4 remain

Mobile logo placement moved **inside** the bordered card on `/login`,
`/register` and `/apply/rider`, via the shared `src/components/auth-card-brand.tsx`
(`lg:hidden`, first child of `CardHeader`, `data-testid="auth-card-brand"`),
with DOM-containment specs on all three pages.

Still floating above the card:

| Page | `src/app/…` | Floating logo line |
|---|---|---|
| Forgot password | `forgot-password/page.tsx` | `:101` |
| Reset password | `reset-password/page.tsx` | `:164` |
| Activate | `activate/page.tsx` | `:84` |
| Activated | `activated/page.tsx` | `:38` |

**Done when:** no `mb-8 flex items-center` logo link remains outside a
`<Card>`, and each page has a containment spec asserting
`brand.closest('[data-slot="card"]')?.contains(brand)`.

### R5.2 Duplicate timeline step definitions

`src/features/orders/components/tracking-timeline.tsx:20-97` re-declares
`StepKey`, `STATUS_RANK` and `STEPS` that already exist in
`src/app/track/[id]/lib.ts:47-124`. Two sources of truth for one concept —
one of which carries the R3.3 formatter bug.

**Fix:** move them to a shared module and have both import it.

### R5.3 Dead `pageSizeOptions` plumbing

`src/components/data-table/types.ts:79` declares it, `index.tsx:91,861`
thread it, `pagination.tsx:72-96` renders a `<select>` — and no call site
passes it, so the control never appears. Either enable it on the main
operational tables or delete the prop and the `<select>`.

### R5.4 Unreachable empty-state strings

`src/app/dashboard/audit-logs/audit-logs-client.tsx:137` and
`src/app/dashboard/email-logs/page.tsx:280` pass
`isLoading ? "Loading…" : "…"`, but `data-table/index.tsx:502` renders
skeleton rows whenever `loading` is true, so the loading branch never renders.
Additionally `audit-logs-client.tsx` hardcodes its column headers instead of
using `columnLabels`, unlike every sibling page.

### R5.5 No per-segment `not-found.tsx`

Only the root `not-found.tsx` and `track/[id]/not-found.tsx` exist; `dashboard`,
`merchant`, `warehouse` and `rider` have `error.tsx` + `loading.tsx` but no
`not-found.tsx`, so a bad ID under `/dashboard/orders/[code]` renders the
generic app-wide 404. Also `src/components/ui/table.tsx:68-79` — `<th>` lacks
`scope="col"`.

### R5.6 Incomplete PWA manifest and no offline affordance

`src/app/manifest.ts` lacks `id`, `orientation`, `categories` and `lang`
(missing `id` means a future install may be treated as a different app).
`src/components/service-worker-register.tsx:10-21` registers only in
production; there is no `beforeinstallprompt` handling, no `navigator.onLine`
banner, no push. The manifest currently claims installability the app does not
design for.

### R5.7 Root configs, workflows and every markdown file are outside Biome

`biome.json` `files.includes` covers only `src/**`, `e2e/**`, `env/**` and
`scripts/**`. That leaves unformatted and unlinted:

- `playwright.config.ts`, `vitest.config.ts`, `drizzle.config.ts`,
  `next.config.mjs`, `test-setup.ts`
- every `.json` at the root (`package.json`, `tsconfig.json`)
- all of `.github/workflows/*.yml` and `docker/*.yml`
- all `*.md` — README, CONTRIBUTING, `docs/*`, AGENTS.md, this file

Meanwhile `lint-staged` (`package.json`) runs
`biome check --write --no-errors-on-unmatched` over `*.{…,md,mdx}` — Biome
does not parse markdown, so `--no-errors-on-unmatched` silently turns the
markdown entry into a no-op.

**Fix:** widen `files.includes` to `*.{ts,mts,js,mjs,json}`, and either drop
`md,mdx` from `lint-staged` or point them at a real markdown linter. Consider
`actionlint` for the workflows — which is where R1.1's missing
`timeout-minutes` would have been caught.

**Done when:** `biome check .` reports the root configs in its "Checked"
count, and `lint-staged` has no dead glob.

*(Note: Biome's `a11y` ruleset is enabled — `noSvgWithoutTitle`,
`useValidAriaRole`, `noLabelWithoutControl`, `noAutofocus`, `useButtonType` —
which is why those classes of bug are absent. It does not catch the R2
findings: `aria-current`, `aria-hidden` misuse, focus order, or keyboard
operability are all outside its reach, so those still need a manual/aXe pass.)*

### R5.8 AGENTS.md suite metadata is stale

Covered by R1.4 — but note that AGENTS.md also claims a "route-audit" note
about `/warehouse/warehouses` being undocumented; keep that as intentional (it
redirects warehouse admins away).

### R5.9 Bundle, image and response-header weight

Moved out of R3 — real, but not the platform risk that band is for. They
share a theme: everything the server ships out the door.

- **The Docker image ships every devDependency.** `docker/Dockerfile:61`
  copies the full `node_modules` from the `deps` stage, so `typescript`,
  `@playwright/test`, `vitest` and `drizzle-kit` reach an image that only runs
  `server.js`. A `pnpm deploy --prod` stage fixes it; the image is otherwise
  excellent (multi-stage, cache mounts, non-root, `HEALTHCHECK`).
- **`recharts` is bundled eagerly on every chart page.** There is exactly one
  `next/dynamic` in the codebase (`src/app/merchant/page.tsx:11`); everything
  else imports through the `@/components/charts` barrel, so all of recharts
  lands on the dashboard critical path. Same shape in
  `src/components/markdown.tsx`, pulling `react-markdown` + `remark-gfm` into
  three static server pages.
- **`@aws-sdk/client-s3` ships even when `STORAGE_PROVIDER=local`** — the
  default install never touches R2. Lazy-import `storage/r2.ts` behind the
  provider switch.
- **`style-src` still allows `unsafe-inline` and nothing sets HSTS**
  (`src/proxy.ts:77`). Both `next-themes` and `nextjs-toploader` accept a
  nonce; HSTS is arguably the cloudflared edge's job, but nothing sets it
  either. Also drop `poweredByHeader`.

---

# Guardrails — verified-clean areas (don't regress these)

**Testing & policy**

| Area | Status |
|---|---|
| **Auth on every API route** | enforced by `src/app/api/route-auth-guard.spec.ts` |
| **E2E selector policy** | `data-testid` first, centralised in `e2e/selectors.ts` |
| **Docs drift** | `src/app/__tests__/docs-drift.spec.ts`, `ci-workflow.spec.ts`, `compose-cron.spec.ts` already exist — extend them rather than starting new ones (see R1.4, R0.5) |

**UI & accessibility**

| Area | Status |
|---|---|
| **DataTable semantics** | real `<table>`/`<th>`, keyboard-focusable sort buttons, `aria-sort` on the active column |
| **Status is never colour-only** | `src/components/status-badge.tsx` always renders text; label/tone maps live in `src/lib/constants.ts` |
| **Error/loading boundaries** | `error.tsx` + `loading.tsx` for all four role segments plus the public routes; `DataErrorBanner` wired into all four shells |
| **Skip link** | `src/components/skip-to-content.tsx`, rendered once at `src/app/layout.tsx:93` |
| **Dialogs** | `FormDialog` always renders `DialogTitle` + optional `DialogDescription` — the R2.8 problem is call sites bypassing it, not the base component |

**Data layer**

| Area | Status |
|---|---|
| **Trigram coverage** | 30 `gin_trgm_ops` indexes back every `ILIKE` column, including the NID search at `schema.postgres/merchants.ts:105` |
| **Pagination guards** | every table-backed list passes `defaultLimit`; `MAX_OFFSET = 100_000` and `MAX_LIMIT = 100` clamp hostile input (`src/lib/pagination.ts`) |
| **Money paths are transactional** | consistent `db.transaction` + `SELECT … FOR UPDATE` (`payouts/route.ts:225-244`, `payout-settlement.ts:45-49`, `balance/payment/route.ts:41-58`) |
| **Partial unique indexes as hard guarantees** | `finance.ts:89-91`, `packages.ts:122-125,166` |
| **Outbox concurrency** | `FOR UPDATE SKIP LOCKED` + 10-min stale-`SENDING` recovery (`src/lib/email-outbox.ts:75-86,100`) |
| **Lock ordering** | orders → balance, documented and consistent |
| **Batching already done right in places** | `pickupLocationHubs` (`db/order-lookup.ts:61-79`), the bulk-endpoint pricing pre-fetch (`orders/bulk/route.ts:111-175`), `orders/counts` `FILTER` query (`:40-47`) — **these are the patterns R3.5–R3.7 should copy** |
| **Migration gate** | compose `depends_on: service_completed_successfully` on the migrate job |
| **No raw SQL with user input** | the only `sql.raw` is `src/lib/db/time-sql.ts:15`, interpolating the constant `BUSINESS_TIMEZONE` |

**Ops**

| Area | Status |
|---|---|
| **Docker hygiene** | non-root user, build-cache mounts, `HEALTHCHECK` on `/api/ready` |
| **Cron auth** | timing-safe SHA-256 compare in `src/lib/cron-auth.ts` |
| **Read/write replica split** | `db` for writes, `dbRead` for reads — but see R0.11 for where it leaks |
| **Day-boundary rule** | `BUSINESS_TIMEZONE` + `businessToday()` — correct wherever it is used (extend it, don't reinvent it: see R0.3, R3.3) |
