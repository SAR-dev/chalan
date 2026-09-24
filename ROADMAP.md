# ROADMAP — Making This Platform Ready for Selling

> Last audited: 2026-09-24. Verified against the actual codebase (branch `develop`).
> Build ✅ · Typecheck ✅ · Unit ✅ · **E2E 46/46 ✅** (after rate-limit + login-session fixes) · Lint/format ❌ (~150 errors + 3 warnings + 1 info — worse than the ~44 originally counted, see T1)

## Phase Status Summary

| Phase | Title                                        | Status          | Breakdown                                     |
|-------|----------------------------------------------|-----------------|-----------------------------------------------|
| 1     | Security (S1-S10 + L1-L8)                    | ⚠️ In progress  | 14 ✅ / 2 ⚠️ / 2 ❌ (of 18)                    |
| 2     | Correctness Bugs (B1-B8)                     | ✅ Complete     | 8/8 ✅                                        |
| 3     | Maintainability & Performance (Q1-Q10)       | 🔶 In progress  | 2 ✅ / 4 ⚠️ / 4 ❌                            |
| 4     | Testing, CI & Documentation (T1-T10)         | 🔴 Not started  | 0 ✅ / 2 ⚠️ / 8 ❌                            |
| 5     | Product & Growth (roadmap)                   | ⏳ On hold      | Behind stability of Phases 1-4                |

Legend: ✅ done · ⚠️ partial · ❌ not started. Items verified against the code on the audit date; see "Recently Completed" for evidence.

---

## Current State

Functional B2B delivery management platform:
- Multi-role access (Super Admin, Warehouse Admin, Merchant, Rider)
- Order lifecycle (create → approve → pickup → warehouse → dispatch → deliver → COD → payout)
- Zone-to-zone pricing matrix, delivery cities, warehouses, pickup locations
- Merchant balance & payout system, COD reconciliation, audit logs
- Merchant branding (logo, colors, hide platform branding), analytics with charts
- PWA, self-service onboarding wizard, public tracking

**Architecture:** One instance + one database per customer. No multi-tenancy.

---

## Repository Health Snapshot

| Area                               | Status | Detail                                                                                                                                                                                                                                                                                                                                                                            |
|------------------------------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `pnpm build`                       | ✅      | Turbopack, clean                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm typecheck` (`tsc --noEmit`)  | ✅      | Clean                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm test:unit:run`               | ✅      | Passes (CI `test` job)                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm test:e2e`                    | ✅      | 46/46 after fixes (see "Recently Completed")                                                                                                                                                                                                                                                                                                                                       |
| `pnpm lint:check` / `format:check` | ✅      | `pnpm ci:check` (typecheck + `biome check` + `biome format`) is green: 172 errors → 0. Auto-fixed 154+58 files of Q1 `withErrorHandler` format noise, and hand-fixed the 3 real diagnostics — a `noSelfCompare` precedence bug in `cod-reconciliation/page.tsx:69`, an unused variable in `e2e/specs/03-onboarding.spec.ts`, and an unused `req` param in `api/riders/cash/route.ts`. **CI lint/format gates are now green.** |
| CI e2e                             | ❌      | `ci.yml` has no e2e job (see T3)                                                                                                                                                                                                                                                                                                                                                   |
| DB migrations                      | ⚠️     | Clean & committed, but `cluster` compose uses `drizzle-kit push --force` vs monolith `migrate.ts` — drift risk (see T7)                                                                                                                                                                                             |

---

## Phase 1: Security — Do These First (Critical/High)

| #   | Task                                                   | File                                                         | Description                                                                                                                                                                                                                                                                                                                                                      | Status | Effort |
|-----|--------------------------------------------------------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|--------|
| S1  | **Gate merchant-registry listing by role**             | `src/app/api/merchants/route.ts:58-91`                      | ✅ MERCHANT→own row (`:24-53`), RIDER→PII-light row (`:58-77`), **WAREHOUSE_ADMIN→same light projection** (`:80-91`, no NID/rates/balance/email), only SUPER_ADMIN reaches the full listing with `nidNumber`, rates, balance. All branches role-gated.                                                                                                                             | ✅     | S      |
| S2  | **Gate rider-roster listing by role**                  | `src/app/api/riders/route.ts:18-43,88-139`                   | ✅ MERCHANT→`[]` (`:18-20`), RIDER→own row (`:24-43`), WAREHOUSE_ADMIN→hub scope (`:88-139`); only SUPER_ADMIN reaches the full roster. All branches role-gated.                                                                                                                                                                                                   | ✅     | S      |
| S3  | **Stop RIDER from seeing platform-wide analytics**     | `src/app/api/orders/analytics/route.ts:29-39`                | ✅ Explicit RIDER branch scopes `where` to `deliveryRiderId`/`pickupRiderId` (or `eq(order.id, "")` → matches nothing). No global leak.                                                                                                                                                                                                                           | ✅     | S      |
| S4  | **Rate-limit public resend-verification**              | `src/app/api/merchants/resend-verification/route.ts:29`      | ✅ `rateLimitByIp(req, "resend-verification", 3, 300)` before DB write + anti-enumeration response (`:47-49`).                                                                                                                                                                                                                                                     | ✅     | S      |
| S5  | **Rate-limit (or protect) public receiver-note PATCH** | `src/app/api/orders/[id]/receiver-note/route.ts:23,39-45`    | ✅ Still public (by design) but now `rateLimitByIp(req, "receiver-note", 10, 60)` + terminal-status lock (`:39-45`).                                                                                                                                                                                                                                             | ✅     | S      |
| S6  | **Replace in-memory rate limiter**                     | `src/lib/rate-limit.ts:1-146`                              | ✅ Redis-backed when `REDIS_URL` is set: atomic Lua `INCR`+`PEXPIRE`+`PTTL` window (`:49-66`), lazy `getRedis()` singleton (`:78-121`), graceful in-memory-`Map` fallback + degrade-on-Redis-error (`:135-143`). `rateLimit`/`rateLimitByIp` are async now; all 14 call sites `await`ed. Compose `.yml` get a shared `redis:7-alpine` service; `REDIS_URL` provisioned in env configs; `ioredis` externalized via `serverExternalPackages`. Verified: unit spec + route specs green. | ✅     | M      |
| S7  | **Stop baking secrets into the Docker image**          | `.dockerignore:11-18`, `docker/Dockerfile:28-37`           | ✅ `.dockerignore` now excludes `.env`, `.env.*`, `env/`, `docker/.env` (`:13-16`); builder ingests secret-free `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_ENV`/`NEXT_PUBLIC_BASE_URL` via `ARG`→`ENV` (`:31-37`); deploy.yml `build-args` + monolith compose `build.args` pass the pub vars; server secrets arrive only at runtime via `env_file`. No `.env` in context → nothing to bake. | ✅     | M      |
| S8  | **Tighten CSP**                                        | `next.config.mjs:36-40`, `src/proxy.ts`, `src/app/layout.tsx` | ✅ Static `script-src 'self' 'unsafe-inline'` CSP removed from `next.config`. Proxy now generates a fresh nonce per page request (`src/proxy.ts:33-46`), forwards it to the server (`parseRequestHeaders` in app-render) so Next nonces its inline hydration scripts, and sets the same `Content-Security-Policy` response header. Layout reads `x-nonce` and forwards to next-themes + NextTopLoader. `script-src 'self' 'nonce-*'` — no `'unsafe-inline'`. Matcher widened to cover all page routes (documented in CONTRIBUTING). | ✅     | M      |
| S9  | **Add CSRF/origin checks**                             | `src/lib/csrf.ts:16-38`, `src/lib/validation.ts:48-56`       | ✅ `isAllowedOrigin()` (Origin/Referer vs SITE_URL + request host) enforced inside `parseBody`, so every mutation route using it rejects cross-site calls. No middleware, matching the roadmap's stated option.                                                                                                                                                     | ✅     | M      |
| S10 | **Encrypt SMTP password at rest + mask everywhere**    | `src/app/api/admin/mail-config/**`, `src/lib/crypto.ts:24-35`, `src/lib/env.ts:103-109` | ✅ AES-256-GCM via `encryptSecret()` (store `:67`), masked in GET/create/activate (`[id]/activate/route.ts:61`), decrypted at send (`src/lib/mailer.ts:61`). `SMTP_SECRET_KEY` now provisioned: `env/` + `docker/.env`, `env.ts` enforces it in production + format-checks 64-hex, 4 new `env.spec.ts` cases.                                       | ✅     | S      |

> Phase 1b security is complete; the only outstanding item is L7 (local-DB-cred rotation), which is documented as acceptable for local/dev and still pending production rotation guidance.

## Phase 1b: Security — Low/Medium housekeeping

| #  | Task                                                        | File                                                                            | Description                                                                                                                                                                                                                     | Status |
|----|-------------------------------------------------------------|---------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| L1 | Stop leaking internal error strings                         | `rider-applications/route.ts:68`, `merchants/route.ts:246`, `team/route.ts:137` | ✅ generic messages returned ("Could not create..."), `err` logged server-side. Remaining `err.message` hits are server-side mailer retry callbacks only.                                                                         | ✅     |
| L2 | Fix starvable Better Auth rate limit                        | `src/lib/auth.ts:55-61`                                                         | ✅ dedicated `/get-session` rule (60 per 60s) + `/sign-in/*` max 100; production global raised. `AUTH_RATE_LIMIT_DISABLED` toggle remains for e2e only.                                                                           | ✅     |
| L3 | Remove `NEXT_PUBLIC_SUPERADMIN_PASSWORD`                    | `env/.env.cluster.docker:47`, `env/.env.monolith.docker:47`, `docker/.env:23`   | ✅ renamed to server-only `SUPERADMIN_PASSWORD` (no `NEXT_PUBLIC_` prefix anywhere → no client-bundle inlining).                                                                                                                 | ✅     |
| L4 | Hardcoded super-admin password in seed                      | `src/lib/db/seed/seed-content.ts:24-34`, `.env.example`, `docs/ENV.md` | ✅ seeded SUPER_ADMIN accounts now read `SEED_SUPER_ADMIN_PASSWORD` (`?? "admin123"`), documented as optional in `.env.example` + `docs/ENV.md`; known default only for local/e2e.                                                                                                                               | ✅     |
| L5 | Timings-safe cron-secret compare                            | `src/lib/cron-auth.ts:8-12`                                                      | ✅ `safeEqual()` SHA-256-hashes both sides → `crypto.timingSafeEqual`; used by all 3 cron routes.                                                                                                                              | ✅     |
| L6 | Non-merchant roles can read any merchant's pickup locations | `src/app/api/pickup-locations/route.ts:19-58`                                   | ✅ NEW scoping: MERCHANT→own; WAREHOUSE_ADMIN→their warehouse's cities (optional `?merchantId` within it); RIDER→their warehouse's cities via rider lookup (no merchant targeting, no cross-warehouse enumeration); SUPER_ADMIN→all. Spec covers all branches (16 tests).                                             | ✅     |
| L7 | Weak local DB creds                                         | `.env` / `.env.example`                                                         | ⚠️ `postgres:admin` default — fine locally; still needs documented rotation for production instances.                                                                                                                          | ⚠️     |
| L8 | Email-log iframe sandbox                                    | `src/features/email-logs/dialogs/email-log-detail-dialog.tsx:103`               | ✅ iframe still `sandbox="allow-same-origin"` only; no `allow-scripts`. Safe state.                                                                                                                                            | ✅     |

---

## Phase 2: Correctness Bugs (High) — ✅ COMPLETE

| #  | Task                                                        | File                                                 | Description                                                                                                                                                                                                                                                                                 | Status |
|----|-------------------------------------------------------------|------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| B1 | **Fix warehouse order-scope drift (404 in details dialog)** | `src/lib/db/order-scope.ts:18-26`                    | ✅ Shared `buildWarehouseOrderScope()` (incl. the `isNull(pickupRiderId) AND status='APPROVED'` branch) used by list (`orders/route.ts:51`), detail (`orders/[id]/route.ts:40`), and warehouse page (`warehouse/orders/page.tsx:38`). Drift gone.                                          | ✅     |
| B2 | **`Rider Cash Holdings` is a dead feature**                 | `src/app/api/riders/cash/route.ts`, `src/app/api/riders/[id]/cash/route.ts` | ✅ Both endpoints exist now; `src/lib/rider-cash.ts:16` (`cashOnHand`); page fetches aggregate `/api/riders/cash` (`warehouse/rider-cash/page.tsx:43`) — N+1 gone, rider earnings page uses the per-rider route.                                                                      | ✅     |
| B3 | **Bulk order transitions bypass the state machine**         | `src/features/orders/transitions.ts:558`              | ✅ `applyBulkOrderTransition()` — `authorize` → `SELECT ... FOR UPDATE` → per-row `guard`+`buildUpdate` in ONE `db.transaction`. All 6 bulk routes are thin wrappers (e.g. `bulk/dispatch/route.ts:16`); dispatch guard includes DELIVERY-role + warehouse match (`transitions.ts:157-168`). | ✅     |
| B4 | `?status=BOGUS` silently returns empty                      | `src/lib/pagination.ts:42-60`                         | ✅ `parseStatusFilter(req, allowed?)` drops unknowns (`:57`); every call site passes a real enum (`orders/route.ts:76`, `merchants/route.ts:83`, `payouts/route.ts:34`, `rider-applications/route.ts:139`). Covered by spec (`pagination.spec.ts:72`).                                 | ✅     |
| B5 | Tracking page runs 2× the DB queries                        | `src/app/track/[id]/page.tsx:207`                     | ✅ `const fetchOrderData = cache(...)` wrapped in `React.cache()`; shared by `generateMetadata` (`:260`) and page body (`:279`).                                                                                                                                                           | ✅     |
| B6 | `merchant.email` not unique                                 | `src/lib/db/schema.postgres.ts:366`                   | ✅ `uniqueIndex("merchant_email_unique")` added (comment notes the check-then-insert race).                                                                                                                                                                                                 | ✅     |
| B7 | `order.deliveryCityId` unindexed                            | `src/lib/db/schema.postgres.ts:685`                   | ✅ `index("order_delivery_city_id_idx")` added.                                                                                                                                                                                                                                            | ✅     |
| B8 | `failedMail` is write-only dead table                       | `src/lib/db/schema.postgres.ts:718-724`, `src/lib/mailer.ts:207-214` | ✅ Table dropped from schema (section header marks removal); `mailer.ts` now logs exhausted retries to `email_log` with `"FAILED"`. No live references remain.                                                                                                                           | ✅     |

---

## Phase 3: Maintainability & Performance (Medium)

| #   | Task                                                                                                                      | File                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                                                                                                                                   | Status |
|-----|---------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| Q1  | **Add centralized API error handling**                                                                                    | `src/lib/with-error-handler.ts:8-20`                                                                                       | ✅ **96 of 97** route.ts files wrap handlers → structured `{error}` 500. Only `auth/[...all]/route.ts:4` unwrapped (Better Auth library handler, must stay). Transition SQL/FK errors bubble into the wrapper (`orders/[id]/approve/route.ts:4`).                                                                                                                                | ✅     |
| Q2  | **Deduplicate order query scopes/projections**                                                                            | `src/lib/db/order-scope.ts`, `order-lookup.ts`, `order-columns.ts`                                                         | ✅ Shared scope/join/column modules are used by list, detail, warehouse, bulk, and now payable (`orders/payable/route.ts` spreads `ORDER_CORE_COLUMNS` and adds only `deliveredAt`).                                                                                                                                                                                       | ✅     |
| Q3  | **Kill client-side "fetch everything"**                                                                                   | `use-orders.ts`, `use-riders.ts`, `orders/payable/route.ts`, `merchant/finance/page.tsx`                                  | ✅ Dashboard order/rider stats use server aggregates; warehouse workboards opt into their required operational dataset; payable orders are server-paginated with aggregate count/earnings and date filters, so finance no longer pulls the full list.                                                                                                                                     | ✅     |
| Q4  | **Remove the remaining 8 production `as any` casts**                                                                      | `orders/*`, `team/route.ts`, `riders/route.ts`, `pagination.ts`, `db/migrate.ts`                                        | ✅ **0 `as any` left in all 7 cited files.** Replaced with `Pick<...>` / `TeamMember` types + `enumValues<T>()` helpers. One cast remains OUTSIDE the roadmap list: `src/app/dashboard/team/page.tsx:48` (`initialData={teamRows as any}`) — clean it up opportunistically.                                                                                                              | ✅     |
| Q5  | **Add error boundaries**                                                                                                  | `src/app/(onboarding)/`, `login`, `register`, `forgot-password`                                                           | ✅ `error.tsx` present in `(onboarding)/`, `login/`, `register/`, and now `forgot-password/error.tsx` (mirrors the login boundary). All public pages covered.                                                                                                                                                                                                                 | ✅     |
| Q6  | **`BETTER_AUTH_URL` is documented but dead**                                                                              | `src/lib/auth.ts:7`, `.env.example:14`, `src/lib/env.ts:90-94`                                                             | ✅ removed everywhere: `.env.example`, `docs/ENV.md`, `env/.env.monolith.docker`, `env/.env.cluster.docker`; deleted the dead self-referencing `NEXT_PUBLIC_SITE_URL` warn branch in `env.ts`. `baseURL` derives from `NEXT_PUBLIC_SITE_URL` only.                                                                                                                             | ✅     |
| Q7  | **Accessibility: icon-only buttons/"search" input**                                                                       | `src/components/data-table.tsx:863-876`, `warehouses-client.tsx:98-104`, `image-upload.tsx:72-100`                        | ✅ DataTable search now has `aria-label="Search"`; warehouse actions use the established sr-only `Actions` label; image preview actions use `Replace image` / `Remove image` labels.                                                                                                                                     | ✅     |
| Q8  | **Break up the biggest files**                                                                                            | `data-table.tsx` (1416), `seed-content.ts` (1167), `schema.postgres.ts` (997), `track/[id]/page.tsx` (775), `merchant/orders/new/page.tsx` (764) | ❌ All unchanged; schema still single-file despite AGENTS.md note.                                                                                                                                                                                                                                                                                                               | ❌     |
| Q9  | **Remove dead/misleading APIs**                                                                                           | `src/lib/pagination.ts:127-134` (`applySort`), `src/lib/hooks/use-table-filters.ts:56-61` (`setFilter`)                    | ✅ `applySort` removed from `pagination.ts` (+ its spec block + unused `asc`/`desc` imports); `setFilter` removed from `use-table-filters.ts` (0 callers). `pagination.spec.ts` green.                                                                                                                                                                                      | ✅     |
| Q10 | **Vertical slices**: subscribe orders to the shared feature                                                               | `src/features/orders/transitions.ts`                                                                                       | ✅ All 23 transition routes delegate to `transitions.ts`; list/detail/warehouse/payable queries share the order scopes/projection modules.                                                                                                                                                                           | ✅     |

---

## Phase 4: Testing, CI & Documentation (High)

| #   | Task                                              | File                                                                                                                                                                                                                                                                                                                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status |
|-----|---------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| T1  | **Fix lint/format debt so CI gates pass**         | repo-wide                                                                                                                                                                                                                                                                                                                                            | ✅ `pnpm ci:check` green (typecheck + `biome check` + `biome format`): 172 errors → 0. Auto-fixed the Q1 `withErrorHandler` format noise; hand-fixed 3 real diagnostics — `noSelfCompare` precedence bug in `cod-reconciliation/page.tsx:69`, unused `meRes` in `e2e/specs/03-onboarding.spec.ts:80`, unused `req` param in `api/riders/cash/route.ts:9`. Gates stay blocking.                                                         | ✅     |
| T2  | **Rewind CONTRIBUTING.md E2E section to reality** | `CONTRIBUTING.md` E2E section                                                                                                                                    | ✅ Rewritten to the actual suite: 4 spec files / 46 tests (was "16 files / 79"), the real `e2e/` tree (`helpers.ts`, `selectors.ts`, `specs/`), single `chromium` project with `workers: 1`, bare `pnpm start` webServer (no seed), no storage-state/`auth.setup.ts` project, and an honest "no e2e CI job yet" note. Unit-spec table re-counted from `vitest list` (phantom `riders/[id]/cash/cash.spec.ts` removed; merchants 42→72, pickup-locations 11→16, etc.). | ✅     |
| T3  | **Add an e2e job to CI**                          | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                                                           | ❌ No Playwright/e2e job, no Postgres service container. (Credentials/seeds exist in `src/lib/db/seed/`.)                                                                                                                                                                                                                                                                          | ❌     |
| T4  | **Make e2e not depend on run-to-run DB state**    | `playwright.config.ts:21-32`                                                                                                                                                                                                                                                                                                                         | ❌ webServer is bare `pnpm start` (no reseed, no globalSetup, no dedicated DB). Only `AUTH_RATE_LIMIT_DISABLED=1` override added.                                                                                                                                                                                                                                                     | ❌     |
| T5  | **Deduplicate the e2e `login()` helper**          | `e2e/helpers.ts`, `e2e/specs/01,02,03,04`                                                                                                                                         | ✅ Four near-identical `login()` copies + three `CREDS` objects collapsed into `e2e/helpers.ts` (shared `CREDS` + `login()` that clears cookies, fills, presses Enter, and `waitForURL`s). Specs import from it. Fixed sleeps replaced with explicit waits — the suite now has **zero** `waitForTimeout` calls. `playwright test --list` still discovers 46 tests in 4 files.                                                                                  | ✅     |
| T6  | **Wire up or delete husky pre-commit**            | `.husky/`, `package.json:91-94` (`lint-staged`), `package.json` `prepare:"husky"`                                                                                                                                                                                                    | ❌ `core.hooksPath = .husky/_` but no real `.husky/pre-commit` (scaffold `.husky/_/h` is a no-op); `.husky/` untracked → **lint-staged never runs**. Commit a real `.husky/pre-commit` or remove. Stray tracked root `pre-commit` file is inert.                                                                                                                                         | ❌     |
| T7  | **Fix deploy migration drift**                    | `.github/workflows/deploy.yml:44-46`, `docker/compose.cluster.yml:19`, `docker/compose.monolith.yml:105,97,113`                                                                                                                                                                     | ❌ deploy.yml runs bare `docker compose up` (no migration); cluster uses `drizzle-kit push --force` vs monolith `migrate.ts`; `pull_policy: build` defeats the ghcr image pull. Align on versioned migrations + pinned tags.                                                                                                                                                             | ❌     |
| T8  | **Fix docs that reference nonexistent files**     | `docs/SETUP.md:211-212` (→ `docs/E2E.md` which doesn't exist; lists `auth.setup.ts`, `specs/a-auth.spec.ts`, `fixtures.ts`), `docs/SETUP.md:272` (dev-server claim), `docs/ENV.md:114-121` (`MAIL_DISABLED`/`PLAYWRIGHT_BASE_URL` claim) | ❌ Reconcile docs with actual config (webServer = `pnpm start`, only `AUTH_RATE_LIMIT_DISABLED` set).                                                                                                                                                                                                                                                                                | ❌     |
| T9  | **Unit-test isolation hardening**                 | `test-setup.ts`, `vitest.config.ts`                                                                                                                                                                                                                                                                                                                  | ✅ **Root cause found:** the flake was a 30s `testTimeout` being hit under full-suite load; the timed-out test's late React commit landed *after* `cleanup()`, so the next test saw duplicate elements ("Found multiple elements with the text: ORD-0001"). Fixed with `testTimeout`/`hookTimeout` 60s + an `afterEach` that wipes `document.body` after `cleanup()`, plus `clearMocks`/`restoreMocks` defaults (`unstubGlobals` deliberately off — several specs `vi.stubGlobal("fetch")` at module scope). **3 consecutive clean full-suite runs (794/794).** | ✅     |
| T10 | **Close API-spec coverage gaps**                  | 17+ routes without colocated specs                                                                                                                                                                                                                                                                                                                  | ⚠️ Now covered: `orders/counts`, `orders/payable`, orders/bulk (create + settle-cod), `merchants/[id]/nid/*`, `payouts/[id]/*`, `warehouses/public`. **Still uncovered:** `orders/analytics`, `orders/bulk/{approve,dispatch,receive,cancel,assign-pickup-rider}`, `merchants/bulk/*`, `merchants/me/onboarding`, `admin/mail-config/*`, `zone-pricing/*`, `email-logs/bulk/*`.            | ⚠️     |

---

## Phase 5: Product & Growth Roadmap

### Analytics & Reporting (Medium)
| Task                | Description                                  | Effort | Status |
|---------------------|----------------------------------------------|--------|--------|
| Merchant comparison | Compare performance across merchants (admin) | S      | ⏳      |
| PDF/Excel export    | Export reports as PDF or Excel               | M      | ⏳      |
| Scheduled reports   | Email weekly/monthly reports to merchants    | M      | ⏳      |
| Rider performance   | Delivery success rate, avg time per rider    | S      | ⏳      |

### Mobile Experience (Medium)
| Task                   | Description                                | Effort |
|------------------------|--------------------------------------------|--------|
| PWA improvements       | Better offline support, push notifications | M      |
| Mobile-optimized forms | Simplified order creation for mobile       | S      |
| Camera integration     | Better photo capture for delivery proof    | M      |
| GPS tracking           | Real-time rider location tracking          | L      |

### API & Integrations (Low)
| Task                   | Description                                        | Effort |
|------------------------|----------------------------------------------------|--------|
| Accounting integration | Export to Tally/QuickBooks                         | M      |
| SMS gateway            | Local SMS providers (order/receiver notifications) | S      |
| WhatsApp notifications | Delivery updates via WhatsApp                      | M      |

### Security Hardening (High)
| Task                     | Description                                | Effort |
|--------------------------|--------------------------------------------|--------|
| 2FA for admins           | TOTP for admin accounts                    | S      |
| IP whitelisting          | Restrict admin access by IP                | S      |
| Audit-trail enhancements | More detailed audit logging (entity diffs) | S      |
| Redis rate limiting      | Replace in-memory limiter (see S6)         | M      |
| Add CSRF middleware      | See S9 — origin-check helper or middleware | M      |
| Vulnerability scanning   | `pnpm audit` + dependency scanning in CI   | S      |
| SOC 2 compliance         | Security audit & certification             | XL     |

### Scalability (Low)
| Task                   | Description                                              | Effort |
|------------------------|----------------------------------------------------------|--------|
| Database optimization  | Remaining missing indexes (B7), query consolidation (Q2) | M      |
| Caching layer          | Redis for hot data                                       | S      |
| CDN for static assets  | Serve static files from CDN                              | S      |
| Background jobs        | Queue for email, reports, notifications                  | M      |
| Horizontal scaling     | Multiple app instances (needs S6 first)                  | L      |
| Database read replicas | Promote the existing `dbRead` split                      | M      |

### Documentation & Support (Medium)
| Task                  | Description                             | Effort |
|-----------------------|-----------------------------------------|--------|
| User documentation    | Help docs for merchants, riders, admins | L      |
| API documentation     | OpenAPI/Swagger for public API          | M      |
| Video tutorials       | Setup guides, feature walkthroughs      | L      |
| FAQ page              | Common questions and answers            | S      |
| Support ticket system | In-app support request form             | M      |
| Status page           | Public status page for uptime           | S      |

### 1% Improvements (Quick Wins)
1. Subscription plan / pricing display on merchant dashboard
2. Pricing tiers on the landing page
3. Help center with basic docs
4. Add `aria-label`s (Q7) — tiny fix, big a11y win
5. `pnpm audit` gate in CI

---

## Recently Completed (verified, so it isn't re-proposed)

| Item                                                      | Evidence                                                                                                       |
|-----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| E2E 429 flakiness (Better Auth rate limit)                | `playwright.config.ts` webServer now sets `AUTH_RATE_LIMIT_DISABLED=1`; suite is 46/46 ×2 runs                 |
| E2E S1 double-login (authed-user redirect)                | `login()` helpers call `page.context().clearCookies()` first; helpers duplicated 3× (dedupe still pending, T5) |
| Bulk-approve N+1                                          | `orders/bulk/approve/route.ts:32-50` pre-fetches merchant limits via `inArray`                                 |
| `InfoRow` duplication                                     | Extracted to `src/features/orders/components/info-row.tsx`; all dialogs import it                              |
| Delivery-city / order FK indexes                          | `schema.postgres.ts:679-680, 953-954`                                                                          |
| `ignoreBuildErrors`                                       | Removed from `next.config.mjs`                                                                                 |
| `tx: any` in transitions                                  | Gone — `db.transaction` fully inferred (`TransitionContext<never>` typed cast, not `any`)                      |
| Merchant PATCH raw `req.json()`                           | Now uses `parseBody(...)` (`merchants/[id]/route.ts:88-91`)                                                    |
| Rider pages `as any` casts                                | Zero matches in `src/app/rider/**`                                                                             |
| NID endpoints schema                                      | `nidSubmitSchema` / `nidReviewSchema` exist (`src/lib/validation.ts`)                                          |
| Analytics dashboard (revenue, delivery perf, COD reports) | Phase-3 items shipped (✅ in old roadmap)                                                                       |
| **Phase 2 — all of B1-B8**                                | See Phase 2 table: shared order-scope helper, rider-cash endpoints, bulk via state machine, status whitelist, `React.cache` tracking, unique merchant email, deliveryCityId index, `failedMail` dropped |
| **Phase 1 security batch**                                | S2/S3/S4/S5/S9/S10 + L1/L2/L3/L5/L8 — role gates, rate limits, CSRF in `parseBody`, SMTP encryption+masking, generic error strings, get-session rate rule, server-only superadmin var, timing-safe cron compare |
| **Q1 `withErrorHandler` roll-out**                        | 96/97 routes wrapped → structured `{error}` 500s; only `auth/[...all]` (library) unwrapped                     |
| **Q4 — all 8 `as any` casts removed**                     | 0 in `orders/*`, `team`, `riders`, `pagination`, `db/migrate`; `Pick<...>`/`TeamMember` + `enumValue<T>()` instead |
| **S1 — merchant-registry role gate**                      | `merchants/route.ts:58-91` now gives WAREHOUSE_ADMIN the same PII-light projection as RIDER; only SUPER_ADMIN sees NID/rates/balance (spec `merchants.spec.ts`) |
| **S10 — SMTP key provisioned**                            | `SMTP_SECRET_KEY` added to `env/.env.monolith.docker`, `env/.env.cluster.docker`, `docker/.env`; `env.ts` requires it in production + validates 64-hex; `env.spec.ts` 13/13 |
| **S6 — Redis-backed rate limiter**                        | `rate-limit.ts` rewritten: Lua `INCR`/`PEXPIRE`/`PTTL` window on Redis when `REDIS_URL` set, in-memory `Map` fallback, graceful degrade; 14 call sites `await`ed; `redis:7` service added to both compose files; `ioredis` externalized; specs green |
| **S7 — secrets no longer baked into image**               | `.dockerignore` excludes `.env*`/`env/`/`docker/.env`; Dockerfile builder takes `NEXT_PUBLIC_*` build args; `deploy.yml` + monolith compose pass `build-args`; runtime secrets only via `env_file` |
| **S8 — nonce-based CSP**                                  | Static `'unsafe-inline'` CSP dropped from `next.config`; `src/proxy.ts` generates a per-request nonce, forwards it to the server + sets the response header (`script-src 'self' 'nonce-*'`); layout threads it into next-themes + NextTopLoader; matcher covers all page routes |
| **L6 — pickup-location scope**                            | MERCHANT→own; WAREHOUSE_ADMIN→their warehouse's cities (optional `?merchantId` within it); RIDER→their warehouse's cities via rider lookup; SUPER_ADMIN→all. 16 tests, no cross-warehouse enumeration |
| **L4 — seed super-admin password override**               | Seeded SUPER_ADMIN accounts read `SEED_SUPER_ADMIN_PASSWORD` (`?? "admin123"`); documented in `.env.example` + `docs/ENV.md` |
| **Q5 — forgot-password error boundary**                   | `src/app/forgot-password/error.tsx` added (mirrors login boundary); every public page now has one |
| **Q9 — dead APIs removed**                                | `applySort` (+ spec block, unused `asc`/`desc` imports) and `setFilter` deleted; `pagination.spec.ts` green |
| **Q7 — accessibility labels**                             | DataTable search, warehouse actions, and image preview action controls now have accessible labels |
| **Q3 — bounded client data fetching**                     | Dashboard stats use server aggregates; payable orders use server pagination/date filters; warehouse workboards explicitly opt into operational data |
| **Q2 — shared payable projection**                         | `orders/payable/route.ts` now spreads `ORDER_CORE_COLUMNS` and adds only its view-specific `deliveredAt` field |
| **Q10 — orders vertical slice**                            | Transition routes and order list/detail/warehouse/payable queries now use the shared transitions/scopes/projection modules |
| **T1 — lint/format gates green**                          | `pnpm ci:check` passes end-to-end (typecheck + `biome check` + `biome format`); 172 Biome errors → 0, incl. a real `noSelfCompare` precedence bug fix in `cod-reconciliation/page.tsx:69` |
| **T5 — e2e login helper deduped**                        | New `e2e/helpers.ts` (shared `CREDS` + `login()`); 4 copies removed, all `waitForTimeout` sleeps replaced with explicit waits; still 46 tests / 4 files |
| **T9 — flaky full-suite runs fixed**                      | Root cause was a 30s test timeout leaking a late React commit into the next test. `testTimeout`/`hookTimeout` 60s + `afterEach` body wipe + `clearMocks`/`restoreMocks`. 3× consecutive 794/794 runs |
| **T2 — E2E docs rewound**                                | CONTRIBUTING E2E section rewritten to the real suite (4 files/46 tests, no seed/storage-state project, no e2e CI job); unit-spec counts re-derived from `vitest list` |
| **Q6 — `BETTER_AUTH_URL` removed**                        | Gone from `.env.example`, `docs/ENV.md`, both docker env files; self-referencing `env.ts` warn branch deleted |

## Verified-Clean Areas (don't regress these)

- **Uploads**: content-type/size/folder allowlists + traversal defense (`uploads/route.ts`, `uploads/[...path]/route.ts:21-33`)
- **Order state machine**: every single order transition goes through `applyOrderTransition` with per-transition `authorize`
- **IDOR**: `orders/[id]`, `payouts`, `merchants/[id]/*`, `riders/[id]/active`, `warehouses/[id]`, `pickup-locations/[id]` all correctly scoped
- **Admin surface**: 58 gated write sites (admin/team/announcements/email-logs/audit-logs/platform-config/bulk) — SUPER_ADMIN only
- **Public tracking**: phone fields masked, no phone-based lookup
- **No `dangerouslySetInnerHTML`** anywhere in `src`
- **Git history**: no secrets ever committed; sensitive env files all gitignored

---

## Suggested Order

```
1. Phase 1 Security   ✅ S1-S10, L1-L6, L8 done. Open: L7 (local DB cred rotation guidance) → Phase 2
                       (L7 needs a deploy-time rotation decision, not code).
2. Phase 3 Quality    ✅ Q2/Q3/Q5/Q6/Q7/Q9/Q10 done → next Phase 4 CI/tests
3. Phase 4 CI/Tests   ✅ T1/T2/T5/T9 done → T3 (CI e2e job) → T4/T6-T8/T10
4. Phase 5 Product roadmap (parallel, after stability)                             [ongoing]
```

Keep Phase 5 items behind the stability of Phases 1-4 — a broken authz/state machine invalidates everything built on top.
