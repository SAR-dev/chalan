# ROADMAP — Making This Platform Ready for Selling

> Last audited: 2026-09-24. Verified against the actual codebase (branch `develop`).
> Build ✅ · Typecheck ✅ · Unit ✅ · **E2E 46/46 ✅** (after rate-limit + login-session fixes) · Lint/format ❌ (~44 pre-existing diagnostics)

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

| Area                               | Status | Detail                                                                                                                                                                                                                                                                                                  |
|------------------------------------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `pnpm build`                       | ✅      | Turbopack, clean                                                                                                                                                                                                                                                                                        |
| `pnpm typecheck` (`tsc --noEmit`)  | ✅      | Clean                                                                                                                                                                                                                                                                                                   |
| `pnpm test:unit:run`               | ✅      | Passes (CI `test` job)                                                                                                                                                                                                                                                                                  |
| `pnpm test:e2e`                    | ✅      | 46/46 after fixes (see "Recently Completed")                                                                                                                                                                                                                                                            |
| `pnpm lint:check` / `format:check` | ❌      | ~44 diagnostics: 10× `organizeImports`, 1× `noUselessUndefinedInitialization` (`orders/analytics/route.ts:18`), 1× `noUnusedVariables` (`e2e/specs/03-onboarding.spec.ts:80`), 1× `noSelfCompare` (`dashboard/cod-reconciliation/page.tsx:63`), ~31× format. **CI lint/format jobs are red on `main`.** |
| CI e2e                             | ❌      | `ci.yml` has no e2e job (see CI section)                                                                                                                                                                                                                                                                |
| DB migrations                      | ⚠️     | Clean & committed, but `cluster` compose uses `drizzle-kit push --force` vs monolith `migrate.ts` — drift risk                                                                                                                                                                                          |

---

## Phase 1: Security — Do These First (Critical/High)

| #   | Task                                                   | File                                                         | Description                                                                                                                                                                                                                                                            | Effort                   |
|-----|--------------------------------------------------------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|
| S1  | **Gate merchant-registry listing by role**             | `src/app/api/merchants/route.ts:16-50`                       | After the MERCHANT branch early-returns the caller's own row, **RIDER (and WAREHOUSE_ADMIN) fall through to a full listing** incl. `nidNumber`, emails, phones, rates. Add an explicit `else if` gate (at minimum exclude RIDER).                                      | S                        |
| S2  | **Gate rider-roster listing by role**                  | `src/app/api/riders/route.ts:9-148`                          | Only WAREHOUSE_ADMIN is scoped; **MERCHANT and RIDER can list every rider** (name, phone, zone, rating). Restrict to SUPER_ADMIN/WAREHOUSE_ADMIN or strip PII fields.                                                                                                  | S                        |
| S3  | **Stop RIDER from seeing platform-wide analytics**     | `src/app/api/orders/analytics/route.ts:18-26`                | Role switch has no RIDER branch → `where` stays `undefined` → a rider fetches **global** counts/revenue/COD. Scope to rider's orders or `forbidden()`.                                                                                                                 | S                        |
| S4  | **Rate-limit public resend-verification**              | `src/app/api/merchants/resend-verification/route.ts`         | Public POST, no rate limit → relay for flooding the SMTP queue. Use `rateLimit("resend-verification:"+ip, 3, 300)` + per-merchant cooldown.                                                                                                                            | S                        |
| S5  | **Rate-limit (or protect) public receiver-note PATCH** | `src/app/api/orders/[id]/receiver-note/route.ts:11-45`       | Public unauthenticated write; anyone knowing a cuid2 order id (printed on parcels) can overwrite `receiverNote`. At minimum rate-limit by IP; consider a code in the notification link.                                                                                | S                        |
| S6  | **Replace in-memory rate limiter**                     | `src/lib/rate-limit.ts`                                      | Per-process `Map` (bypass on multiple instances, resets on restart), trusts `x-forwarded-for` verbatim (spoofable), and the `"unknown"` fallback shares one bucket across all clients → cross-tenant DoS. Use Redis + trusted proxy header + per-key TTL (lazy prune). | M                        |
| S7  | **Stop baking secrets into the Docker image**          | `docker/Dockerfile:46`, `.dockerignore:12`                   | `.env` is copied into `.next/standalone` and then `COPY`'d into the image; the runner sets no env vars **so the baked `.env` is the runtime config**. Add `.env`/`env/` to `.dockerignore`; inject at runtime.                                                         | M                        |
| S8  | **Tighten CSP**                                        | `next.config.mjs` (headers ~line 33)                         | `script-src 'self' 'unsafe-inline'`, `style-src ... 'unsafe-inline'`; missing `object-src 'none'` and `base-uri 'self'`. Move to nonce/hash-based scripts.                                                                                                             | M                        |
| S9  | **Add CSRF/origin checks**                             | no `middleware.ts`; 0 matches for `csrf                      | origin                                                                                                                                                                                                                                                                 | sec-fetch-site` in `src` | No CSRF protection on state-changing routes. Currently mitigated by better-auth `sameSite:"lax"` cookies. Add an origin check in `parseBody`/`requireSession` or lift to middleware. | M |
| S10 | **Encrypt SMTP password at rest + mask everywhere**    | `src/app/api/admin/mail-config/[id]/activate/route.ts:39-57` | Stored and returned in plaintext; GET masks `pass` but the `activate` response returns the raw value. AES-GCM encrypt at rest; mask in all responses.                                                                                                                  | S                        |

## Phase 1b: Security — Low/Medium housekeeping

| #  | Task                                                        | File                                                                            | Description                                                                                                                                                                                                                              |
|----|-------------------------------------------------------------|---------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| L1 | Stop leaking internal error strings                         | `rider-applications/route.ts:65`, `merchants/route.ts:224`, `team/route.ts:130` | `err.message` from `auth.api.createUser` returned to clients (2 are public). Log server-side, return a generic message.                                                                                                                  |
| L2 | Fix starvable Better Auth rate limit                        | `src/lib/auth.ts:51-58`                                                         | Production `max: 10`/60s applies to `get-session` (already caused e2e flakes) — low-value requests starve real users; the `AUTH_RATE_LIMIT_DISABLED=1` toggle disables it entirely. Add a dedicated `get-session` rule or raise the cap. |
| L3 | Remove `NEXT_PUBLIC_SUPERADMIN_PASSWORD`                    | `env/.env.cluster.docker:47`, `env/.env.monolith.docker:47`, `docker/.env:23`   | Unused in code but the `NEXT_PUBLIC_` prefix would inline it into client bundles if ever wired up. Rename to server-only or delete.                                                                                                      |
| L4 | Hardcoded super-admin password in seed                      | `src/lib/db/seed/seed-content.ts:24-25` (`admin123`)                            | Randomize / read from env in production seeds.                                                                                                                                                                                           |
| L5 | Timings-safe cron-secret compare                            | `src/app/api/cron/*`                                                            | `!==` string compare on `CRON_SECRET` — use constant-time compare.                                                                                                                                                                       |
| L6 | Non-merchant roles can read any merchant's pickup locations | `src/app/api/pickup-locations/route.ts:16-18`                                   | RIDER/WAREHOUSE_ADMIN pass `?merchantId=` (only MERCHANT is pinned to own). Limit to SUPER_ADMIN/MERCHANT.                                                                                                                               |
| L7 | Weak local DB creds                                         | `.env` / `.env.example`                                                         | `postgres:admin` default — fine locally, document rotation for production instances.                                                                                                                                                     |
| L8 | Email-log iframe sandbox                                    | email-log detail page                                                           | Renders raw HTML in `<iframe sandbox="allow-same-origin">` — safe today; never add `allow-scripts`.                                                                                                                                      |

---

## Phase 2: Correctness Bugs (High)

| #  | Task                                                        | File                                                 | Description                                                                                                                                                                                                                                                                                                                                     | Effort  |
|----|-------------------------------------------------------------|------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| B1 | **Fix warehouse order-scope drift (404 in details dialog)** | `src/app/api/orders/[id]/route.ts:35-38`             | Detail scope omits the `and(isNull(order.pickupRiderId), status="APPROVED")` branch that the **list** (`orders/route.ts:48-52`) and `warehouse/orders/page.tsx:56-59` both include. A warehouse admin sees an APPROVED/unassigned order in the list but the detail GET 404s. Extract one `buildWarehouseOrderScope()` helper used by all three. | S       |
| B2 | **`Rider Cash Holdings` is a dead feature**                 | `src/app/warehouse/rider-cash/page.tsx:54`           | Fetches `/api/riders/${rider.id}/cash` — **that route does not exist**, so the page permanently renders "No rider cash data available." Implement the endpoint (or remove the page). Per-rider `Promise.all` fetch is also an N+1.                                                                                                              | M       |
| B3 | **Bulk order transitions bypass the state machine**         | `src/app/api/orders/bulk/*` (`approve                | dispatch                                                                                                                                                                                                                                                                                                                                        | receive |cancel|settle-cod|assign-pickup-rider`) | Inline guard logic instead of `ORDER_TRANSITIONS`; e.g. bulk dispatch (`dispatch/route.ts:25-30`) only checks rider `isActive`, never that the rider is a DELIVERY rider or matches the warehouse (single-order path does: `transitions.ts:158-169`). Reuse the same guard+buildUpdate inside one transaction. | M |
| B4 | `?status=BOGUS` silently returns empty                      | `src/lib/pagination.ts:38-50` + `enumValues()` casts | `parseStatusFilter` doesn't validate against the real enum arrays, so garbage statuses pass the cast and match nothing with no error. Whitelist against `orderStatuses` etc.                                                                                                                                                                    | S       |
| B5 | Tracking page runs 2× the DB queries                        | `src/app/track/[id]/page.tsx`                        | `fetchOrderData()` (1 order select + up to 4 child selects) is called from both `generateMetadata` and the page — wrap in `React.cache()`.                                                                                                                                                                                                      | S       |
| B6 | `merchant.email` not unique                                 | `src/lib/db/schema.postgres.ts:300`                  | `user.email` is unique, `merchant.email` is not — duplicate registration is possible under a check-then-insert race. Add a unique index.                                                                                                                                                                                                        | S       |
| B7 | `order.deliveryCityId` unindexed                            | `src/lib/db/schema.postgres.ts`                      | Every order list/detail/bulk query joins on it (left-joined + bulk filtered), but there is no index (all other join FKs have one).                                                                                                                                                                                                              | S       |
| B8 | `failedMail` is write-only dead table                       | `src/lib/db/schema.postgres.ts:720-733`              | Inserted by `mailer.ts:209`, never read (superseded by `emailLog`), zero indexes. Drop or repurpose.                                                                                                                                                                                                                                            | S       |

---

## Phase 3: Maintainability & Performance (Medium)

| #   | Task                                                                                                                      | File                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                                                                                           | Effort |
|-----|---------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| Q1  | **Add centralized API error handling**                                                                                    | 91 of 95 routes have **no try/catch**                                                                                                                                                     | Only 4 routes wrap handlers (`merchants`, `rider-applications`, `team`, `uploads`). A SQL error (e.g. FK violation in `applyOrderTransition`, `transitions.ts:472-553`) yields a generic 500 with no `{error}` body → the toast pipeline shows fallback text. Add `withErrorHandler(handler)` → `serverError()` and wrap transitions. | M      |
| Q2  | **Deduplicate order query scopes/projections**                                                                            | `orders/route.ts`, `orders/[id]/route.ts`, `warehouse/orders/page.tsx`, `orders/payable/route.ts`                                                                                         | 3 copies of the warehouse scope (one drifted — B1), 3 copies of the pickup-location→warehouse join, 4 hand-synced column projections. Centralize scope builders + a shared `orderListColumns` projection in `src/lib/db/`.                                                                                                            | M      |
| Q3  | **Kill client-side "fetch everything"**                                                                                   | `src/features/orders/hooks/use-orders.ts:86-95`, `src/features/riders/hooks/use-riders.ts:84-92`, `use-orders.ts:121-129`                                                                 | `limit: 9999` full-table fetches for stat cards (besides the paginated fetch + `/orders/counts`) and a full payable-list pull on every merchant dashboard load. Move to server-side aggregate endpoints.                                                                                                                              | M      |
| Q4  | **Remove the remaining 8 production `as any` casts**                                                                      | `orders/route.ts:248`, `orders/bulk/route.ts:61`, `orders/payable/route.ts:51`, `team/route.ts:38,87`, `riders/route.ts:40`, `pagination.ts:117`, `db/migrate.ts:28,61`                   | Two sit on critical money paths (`canPlaceOrders(merchantRow as any)`). Use `Pick<Merchant,...>` types and the `enumValues<T>()` helper instead of casts.                                                                                                                                                                             | M      |
| Q5  | **Add error boundaries**                                                                                                  | `src/app/(onboarding)/`, `login`, `register`, `forgot-password`                                                                                                                           | No `error.tsx` in any of these segments.                                                                                                                                                                                                                                                                                              | S      |
| Q6  | **`BETTER_AUTH_URL` is documented but dead**                                                                              | `.env.example:8` vs `src/lib/auth.ts:7`                                                                                                                                                   | baseURL derives from `NEXT_PUBLIC_SITE_URL`, so following the example's `BETTER_AUTH_URL` has no effect. Align the doc + code. Also remove the dead branch in `src/lib/env.ts:90-94` (references itself).                                                                                                                             | S      |
| Q7  | **Accessibility: icon-only buttons/"search" input**                                                                       | ~10 list pages (`merchants-client.tsx:338`, `warehouses-client.tsx:98`, `payouts-client.tsx:223`, …) + `src/components/data-table.tsx:863-876` + `src/components/image-upload.tsx:72-100` | Row-action `DropdownMenuTrigger` buttons contain only an icon with no `aria-label`; DataTable search input has no `aria-label`.                                                                                                                                                                                                       | S      |
| Q8  | **Break up the biggest files**                                                                                            | `data-table.tsx` (1416), `seed-content.ts` (1167), `schema.postgres.ts` (1006), `track/[id]/page.tsx` (772), `merchant/orders/new/page.tsx` (764)                                         | The DataTable is the single biggest maintenance risk and near-untestable as a unit. Split schema by domain and slice the client pages.                                                                                                                                                                                                | L      |
| Q9  | **Remove dead/misleading APIs**                                                                                           | `src/lib/pagination.ts:117` (`applySort`, used only by its spec), `src/lib/hooks/use-table-filters.ts:56-61` (`setFilter` ignores args)                                                   | Delete or fix.                                                                                                                                                                                                                                                                                                                        | S      |
| Q10 | **Vertical slices**: subscribe orders list/detail/dialogs to the current feature → see B1 (scope), M2/Q2 (columns) first. | —                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                     | —      |

---

## Phase 4: Testing, CI & Documentation (High)

| #   | Task                                              | File                                                                                                                                                                                                                                                                                                                                                 | Description                                                                                                                                                                                                                                                                                                                           | Effort |
|-----|---------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| T1  | **Fix lint/format debt so CI gates pass**         | repo-wide (~31 format, 10 organizeImports, 3 correctness)                                                                                                                                                                                                                                                                                            | Wipe with `pnpm ci:fix` once, confirm `lint:check`/`format:check` green, add to CI as blocking.                                                                                                                                                                                                                                       | M      |
| T2  | **Rewind CONTRIBUTING.md E2E section to reality** | `CONTRIBUTING.md:2445-2526, 2576-2584`                                                                                                                                                                                                                                                                                                               | Documents 16 spec files + "79 tests" + `e2e/seed.ts` + a `setup`/storageState Playwright project — none exist. Reality: 4 spec files, 46 tests, single chromium project, webServer = `pnpm start`. Also fix the unit-spec table (lists `riders/[id]/cash/cash.spec.ts` which doesn't exist; `merchants.spec.ts` shows 42, actual 71). | S      |
| T3  | **Add an e2e job to CI**                          | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                                                                           | No e2e anywhere in CI. Add a job with a Postgres service container + migration/seed step + `pnpm build && pnpm test:e2e`. (Credentials/seeds exist in `src/lib/db/seed/`.)                                                                                                                                                            | M      |
| T4  | **Make e2e not depend on run-to-run DB state**    | `playwright.config.ts` (webServer `pnpm start`, no seed)                                                                                                                                                                                                                                                                                             | Tests share the local Postgres across runs (orders/merchants from prior runs persist). Add a reseed step before runs or isolate via a dedicated e2e DB.                                                                                                                                                                               | M      |
| T5  | **Deduplicate the e2e `login()` helper**          | `e2e/specs/01-core-flows.spec.ts:24`, `02-business-flows.spec.ts:23`, `04-branding.spec.ts:23`, inline variant in `03-onboarding.spec.ts:38-48`                                                                                                                                                                                                      | Five copies of one helper (incl. 11× `waitForTimeout`, one 3000 ms). Extract `e2e/helpers.ts` and replace sleeps with `waitForURL`/`waitForSelector`. CONTRIBUTING itself forbids `waitForTimeout`.                                                                                                                                   | S      |
| T6  | **Wire up or delete husky pre-commit**            | `.husky/`, `package.json:91-94` (`lint-staged`), `prepare:"husky"`                                                                                                                                                                                                                                                                                   | `core.hooksPath = .husky/_` but `.husky/` is untracked → **lint-staged never runs**. Commit a real `.husky/pre-commit` (`npx lint-staged`) or remove. Note `tsc --noEmit` on every staged pkg is slow.                                                                                                                                | S      |
| T7  | **Fix deploy migration drift**                    | `.github/workflows/deploy.yml:37-47`, `docker/compose.cluster.yml` (`drizzle-kit push --force`) vs `docker/compose.monolith.yml` (`migrate.ts`)                                                                                                                                                                                                      | deploy.yml runs bare `docker compose up` with no migration step; cluster uses `push --force` (schema drift risk) while monolith uses versioned migrations; `pull_policy: build` triggers local builds instead of pulling the ghcr image. Align on versioned migrations in the deploy path and pin image tags.                         | M      |
| T8  | **Fix docs that reference nonexistent files**     | `docs/SETUP.md:211-212` (→ `docs/E2E.md` which doesn't exist; lists `auth.setup.ts`, `specs/a-auth.spec.ts`, `fixtures.ts`), `docs/SETUP.md:272` (claims Playwright auto-starts the dev server — it runs `pnpm start`), `docs/ENV.md:114-121` (claims webServer sets `MAIL_DISABLED`/`PLAYWRIGHT_BASE_URL` — only `AUTH_RATE_LIMIT_DISABLED` is set) | Reconcile docs with actual config.                                                                                                                                                                                                                                                                                                    | S      |
| T9  | **Unit-test isolation hardening**                 | `test-setup.ts`, `vitest.config.ts`                                                                                                                                                                                                                                                                                                                  | No `clearMocks`/`restoreMocks` defaults; specs pass alone but can pollute each other in the full suite (DataTable `useLayoutEffect` deps, unmocked charts). Add vitest defaults + mock the heavy chart components.                                                                                                                    | M      |
| T10 | **Close API-spec coverage gaps**                  | 17+ routes without colocated specs                                                                                                                                                                                                                                                                                                                   | `orders/analytics`, `orders/counts`, `orders/payable`, `orders/bulk/*`, `merchants/bulk/*`, `merchants/me/onboarding`, `merchants/[id]/nid/*`, `payouts/[id]/*`, `admin/mail-config`, `admin/delivery-*`, `zone-pricing/*`, `warehouses/public`, `email-logs/bulk/*`                                                                  | M      |

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
| Caching layer          | Redis for hot data                                       | M      |
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
| `[B7]`/`[B8]` debug logs                                  | Removed from `out-for-delivery-dialog.tsx` / `warehouse-dispatch-dialog.tsx` (ROADMAP line for them is stale)  |
| Merchant PATCH raw `req.json()`                           | Now uses `parseBody(...)` (`merchants/[id]/route.ts:88-91`)                                                    |
| Rider pages `as any` casts                                | Zero matches in `src/app/rider/**`                                                                             |
| NID endpoints schema                                      | `nidSubmitSchema` / `nidReviewSchema` exist (`src/lib/validation.ts`)                                          |
| Analytics dashboard (revenue, delivery perf, COD reports) | Phase-3 items shipped (✅ in old roadmap)                                                                       |

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
1. Phase 1 Security  S1-S3 (one-line role gates)  → S4/S5 rate limits → S6-S10     [1-2 weeks]
2. Phase 2 Bugs      B1 (waiting 404) → B2 (dead feature) → B3 → B4-B8            [1 week]
3. Phase 4 CI/Tests  T1 (lint gate) → T2/T5 (docs/helpers) → T3 (CI e2e) → T6-T9  [1-2 weeks]
4. Phase 3 Quality   Q1 (error handler) → Q2/Q3 (query consolidation) → Q4-Q10    [2 weeks]
5. Phase 5 Product roadmap (parallel, after stability)                             [ongoing]
```

Keep Phase 5 items behind the stability of Phases 1-4 — a broken authz/state machine invalidates everything built on top.
