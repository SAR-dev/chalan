# ROADMAP

> Forward-looking only - shipped work lives in git history and in the
> `ROADMAP <id>` annotations left beside the code it changed.
>
> **Open work:** R4 Product only. R0-R3 closed earlier, and R5 Polish closed
> with P2 - see the ledger in git history and the decisions below.
> **R4.4 (SMS) has been withdrawn from planning** - see Decisions.
>
> **Health:** `pnpm ci:check` green (883 files) · Unit **2281 pass** (2300
> total, 222 spec files) · coverage **55.79 / 49.22 / 43.79 / 56.57** against
> floors **49 / 42 / 37 / 50** · real-DB integration **19/19** · E2E **138
> tests / 34 files / S1-S76** (S36 gap preserved), run locally only
> (`pnpm test:e2e`, ~12 min) by decision - CI runs quality · build · security ·
> coverage · integration jobs and nothing else · `route-auth-guard.spec.ts`
> enforces server-side auth on all 127 API route files · `pnpm build` green.
>
> **Every change verifies with:** `pnpm ci:check` → `pnpm test:unit:run` →
> `pnpm build` → `pnpm test:e2e` (+ `pnpm test:integration` when DB invariants
> move).
>
> **Source of this document:** a full re-audit (product · data layer ·
> operability · accessibility), re-verified 2026-10-04 against the tree after
> the TopNav / announcement read-state rework. Every entry cites a `file:line`
> that was verified by hand - re-verify before acting, and update the citation
> if the line has moved.

---

## The plan

| Priority | Items | Status |
|---|---|---|
| **P3 - High-leverage product work** | R4.2 · R4.3 · R4.1 | open |
| **P4 - Later product bets** | R4.6 · R4.7 · R4.8 · R4.9 | open |

P3 and P4 are the only groups left; earlier priorities were R5 polish work and
are closed. The numbering stays as it was so an id still means one thing in
git history, in the `ROADMAP <id>` annotations and here. R4.4 was withdrawn
and its id is retired, not reused.

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

**Order:** R4.2 first (it is a decision, not a build, and everything after it
is constrained by the answer), then R4.3, then R4.1 which builds on it.

### Decisions already made (recorded so they are not re-opened)

| Decision | Detail |
|---|---|
| **R4.4 (SMS) is out of scope** | Withdrawn from this roadmap; the id is retired, not reused. The platform sends no SMS and none is planned. The two `SMS` strings at `src/app/track/page.tsx:49` and `:205` are deliberately untouched — line 205 attributes the message to *the merchant* ("the SMS or email your merchant sent"), who may text their own customer outside the platform. Do not "fix" this copy by wiring an SMS provider; that needs a new roadmap item. |
| **E2E runs locally, not in CI** | `pnpm test:e2e` (138 tests, ~8 min) is run by hand before merge. It is deliberately **not** wired into `.github/workflows/ci.yml` because of runner cost - do not "helpfully" re-add an `e2e` job. The commented block in `ci.yml:170-217` stays commented; `ci-workflow.spec.ts` still validates its step ordering by stripping comment markers, so re-enabling must keep that order. |
| **Coverage floors are a floor, not a target** | Raise them as tests land; never lower them to make CI pass. Current measurement sits ~5-6 points above the floors; a drop toward them is a signal, not headroom. |
| **CI is quality, build, security, coverage and integration** | `.github/workflows/` holds `ci.yml` and `deploy.yml` only. Code scanning is not part of the gate - `ci.yml`'s `security` job covers `pnpm audit` plus the advisory dependency review, and nothing more. |
| **Rows per page is one persisted preference, not a per-table control** | It lives on the user row (capped by `MAX_TABLE_ROWS_PER_PAGE`), is edited in Account Settings, and `DataTable` applies it as every table's default size. A second, unpersisted control in the footer would only have disagreed with the first. Do not add a rows-per-page `<select>` back to `TableFooter`. |
| **`style-src` keeps `'unsafe-inline'`** | Investigated and rejected. ~50 React `style={{...}}` bindings need `style-src-attr 'unsafe-inline'`, and `nextjs-toploader`'s `<style>` cannot be nonced: it renders the nonce without `suppressHydrationWarning`, so server value and client render disagree and hydration breaks. The reasoning is at `src/app/layout.tsx:94-97`. The only real hardening left is splitting `style-src-elem` (nonce) from `style-src-attr`; do not "simplify" the directive away. |
| **The Docker runner keeps the full dependency tree** | Investigated and rejected. The monolith's `migrate` service runs `node_modules/.bin/tsx` out of this same image, so a `--prod` install would break migrations. A `deps-prod` stage already existed and was removed as dead work, and `dockerfile-stages.spec.ts` asserts `COPY --from=deps ...node_modules` and forbids `pnpm install --prod`. Reducing image weight means moving `tsx` into `dependencies` first, not adding a stage. |
| **`biome.json` must stay strict JSON** | Biome rejects comments in it. JSONC goes in `biome.jsonc`. Its `files.includes` scopes it to `src/`, `e2e/`, `env/`, `scripts/` and root files (`.next/**` is excluded by omission). Pinned by `biome-config.spec.ts`. |

---

# P3 - High-leverage product work

Ordered by leverage: R4.2 is a *decision* and comes first, because everything
after it either depends on or is constrained by it.

### R4.2 Bangla / i18n - decide *now*, before more copy lands

Zero i18n framework (`next-intl`, `i18next`, `useTranslation` all return 0
matches), `lang="en"` hardcoded at `src/app/layout.tsx:87`,
`src/app/global-error.tsx:18` and `src/lib/email/templates.tsx:86`, and ~310
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

### R4.3 Merchant integration surface: API keys, webhooks, OpenAPI

No merchant-facing integration surface exists: `apiKey`, `api-key`,
`openapi` and `swagger` return **0** matches, and the only `webhook` hits are
the ops-only `ERROR_WEBHOOK_URL` sink (`src/lib/error-report.ts:16`,
`src/lib/env.ts:174` - POSTs unhandled 500s to an operator, nothing a merchant
can call). Merchants cannot push orders programmatically at all. This is the
single biggest barrier to onboarding anyone above small volume, and it is the
reason every merchant conversation ends in "can we integrate?".

**Ship:** `/api/v1/orders` behind API keys, signed webhooks on order state
changes (the state machine at `src/features/orders/transitions.ts` is the
event source), and a docs page generated from Zod schemas (already
centralised in `src/lib/validation.ts`).

### R4.1 Notification system

No notification primitive exists: four hits for "notification" in the entire
codebase, all prose or comments (`src/app/manifest.ts:12`,
`src/app/manifest.spec.ts:13`, `src/app/apply/rider/page.tsx:279`, a seed
subject line). **Zero** SSE/WebSocket - `EventSource` and `new WebSocket`
return no matches.

Two things that landed since the last audit make the first tier *cheaper*:

- **The in-app sink already exists.** The TopNav announcement bell
  (`src/features/announcements/components/announcement-bell.tsx`) is exactly
  the surface an in-app notification stream needs - badge, link to a feed,
  mounted once per shell for every role. An in-app notification feed would
  grow *beside* announcements, not replace them: the bell currently ships no
  tray precisely so this slot stays free for R4.1's tray (the announcement
  link keeps its shape; the tray hosts notifications).
- **The per-user watermark pattern already exists.**
  `profile.announcementsSeenAt` (one nullable timestamp, stamped by
  `POST /api/announcements/seen`, advanced only via `GREATEST`) is the template
  for cheap per-user "what's new" state - and its *removal* of
  `announcement_read` is the other half of the lesson: per-item read receipts
  under a broadcast feature were rejected as notification machinery in
  advance. R4.1's `notification_read` will be the first legitimate user of
  that shape.

Email goes through a real outbox, so the transport for the first tier already
exists.

Builds on R4.3 (webhooks + API keys are step 3), which is why it sits after it
here rather than first.

**Ship in this order:**

1. In-app notifications driven by the email-outbox events (order created,
   dispatched, delivered, failed, cash submitted, payout approved) - the
   events are already emitted, only the sink is missing.
2. Per-event delivery preferences.
3. Webhooks + API keys for merchants (unblocks R4.3).

---

# P4 - Later product bets

Each is a standalone feature with no dependency on the work above; they are
last because none of them is blocking anything today.

### R4.6 Delivery windows and time slots

No `deliveryWindow` or `timeSlot` anywhere. For a Dhaka same-day market this
is table stakes for merchant-facing quoting.

### R4.7 Invoices and printable parcel labels

No `invoice` or `barcode` code - the only hits are prose in `src/content/terms.md`
and the merchant help doc. The rider apply page's `rider-apply-print` button is
the only print flow in the product. Photo proof of delivery exists
(`deliveryProofRef`, set by the delivered transition, displayed on the public
track timeline), but **there is no signature capture** (the old claim that
`signature` was present was wrong - verified absent 2026-10-04) and no
scannable parcel label. Merchants need a printable packing slip and a label;
POD is covered, the label is not.

### R4.8 Promotional and volume-based pricing

No `coupon`, `promo` or `subscription` logic. The pricing engine is already
sophisticated - multi-zone matrix (`delivery_zone` → `zone_pricing`),
packages with tiers, a calculator - so the commercial lever is the missing
piece, not the machinery.

### R4.9 Reporting exports

CSV is wired generically in the DataTable, but there is no curated report
(per-merchant performance, cash reconciliation, rider productivity) and no
scheduled email report. `delivery-performance`, `cod-settlement`, `finance`
and `earnings` dashboards all exist - they are not exportable.

---

# Guardrails - verified-clean areas (don't regress these)

**Testing & policy**

| Area | Status |
|---|---|
| **Auth on every API route** | enforced by `src/app/api/route-auth-guard.spec.ts` over all 127 route files, with a minimal allowlist it also asserts stays minimal |
| **E2E selector policy** | `data-testid` first, centralised in `e2e/selectors.ts` |
| **Docs drift** | `src/app/__tests__/docs-drift.spec.ts`, `ci-workflow.spec.ts`, `compose-cron.spec.ts` already exist - extend them rather than starting new ones |
| **E2E suite serials** | unique, S1-S76 with S36 retired (gap preserved, ids never reused); `docs-drift.spec.ts` also asserts the AGENTS.md summary (`S1-S76 across 34 files / 138 tests`) and the documented coverage floors match the tree |
| **Workflow shape** | `ci-workflow.spec.ts` and `deploy-workflow.spec.ts` (both `src/app/__tests__/`) read `ci.yml` / `deploy.yml` and pin job shape, step order and the required env union |
| **Source-level invariants** | `biome-config.spec.ts`, `p2-polish.spec.ts`, `dockerfile-stages.spec.ts`, `dependency-security.spec.ts` (all in `src/app/__tests__/`) read the source rather than rendering it - structural claims have no other way to fail |

**UI & accessibility**

| Area | Status |
|---|---|
| **App chrome has one home per concern** | one header per shell (`top-nav.tsx` replaced `mobile-header.tsx` - never stack two); sidebar = brand + nav only; identity/theme/sign-out live only in the avatar-opened RightNav panel (`right-nav.tsx`), the mobile drawer has no footer; pinned by e2e S68/S72/S75 |
| **Nav placement is rendering-only** | `placement: "rightnav"` (Help, and Support for the self-service roles) moves *where a link renders*, never whether it exists: the item stays in `config.items`, which is what the merchant moderator grants, the shell route guard and the command palette read. `nav-config.spec.ts` pins the split, the no-loss invariant, that grantable hrefs are untouched, and that the announcements feed is never relegated to the RightNav (it is a destination, not a utility) |
| **Announcements render as markdown** | authored in Write/Preview tabs (`markdown-editor.tsx`), rendered by `src/components/markdown.tsx`, listed through `stripMarkdown()` (`src/lib/markdown.ts`) so raw syntax never reaches a one-line preview; detail lives at the shared, role-gated `/announcements/[id]` |
| **Skip link** | `src/components/skip-to-content.tsx`, rendered once at `src/app/layout.tsx:93`; `skip-link.spec.ts` asserts every `<main>` carries its `id="main-content"` target |
| **DataTable semantics** | real `<table>`/`<th>` with `scope="col"`, keyboard-focusable sort buttons, `aria-sort` on the active column |
| **Status is never colour-only** | `src/components/status-badge.tsx` always renders text; label/tone maps live in `src/lib/constants.ts` |
| **Error/loading boundaries** | `error.tsx` + `loading.tsx` + `not-found.tsx` for all four role segments plus the public routes; `DataErrorBanner` wired into all four shells |
| **Dialogs** | `FormDialog` always renders `DialogTitle` + optional `DialogDescription` - the R2 problem was call sites bypassing it, not the base component |
| **44px touch targets** | `hit-target-44` in `globals.css` + the `buttonVariants` base; `button.spec.tsx` scans for adjacent buttons whose targets would overlap |
| **Form error display** | two-layer: `FormErrors` summary as the focus target, plus the message under the control. Errors are frozen on submit, never derived per keystroke - see CONTRIBUTING "Form validation error display" |
| **In-card brand on auth screens** | `AuthCardBrand` as the first child of `CardHeader`; containment specs on every auth page |

**Data layer**

| Area | Status |
|---|---|
| **Announcement visibility + "new" state** | one predicate in `src/lib/announcements.ts` (live window + role targeting + `isNew` against the reader's watermark) feeding the active route, both feed pages and the detail page - never re-declare the live/targeting rules inline. State is one server-side column (`profile.announcementsSeenAt`, migration 0003, nullable); the badge counts rows published after it and the feed stamps it once per visit. Integration spec pins that the column stays nullable (Better Auth and signup don't know it - NOT NULL would break every signup). Never go back to per-item read rows or localStorage: `announcement_read` was built and removed (tombstone in `schema.postgres/platform.ts`) |
| **Money paths are transactional** | `db.transaction` + `SELECT ... FOR UPDATE` on every guard-then-write: `payouts/route.ts:236-242`, `payout-settlement.ts:49`, `balance/payment/route.ts:45`, `balance/payment/[txId]/confirm/route.ts:63` (read inside the tx, never before it) |
| **Trigram coverage** | 30 `gin_trgm_ops` indexes back every `ILIKE` column, including the NID search at `schema.postgres/merchants.ts:105` |
| **Pagination guards** | every table-backed list passes `defaultLimit`; `MAX_OFFSET = 100_000` (`pagination.ts:17`) and `MAX_LIMIT = 100` (`:4`) clamp hostile input |
| **Pagination totals stay exact** | `count(*)` results feeding a table's `initialTotal` are deliberately *not* cached - see `src/lib/cached-stats.ts` for the split between cached stat tiles and exact list totals |
| **Partial unique indexes as hard guarantees** | `finance.ts:89`, `packages.ts:122,166` |
| **Outbox concurrency** | `FOR UPDATE SKIP LOCKED` (`email-outbox.ts:82`) + 10-min stale-`SENDING` recovery (`STALE_SENDING_MS` at `:56`, applied at `:106`) |
| **Lock ordering** | orders → balance, documented and consistent |
| **Batching already done right in places** | `pickupLocationHubs` (`db/order-lookup.ts:71`), the bulk-endpoint pricing pre-fetch (`orders/bulk/route.ts:170-175`), `orders/counts` `FILTER` query (`:42-44`) - **these are the patterns to copy** |
| **Migration gate** | `depends_on: service_completed_successfully` on the migrate job (`docker/compose.monolith.yml:145`, `docker/compose.cluster.yml:128`) |
| **No raw SQL with user input** | the only `sql.raw` is `src/lib/db/time-sql.ts:15`, interpolating the constant `BUSINESS_TIMEZONE` |
| **One timeline definition** | `src/lib/order-timeline.ts` owns the steps, ranks and formatter; a source scan fails if the track page or the admin table declares its own copy again |

**Ops**

| Area | Status |
|---|---|
| **Docker hygiene** | non-root user, build-cache mounts, `HEALTHCHECK` on `/api/ready` (`docker/Dockerfile:71`) |
| **Cron auth** | timing-safe SHA-256 compare in `src/lib/cron-auth.ts:11-13` |
| **Read/write replica split** | `db` for writes (`db/index.ts:38`), `dbRead` for reads (`:54`) - session resolution, guards and `buildUpdate` all read through it |
| **Day-boundary rule** | `BUSINESS_TIMEZONE` + `businessToday()` (`src/lib/timezone.ts:16`) - correct wherever it is used (extend it, don't reinvent it) |
| **Static security headers** | `poweredByHeader: false` + HSTS in `next.config.mjs`, pinned by `security-headers.spec.ts`; the nonce'd CSP stays in `src/proxy.ts` |
