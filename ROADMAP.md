# ROADMAP

> Forward-looking only - shipped work lives in git history and in the
> `ROADMAP <id>` annotations left beside the code it changed.
>
> **Health:** `pnpm ci:check` green (831 files) · Unit **2121 pass** (206 spec
> files) · coverage **55.23 / 48.45 / 42.98 / 56.04** against floors
> **49 / 42 / 37 / 50** · real-DB integration **18/18** · E2E **125 tests /
> 32 files / S1-S73** (S36 retired with the branding feature), run locally only
> (`pnpm test:e2e`) by decision - CI stays on lint, typecheck, coverage and
> build · `route-auth-guard.spec.ts` enforces server-side auth on every API
> route · `pnpm build` green.
>
> **Every change verifies with:** `pnpm ci:check` → `pnpm test:unit:run` →
> `pnpm build` → `pnpm test:e2e` (+ `pnpm test:integration` when DB invariants
> move).
>
> **Source of this document:** a full re-audit (product · data layer ·
> operability · accessibility) performed against the current tree. Every entry
> cites a `file:line` that was verified by hand - re-verify before acting, and
> update the citation if the line has moved.
>
> **Closed bands.** R0 Correctness (12/12), R1 Quality gates (8/8),
> R2 Accessibility (10/10) and R3 Platform, ops & performance (11/11) are all
> shipped and are no longer carried below. Their detail - the `file:line`
> citations, the reasoning and the non-vacuity check for each fix - is in git
> history under the id, and the `ROADMAP R<n.m>` annotations are still beside
> the code they changed. Where an id appears in the text below it is a pointer
> to that history, not an open item.

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

**R0-R3 are closed**, so only R4 and R5 are open, and they are worked in the
order **R5 first, R4 after it**. The four closed bands stay in the table because
their bars still apply if one reopens - a newly discovered R0-class defect jumps
the queue, and nothing in R4 or R5 ships while an R0 item is open.

### Decisions already made (recorded so they are not re-opened)

| Decision | Detail |
|---|---|
| **E2E runs locally, not in CI** | `pnpm test:e2e` (125 tests, ~6 min) is run by hand before merge. It is deliberately **not** wired into `.github/workflows/ci.yml` because of runner cost - do not "helpfully" re-add an `e2e` job. The `e2e:` block in `ci.yml:169-215` stays commented out on purpose. |
| **Coverage floors are a floor, not a target** | Raise them as tests land; never lower them to make CI pass. |
| **Closed bands are not carried in this document** | Do not re-add R0-R3 summaries. The ids stay useful as pointers (the annotations in code and the git log), which is why they are still cited in prose. |

---

# R4 - Product & growth

> The notification design deferred by the previous roadmap carries forward as
> R4.1 - the design work was kept, only the build moved.

### R4.1 Notification system

No notification primitive exists: two hits for "notification" in the entire
codebase, both prose (`src/app/apply/rider/page.tsx:279` and a seed subject
line). **Zero** `webhook`, **zero** SSE/WebSocket - `socket` and `EventSource`
return no matches. Email goes through a real outbox, so the transport for the
first tier already exists.

**Ship in this order:**

1. In-app notifications driven by the email-outbox events (order created,
   dispatched, delivered, failed, cash submitted, payout approved) - the
   events are already emitted, only the sink is missing.
2. Per-event delivery preferences.
3. Webhooks + API keys for merchants (unblocks R4.3).
4. SMS for delivery/COD confirmations (R4.4).

### R4.2 Bangla / i18n - decide *now*, before more copy lands

Zero i18n framework (`next-intl`, `i18next`, `useTranslation` all return 0
matches), `lang="en"` hardcoded at `src/app/layout.tsx:87`,
`src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:89`, and **308**
`aria-label=` / `placeholder=` / `title=` / `emptyMessage=` literals across
`src/app/**` and `src/features/**` alone - before counting plain JSX copy.
`src/lib/content-keywords.ts` is branding-only, not translation.

Retrofitting a catalog over ~500 string sites later is far more expensive
than standing up `messages/en.json` today with `config/content.ts` as its
first consumer.

**Decision to record explicitly:** *English-only is permanent*, or *Bangla
ships in a later phase*. Either answer is fine - not deciding is not.

### R4.3 Merchant integration surface: API keys, webhooks, OpenAPI

Zero hits for `webhook`, `api-key`, `apiKey`, `openapi`, `swagger`. Merchants
cannot push orders programmatically at all. This is the single biggest barrier
to onboarding anyone above small volume, and it is the reason every merchant
conversation ends in "can we integrate?".

**Ship:** `/api/v1/orders` behind API keys, signed webhooks on order state
changes (the state machine at `src/features/orders/transitions.ts` is the
event source), and a docs page generated from Zod schemas (already
centralised in `src/lib/validation.ts`).

### R4.4 SMS - either wire it or fix the copy

`src/app/track/page.tsx:49` says "the delivery SMS or the parcel label" and
`:205` says "Check the SMS or your merchant sent" - but only two `SMS` hits
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
scannable parcel label - the rider app has photo/signature capture already
(`deliveryProof`, `signature` present), so POD is covered; the label is not.

### R4.8 Promotional and volume-based pricing

No `coupon`, `promo`, `subscription` or `coupon` logic. The pricing engine is
already sophisticated - multi-zone matrix (`delivery_zone` → `zone_pricing`),
packages with tiers, a calculator - so the commercial lever is the missing
piece, not the machinery.

### R4.9 Reporting exports

CSV is wired generically in the DataTable, but there is no curated report
(per-merchant performance, cash reconciliation, rider productivity) and no
scheduled email report. `delivery-performance`, `cod-settlement`, `finance`
and `earnings` dashboards exist - they are not exportable.

---

# R5 - Consistency & polish

### R5.1 In-card brand on mobile - shipped on 3 pages, 4 remain

Mobile logo placement moved **inside** the bordered card on `/login`,
`/register` and `/apply/rider`, via the shared `src/components/auth-card-brand.tsx`
(`lg:hidden`, first child of `CardHeader`, `data-testid="auth-card-brand"`),
with DOM-containment specs on all three pages.

Still floating above the card:

| Page | `src/app/.` | Floating logo line |
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
`src/app/track/[id]/lib.ts:47-124`. Two sources of truth for one concept - one
of which was carrying the date-formatting bug that R3.3 had to fix.

**Fix:** move them to a shared module and have both import it.

### R5.3 Dead `pageSizeOptions` plumbing

`src/components/data-table/types.ts:79` declares it, `index.tsx:91,901`
thread it, `pagination.tsx:20,72-90` renders a `<select>` - and no call site
passes it, so the control never appears. Either enable it on the main
operational tables or delete the prop and the `<select>`.

### R5.4 Unreachable empty-state strings

`src/app/dashboard/audit-logs/audit-logs-client.tsx:138` and
`src/app/dashboard/email-logs/page.tsx:281` pass
`isLoading ? "Loading…" : "…"`, but `data-table/index.tsx` renders skeleton
rows whenever `loading` is true, so the loading branch never renders.
Additionally `audit-logs-client.tsx` hardcodes its column headers instead of
using `columnLabels`, unlike every sibling page.

### R5.5 No per-segment `not-found.tsx`

Only `src/app/not-found.tsx` and `src/app/track/[id]/components/not-found.tsx`
exist; `dashboard`, `merchant`, `warehouse` and `rider` have `error.tsx` +
`loading.tsx` but no `not-found.tsx`, so a bad ID under
`/dashboard/orders/[code]` renders the generic app-wide 404. Also
`src/components/ui/table.tsx:68-79` - `<th>` lacks `scope="col"`.

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
- all `*.md` - README, CONTRIBUTING, `docs/*`, AGENTS.md, this file

Meanwhile `lint-staged` (`package.json`) runs
`biome check --write --no-errors-on-unmatched` over
`*.{js,jsx,ts,tsx,json,css,md,mdx}` - Biome does not parse markdown, so
`--no-errors-on-unmatched` silently turns the markdown entry into a no-op.

**Fix:** widen `files.includes` to `*.{ts,mts,js,mjs,json}`, and either drop
`md,mdx` from `lint-staged` or point them at a real markdown linter. Consider
`actionlint` for the workflows - Biome would have caught the missing
`timeout-minutes` on the CI jobs.

**Done when:** `biome check .` reports the root configs in its "Checked"
count, and `lint-staged` has no dead glob.

*(Note: Biome's `a11y` ruleset is enabled - `noSvgWithoutTitle`,
`useValidAriaRole`, `noLabelWithoutControl`, `noAutofocus`, `useButtonType` -
which is why those classes of bug are absent. It does not catch the R2
findings: `aria-current`, `aria-hidden` misuse, focus order, or keyboard
operability are all outside its reach, so those still need a manual/aXe pass.)*

### R5.8 Bundle, image and response-header weight

*(Numbering skipped: R5.8, "AGENTS.md suite metadata is stale", was retired -
the drift it described was closed by the docs-drift assertions and the numbers
now match the tree, so it is a completed task rather than work.)*

Real, but not the platform risk R3 was for. They share a theme: everything
the server ships out the door.

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
- **`@aws-sdk/client-s3` ships even when `STORAGE_PROVIDER=local`** - the
  default install never touches R2. Lazy-import `storage/r2.ts` behind the
  provider switch.
- **`style-src` still allows `unsafe-inline` and nothing sets HSTS**
  (`src/proxy.ts:77`). Both `next-themes` and `nextjs-toploader` accept a
  nonce; HSTS is arguably the cloudflared edge's job, but nothing sets it
  either. Also drop `poweredByHeader`.

---

# Guardrails - verified-clean areas (don't regress these)

**Testing & policy**

| Area | Status |
|---|---|
| **Auth on every API route** | enforced by `src/app/api/route-auth-guard.spec.ts` |
| **E2E selector policy** | `data-testid` first, centralised in `e2e/selectors.ts` |
| **Docs drift** | `src/app/__tests__/docs-drift.spec.ts`, `ci-workflow.spec.ts`, `compose-cron.spec.ts` already exist - extend them rather than starting new ones |
| **E2E suite serials** | unique, S1-S73 with S36 unused; `docs-drift.spec.ts` also asserts the AGENTS.md summary and the documented coverage floors match the tree |

**UI & accessibility**

| Area | Status |
|---|---|
| **DataTable semantics** | real `<table>`/`<th>`, keyboard-focusable sort buttons, `aria-sort` on the active column |
| **Status is never colour-only** | `src/components/status-badge.tsx` always renders text; label/tone maps live in `src/lib/constants.ts` |
| **Error/loading boundaries** | `error.tsx` + `loading.tsx` for all four role segments plus the public routes; `DataErrorBanner` wired into all four shells |
| **Skip link** | `src/components/skip-to-content.tsx`, rendered once at `src/app/layout.tsx:93` |
| **Dialogs** | `FormDialog` always renders `DialogTitle` + optional `DialogDescription` - the R2.8 problem was call sites bypassing it, not the base component |
| **44px touch targets** | `hit-target-44` in `globals.css` + the `buttonVariants` base; `button.spec.tsx` scans for adjacent buttons whose targets would overlap |

**Data layer**

| Area | Status |
|---|---|
| **Trigram coverage** | 30 `gin_trgm_ops` indexes back every `ILIKE` column, including the NID search at `schema.postgres/merchants.ts:105` |
| **Pagination guards** | every table-backed list passes `defaultLimit`; `MAX_OFFSET = 100_000` and `MAX_LIMIT = 100` clamp hostile input (`src/lib/pagination.ts`) |
| **Pagination totals stay exact** | `count(*)` results feeding a table's `initialTotal` are deliberately *not* cached - see `src/lib/cached-stats.ts` for the split between cached stat tiles and exact list totals |
| **Money paths are transactional** | consistent `db.transaction` + `SELECT . FOR UPDATE` (`payouts/route.ts:225-244`, `payout-settlement.ts:45-49`, `balance/payment/route.ts:41-58`) |
| **Partial unique indexes as hard guarantees** | `finance.ts:89-91`, `packages.ts:122-125,166` |
| **Outbox concurrency** | `FOR UPDATE SKIP LOCKED` + 10-min stale-`SENDING` recovery (`src/lib/email-outbox.ts:75-86,100`) |
| **Lock ordering** | orders → balance, documented and consistent |
| **Batching already done right in places** | `pickupLocationHubs` (`db/order-lookup.ts:61-79`), the bulk-endpoint pricing pre-fetch (`orders/bulk/route.ts:111-175`), `orders/counts` `FILTER` query (`:40-47`) - **these are the patterns to copy** |
| **Migration gate** | compose `depends_on: service_completed_successfully` on the migrate job |
| **No raw SQL with user input** | the only `sql.raw` is `src/lib/db/time-sql.ts:15`, interpolating the constant `BUSINESS_TIMEZONE` |

**Ops**

| Area | Status |
|---|---|
| **Docker hygiene** | non-root user, build-cache mounts, `HEALTHCHECK` on `/api/ready` |
| **Cron auth** | timing-safe SHA-256 compare in `src/lib/cron-auth.ts` |
| **Read/write replica split** | `db` for writes, `dbRead` for reads - session resolution, guards and `buildUpdate` all read through it |
| **Day-boundary rule** | `BUSINESS_TIMEZONE` + `businessToday()` - correct wherever it is used (extend it, don't reinvent it) |
