# ROADMAP

> Forward-looking only - shipped work lives in git history and in the
> `ROADMAP <id>` annotations left beside the code it changed.
>
> **Open work:** R4 Product only. R0-R3 closed earlier, and R5 Polish closed
> with P2 - see the ledger in git history and the decisions below.
>
> **Health:** `pnpm ci:check` green (852 files) · Unit **2184 pass** (212 spec
> files) · coverage **55.40 / 48.68 / 43.31 / 56.20** against floors
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

---

## The plan

| Priority | Items | Status |
|---|---|---|
| **P3 - High-leverage product work** | R4.2 · R4.4 · R4.3 · R4.1 | open |
| **P4 - Later product bets** | R4.5 · R4.6 · R4.7 · R4.8 · R4.9 | open |

P3 and P4 are the only groups left; earlier priorities were R5 polish work and
are closed. The numbering stays as it was so an id still means one thing in
git history, in the `ROADMAP <id>` annotations and here.

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

**R0-R3 and R5 are closed**, so only R4 is open - in the two groups above. The
closed bands stay in the table because their bars still apply if one reopens: a
newly discovered R0-class defect jumps the queue, and nothing in R4 ships while
an R0 item is open.

**Priorities are the order of work; ids are just identifiers.** The groups are
not in id sequence on purpose - what decides where an item sits is what it
blocks and what it costs to land, not when it was written down.

**Order:** R4.2 and R4.4 first (they are decisions, not builds, and everything
after them is constrained by the answers), then R4.3, then R4.1 which builds on
it.

### Decisions already made (recorded so they are not re-opened)

| Decision | Detail |
|---|---|
| **E2E runs locally, not in CI** | `pnpm test:e2e` (125 tests, ~6 min) is run by hand before merge. It is deliberately **not** wired into `.github/workflows/ci.yml` because of runner cost - do not "helpfully" re-add an `e2e` job. The `e2e:` block in `ci.yml:169-215` stays commented out on purpose. |
| **Coverage floors are a floor, not a target** | Raise them as tests land; never lower them to make CI pass. |
| **CI is lint, typecheck, coverage, integration and build** | `.github/workflows/` holds `ci.yml` and `deploy.yml` only. Code scanning is not part of the gate - `ci.yml`'s `security` job covers `pnpm audit` plus the advisory dependency review, and nothing more. |
| **Rows per page is one persisted preference, not a per-table control** | It lives on the user row (capped by `MAX_TABLE_ROWS_PER_PAGE`), is edited in Account Settings, and `DataTable` applies it as every table's default size. A second, unpersisted control in the footer would only have disagreed with the first. Do not add a rows-per-page `<select>` back to `TableFooter`. |
| **`style-src` keeps `'unsafe-inline'`** | Investigated and rejected. ~50 React `style={{...}}` bindings need `style-src-attr 'unsafe-inline'`, and `nextjs-toploader`'s `<style>` cannot be nonced: it renders the nonce without `suppressHydrationWarning`, so server value and client render disagree and hydration breaks. The reasoning is at `src/app/layout.tsx:94`. The only real hardening left is splitting `style-src-elem` (nonce) from `style-src-attr`; do not "simplify" the directive away. |
| **The Docker runner keeps the full dependency tree** | Investigated and rejected. The monolith's `migrate` service runs `node_modules/.bin/tsx` out of this same image, so a `--prod` install would break migrations. A `deps-prod` stage already existed and was removed as dead work, and `dockerfile-stages.spec.ts` asserts `COPY --from=deps ...node_modules` and forbids `pnpm install --prod`. Reducing image weight means moving `tsx` into `dependencies` first, not adding a stage. |
| **`biome.json` must stay strict JSON** | Biome rejects comments in it, then runs on defaults against every file in the tree (7013, `.next/**` included). JSONC goes in `biome.jsonc`. Pinned by `biome-config.spec.ts`. |

---

# P3 - High-leverage product work

Ordered by leverage: the two that are really *decisions* come first, because
everything after them either depends on or is constrained by them.

### R4.2 Bangla / i18n - decide *now*, before more copy lands

Zero i18n framework (`next-intl`, `i18next`, `useTranslation` all return 0
matches), `lang="en"` hardcoded at `src/app/layout.tsx:87`,
`src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:89`, and **308**
`aria-label=` / `placeholder=` / `title=` / `emptyMessage=` literals across
`src/app/**` and `src/features/**` alone - before counting plain JSX copy.
`src/lib/content-keywords.ts` is branding-only, not translation.

Retrofitting a catalog over ~500 string sites later is far more expensive
than standing up `messages/en.json` today with `config/content.ts` as its
first consumer. Table headers are already centralised in
`src/config/table-column-labels.ts`, and page copy in `src/config/content.ts` -
those two are the shape a catalog would take.

**Decision to record explicitly:** *English-only is permanent*, or *Bangla
ships in a later phase*. Either answer is fine - not deciding is not.

### R4.4 SMS - either wire it or fix the copy

`src/app/track/page.tsx:49` says "the delivery SMS or the parcel label" and
`:205` says "Check the SMS or your merchant sent" - but only two `SMS` hits
exist in the codebase and no provider is ever called. The product promises a
channel it does not have.

### R4.3 Merchant integration surface: API keys, webhooks, OpenAPI

Zero hits for `webhook`, `api-key`, `apiKey`, `openapi`, `swagger`. Merchants
cannot push orders programmatically at all. This is the single biggest barrier
to onboarding anyone above small volume, and it is the reason every merchant
conversation ends in "can we integrate?".

**Ship:** `/api/v1/orders` behind API keys, signed webhooks on order state
changes (the state machine at `src/features/orders/transitions.ts` is the
event source), and a docs page generated from Zod schemas (already
centralised in `src/lib/validation.ts`).

### R4.1 Notification system

No notification primitive exists: two hits for "notification" in the entire
codebase, both prose (`src/app/apply/rider/page.tsx:279` and a seed subject
line). **Zero** `webhook`, **zero** SSE/WebSocket - `socket` and `EventSource`
return no matches. Email goes through a real outbox, so the transport for the
first tier already exists.

Builds on R4.3 (webhooks + API keys are step 3), which is why it sits after it
here rather than first.

**Ship in this order:**

1. In-app notifications driven by the email-outbox events (order created,
   dispatched, delivered, failed, cash submitted, payout approved) - the
   events are already emitted, only the sink is missing.
2. Per-event delivery preferences.
3. Webhooks + API keys for merchants (unblocks R4.3).
4. SMS for delivery/COD confirmations (R4.4).

---

# P4 - Later product bets

Each is a standalone feature with no dependency on the work above; they are
last because none of them is blocking anything today.

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

# Guardrails - verified-clean areas (don't regress these)

**Testing & policy**

| Area | Status |
|---|---|
| **Auth on every API route** | enforced by `src/app/api/route-auth-guard.spec.ts` |
| **E2E selector policy** | `data-testid` first, centralised in `e2e/selectors.ts` |
| **Docs drift** | `src/app/__tests__/docs-drift.spec.ts`, `ci-workflow.spec.ts`, `compose-cron.spec.ts` already exist - extend them rather than starting new ones |
| **E2E suite serials** | unique, S1-S73 with S36 unused; `docs-drift.spec.ts` also asserts the AGENTS.md summary and the documented coverage floors match the tree |
| **Workflow shape** | `ci-workflow.spec.ts` and `deploy-workflow.spec.ts` read `ci.yml` / `deploy.yml` and pin job shape, step order and the required env union |
| **Source-level invariants** | `biome-config.spec.ts`, `p2-polish.spec.ts`, `dockerfile-stages.spec.ts` read the source rather than rendering it - structural claims have no other way to fail |

**UI & accessibility**

| Area | Status |
|---|---|
| **DataTable semantics** | real `<table>`/`<th>` with `scope="col"`, keyboard-focusable sort buttons, `aria-sort` on the active column |
| **Status is never colour-only** | `src/components/status-badge.tsx` always renders text; label/tone maps live in `src/lib/constants.ts` |
| **Error/loading boundaries** | `error.tsx` + `loading.tsx` + `not-found.tsx` for all four role segments plus the public routes; `DataErrorBanner` wired into all four shells |
| **Skip link** | `src/components/skip-to-content.tsx`, rendered once at `src/app/layout.tsx:93` |
| **Dialogs** | `FormDialog` always renders `DialogTitle` + optional `DialogDescription` - the R2 problem was call sites bypassing it, not the base component |
| **44px touch targets** | `hit-target-44` in `globals.css` + the `buttonVariants` base; `button.spec.tsx` scans for adjacent buttons whose targets would overlap |
| **Form error display** | two-layer: `FormErrors` summary as the focus target, plus the message under the control. Errors are frozen on submit, never derived per keystroke - see CONTRIBUTING "Form validation error display" |
| **In-card brand on auth screens** | `AuthCardBrand` as the first child of `CardHeader`; containment specs on every auth page |

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
| **One timeline definition** | `src/lib/order-timeline.ts` owns the steps, ranks and formatter; a source scan fails if the track page or the admin table declares its own copy again |

**Ops**

| Area | Status |
|---|---|
| **Docker hygiene** | non-root user, build-cache mounts, `HEALTHCHECK` on `/api/ready` |
| **Cron auth** | timing-safe SHA-256 compare in `src/lib/cron-auth.ts` |
| **Read/write replica split** | `db` for writes, `dbRead` for reads - session resolution, guards and `buildUpdate` all read through it |
| **Day-boundary rule** | `BUSINESS_TIMEZONE` + `businessToday()` - correct wherever it is used (extend it, don't reinvent it) |
| **Static security headers** | `poweredByHeader: false` + HSTS in `next.config.mjs`, pinned by `security-headers.spec.ts`; the nonce'd CSP stays in `src/proxy.ts` |
