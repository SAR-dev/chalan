# ROADMAP — Hardening & Growth

> Last updated: 2026-09-27. Rewritten from a full-stack audit (security,
> data/money correctness, ops/DX) — every item cites the code it comes from.
> The previous "Phase 5.x features" roadmap is preserved at the bottom
> (`P4 — Product`), minus everything already shipped.
>
> Current health: `pnpm ci:check` ✅ · Unit **1377/1377** ✅ · Build ✅ ·
> E2E **65/65** ✅ (10 spec files, S1–S42) · dependency tree has **0
> high/critical advisories** · route-auth-guard test enforces server-side auth
> on all API routes.

---

## How to read this

| Tier | Meaning | Rule |
|------|---------|------|
| **P0** | Ship-blockers: PII exposure, money loss/duplication, auth bypass | Fix before any feature work |
| **P1** | Correctness & consistency: races, transactions, migrations, time | Fix before scale/features |
| **P2** | Ops: deploy safety, observability, CI, cron | Fix before production traffic grows |
| **P3** | Performance & data hygiene | Opportunistic, batched |
| **P4** | Product & DX | As capacity allows |

Every item is `Problem (evidence) → Fix → Verify`. The verification gate for
every change is unchanged: `pnpm ci:check` → `pnpm test:unit:run` →
`pnpm build` → `pnpm test:e2e`.

---

## Executive summary

The product surface is in good shape (central order state machine, audit
logging, 2FA, RBAC, static route-auth guard, brand theming, CSV import,
moderator accounts). The risk is **underneath** it:

1. **Two public endpoints leak data or accept writes with only a guessable id**
   (`ORD-100001`, `ORD-100002`, … are sequential, not random).
2. **Money is stored as `double precision` and the ledger has inconsistent
   signs** — delivery credits and payout debits use the same sign, and the
   **bulk "mark paid" path never touches the ledger at all**.
3. **Several check-then-write flows have no lock or constraint** (moderator
   quota, payout creation, zone pricing, balance payments).
4. **Nothing is enforced server-side for policy** (2FA requirement, merchant
   email verification are browser-only), and **rate limiting silently degrades**
   without Redis.
5. **Operations are not production-grade**: deploy can report success on a
   failed migration, no error tracking, liveness-only health check, E2E never
   runs in CI, docs contradict the code.

---

## P0 — Security & money (ship-blockers)

### P0.1 Public order endpoint leaks full PII; order IDs are guessable

**Problem.** `PATCH /api/orders/[id]/receiver-note` is public (allowlisted in
`src/app/api/route-auth-guard.spec.ts:46`) and returns the **entire** order row:
`src/app/api/orders/[id]/receiver-note/route.ts:43-49` uses `.returning()` with
no column projection, so an unauthenticated caller receives `recipientName`,
`recipientPhone`, `deliveryAddress`, `productCost`, `merchantNote`, etc. The
route comment claims ids are "cuid2" (unguessable), but they are **sequential**:
`src/lib/db/schema.postgres/helpers.ts` (`orderIdSeq … startWith: 100001`) +
`gen_entity_code('ORD', …)` → `ORD-100001E`, `ORD-100002E`. Anyone can
enumerate every order, read all recipient PII, and overwrite any live order's
note.

**Fix.** (a) Return `{ ok: true }` (or a 3-field projection) — never the full
row from a public route. (b) Give each order a high-entropy public tracking
token (separate from the id) and authorize the note write on that token.
(c) Keep the IP rate limit. (d) Correct the misleading comment.

**Verify.** Unit: public note write returns no PII fields; wrong/missing token →
404/403; terminal orders → 409. E2E: S-tracking still works for the seeded
order via its token.

### P0.2 Unauthenticated uploads to `nids` + all uploads served publicly

**Problem.** `src/app/api/uploads/route.ts:53-61` treats `folder=nids` as
public — **anyone** can upload up to 5 MB with a client-declared
`file.type`/extension into `nids/public/…`. Files are then served with **no
auth** by `src/app/uploads/[...path]/route.ts`, and on R2 via the bucket's
public URL (`src/lib/storage/r2.ts`). Rider NID front/back/selfie images are
therefore permanently public (immutable cache headers) and the endpoint is free
anonymous hosting. Also, `await req.formData()` runs **before** the size check
(`route.ts:28` vs `:49`), so a multi-GB body is buffered first (memory DoS).

**Fix.** Gate NID uploads behind the rider-application flow with a
short-lived signed token; validate magic bytes (not `file.type`); serve uploads
through an authorized handler or short-lived signed URLs; enforce
`Content-Length` before parsing and stream with a hard byte ceiling; add
`Content-Disposition` for non-images.

**Verify.** Unit: unauthenticated non-`nids` upload → 401; `nids` without a
valid token → 401/403; oversize → 413 before buffering; spoofed content-type
rejected. E2E: rider application uploads succeed with a token; a bare URL fetch
of an NID path is not publicly readable (or requires the signed URL).

### P0.3 Payout double-pay + bulk "mark paid" skips the ledger

**Problem (a).** `src/app/api/payouts/route.ts:201-249` reads the payable orders
**outside** the transaction, then inside the tx inserts a request carrying the
stale `orderIds`/`amount` and links orders with a **broader** predicate
(`status='DELIVERED' AND codSettledAt IS NOT NULL AND payoutRequestId IS NULL`)
with no `FOR UPDATE` and no `inArray(order.id, payableOrders)`. Two concurrent
POSTs both create a request row for the same orders; only one wins the link
update, but the orphan request keeps a full `amount` and can still be approved
and paid (`payouts/[id]/paid/route.ts:69-92` debits it unconditionally).

**Problem (b).** `src/app/api/payouts/bulk/mark-paid/route.ts:32-41` only sets
`status: "PAID"` — it never writes the `PAYOUT` ledger row or debits
`merchant_balance`, unlike the single route. Bulk-settled payouts silently
diverge from the ledger.

**Fix.** Inside one transaction: `SELECT … FOR UPDATE` the eligible orders,
derive `amount` from **that** set, insert the request, link **only those ids**;
add a partial unique index guaranteeing one open request per order. Route the
bulk path through the same transaction helper as the single path (or reject bulk
until it shares the code). Recompute `amount` at approve/paid time from the
locked orders.

**Verify.** Unit: concurrent create (simulated interleaving) cannot produce a
request with an amount but no orders; bulk paid writes exactly one ledger row
per request and updates balance. Integration (real DB): two parallel POSTs →
one request, no orphan. E2E: bulk mark-paid then balance reflects the debit.

### P0.4 Money is `double precision` and the ledger signs are inconsistent

**Problem (a).** Every monetary column is float — `finance.ts:26-27,51`,
`orders.ts:95-98,139`, `merchants.ts:50-55`, `logistics.ts:78-82`,
`platform.ts:168-184`. `0.1 + 0.2 ≠ 0.3`; per-order fees and the running balance
accumulate representation error.

**Problem (b).** Rounding is inconsistent: `src/lib/pricing.ts:56` rounds the
COD fee, but `:29-30` and `:68` do not round the delivery fee or earnings.

**Problem (c).** The ledger uses the **same negative sign** at delivery and at
payout — `src/features/orders/transitions.ts:564-596` writes
`ORDER_EARNINGS amount: -merchantEarnings`, and
`src/app/api/payouts/[id]/paid/route.ts:69-92` writes `PAYOUT amount:
-current.amount`. If negative means "platform owes the merchant", a payout
(which settles that obligation) must move the balance the other way; as written,
a settled payout drives the balance further negative. The seed replicates the
same pattern (`src/lib/db/seed/balances.ts:48-75`), and there is **no
reconciliation test** anywhere that asserts `balance == Σ settled ledger rows`
or that payout → fees-only remainder.

**Fix.** (a) Migrate money to `numeric(14,2)` (or integer paisa) with a
backfill; keep `formatTk` for display. (b) Round at every money write boundary.
(c) Write an explicit accounting spec (sign convention per transaction type),
fix the signs, then add a **reconciliation invariant test**: for every merchant,
`merchant_balance.balance` equals `Σ balance_transaction.amount where
status='SETTLED'`, and a worked example (100 cost / 10 fee / 1 COD → after
delivery and payout the merchant owes only the 11 in fees).

**Verify.** Unit: rounding table for pricing; reconciliation test over seeded +
synthetic ledgers; payout changes balance in the documented direction. E2E:
merchant Finance page totals match the ledger after a delivery and a payout.

### P0.5 Policy is browser-only: 2FA and merchant email verification

**Problem.** `ADMIN_2FA_REQUIRED` is enforced only by shell redirects
(`src/app/dashboard/dashboard-shell.tsx`, `warehouse-shell.tsx` via
`src/lib/two-factor.ts`); `requireSession()` (`src/lib/api-auth.ts:9-51`) never
checks `twoFactorEnabled`, so an admin who has not enrolled can call every API
directly. Likewise merchant email verification is client-only
(`src/features/account/hooks/use-auth.tsx:158-168`) — `requireSession` only
rejects `isActive === false`, so an unverified merchant session can call
merchant APIs.

**Fix.** Enforce both in `requireSession()` (or a thin wrapper): reject when
`ADMIN_2FA_REQUIRED=1` and an admin is unenrolled; reject unverified merchants
(except the endpoints needed to verify/resend). Also reject `user.banned` and
surface `session.impersonatedBy` for auditing.

**Verify.** Unit: `requireSession` returns null for unenrolled admin (policy on)
and for unverified merchant; allowlisted verify/resend still work. E2E: admin
with 2FA policy on cannot hit `/api/*` before enrolling.

### P0.6 Rate limiting can be bypassed or silently disabled

**Problem.** `src/lib/rate-limit.ts:71-73` falls back to a per-process `Map`
when `REDIS_URL` is unset (per-instance limits in any multi-instance deploy);
`:165-173` returns "no limit" when no IP resolves; `getClientIp` (`:147-158`)
trusts client-supplied `x-real-ip`/`cf-connecting-ip`/`x-forwarded-for`; and
`src/lib/auth.ts:97-98` overrides sign-in to **100 attempts/min** (vs the
global 10). `src/proxy.ts` has the same header trust, which also weakens
`ADMIN_IP_ALLOWLIST`.

**Fix.** Require Redis in production (fail closed or log loudly), derive client
IP from a configured trusted-proxy hop count only, lower the sign-in cap to a
small number with a separate generous `get-session` bucket, and document that
`ADMIN_IP_ALLOWLIST` requires a header-overwriting proxy.

**Verify.** Unit: missing Redis in `NODE_ENV=production` → warning + fail-closed
behavior (documented choice); spoofed XFF ignored when no trusted proxy
configured. E2E: sign-in lockout after N failures.

### P0.7 Small but real: signup, upload size, token leakage

**Problem.** (a) Public self-signup is enabled — `src/lib/auth.ts:69-73` sets
`emailAndPassword.enabled` with no `disableSignUp`, and `autoSignIn: true`, so
`POST /api/auth/sign-up/email` creates accounts; the app only ever creates users
server-side. (b) The mailer logs the full plain-text body (including reset /
activation URLs) — `src/lib/mailer.ts:159-163` — and persists full HTML bodies
in `email_log` (`:132-140`). (c) Merchant email-verification tokens are stored
in plaintext (`src/app/api/auth/verify-email/route.ts:39`), unlike the hashed
activation tokens in `src/lib/activation.ts`. (d) `docs/…`/`env` files on disk
contain live-looking secrets and a default `SUPERADMIN_PASSWORD=12qwaszx`.

**Fix.** Set `disableSignUp: true`; redact URLs/tokens before logging and store
a truncated body (or encrypt) with short retention; hash the merchant verify
token; rotate the on-disk secrets and replace the default super-admin password.

**Verify.** Unit: sign-up route returns 4xx; mailer log has no `token=`;
verify-email compares hashes. Ops: rotated secrets, `git status` shows no env
files.

---

## P1 — Correctness & consistency

### P1.1 Check-then-write races need constraints + transactions

| Flow | Evidence | Fix |
|------|----------|-----|
| Moderator quota | `src/app/api/merchants/[id]/moderators/route.ts:121-146`, `src/lib/activation.ts:112-127` — plain `SELECT` then insert, no tx/lock/constraint | Count + insert in one tx with `SELECT … FOR UPDATE` on the merchant row (or advisory lock); same for re-activation in `moderators/[userId]/route.ts:87-108` |
| Zone pricing upsert | `src/app/api/admin/zone-pricing/route.ts:42-67`; no unique on `(fromZoneId,toZoneId)` (`logistics.ts:66-90`) | Add unique index + `onConflictDoUpdate`; order pricing currently picks an arbitrary duplicate (`orders/route.ts:293-305`) |
| Balance payment submit | `src/app/api/merchants/[id]/balance/payment/route.ts:27-43` — check outside tx | Partial unique index on `(merchantId) WHERE type='PAYMENT_PENDING' AND status='PENDING'`, or lock the balance row |
| Rider application | `src/app/api/rider-applications/route.ts:53-102` — user+rider+profile, no cleanup; `rider.email` not unique (`warehouses.ts:45`) | One transaction + cleanup; unique index on `rider.email` |
| Merchant approve/suspend | `merchants/[id]/{approve,suspend,reactivate}/route.ts` — read status then update | Predicate on current status (`WHERE status='PENDING'`), check affected rows |

**Verify.** Unit tests for each guard (wrong state → 4xx); one integration test
per race using two parallel transactions against a real Postgres.

### P1.2 Migration runner is fragile; docs contradict it

**Problem.** `src/lib/db/migrate.ts:8-14` splits SQL on `;` (breaks any
`$$`-quoted function body) and runs statements outside a transaction; it keys
the ledger on the **filename** (`:50-75`), while drizzle-kit uses content
hashes — and the repo's own history shows a migration was renamed/regenerated,
which makes the runner re-apply the whole 27 KB init migration. The cluster
compose starts **four** migrate services with no advisory lock
(`docker/compose.cluster.yml:165,199,233,267`) against non-idempotent DDL
(`0002_*.sql` has bare `ADD COLUMN`). Docs tell operators to run
`drizzle-kit push --force` in production (`docs/DEPLOYMENT.md:209-212`,
`docs/SETUP.md:308-322`) while compose actually runs the custom runner.

**Fix.** Use `drizzle-kit migrate` / `drizzle-orm/node-postgres/migrator` with
per-migration transactions; wrap in `pg_advisory_lock`; make DDL idempotent
(`IF NOT EXISTS`); run a single migrate service; correct the docs; ban
`db:push --force` outside local dev (and never `--force` in CI/CD).

**Verify.** Integration: run migrations twice from empty → no error, ledger
consistent; run with a `$$` function migration → succeeds. Docs: `DEPLOYMENT.md`
commands match compose.

### P1.3 Timezone: pin the business timezone

**Problem.** Range filters use **server-local** end-of-day
(`src/lib/pagination.ts:79` — `to.setHours(23,59,59,999)`) and
`src/app/api/orders/payable/route.ts:56`; analytics groups by the DB session
timezone (`src/app/api/orders/analytics/route.ts:57,65-66` — `date(created_at)`).
No `TZ`/`PGTZ` is set in any compose/Docker file, so containers are UTC while
the business runs in Asia/Dhaka (UTC+6). Reports and "today" filters are off by
up to 6 hours.

**Fix.** Pin `Asia/Dhaka` (env `TZ` + `SET TIME ZONE` on the pool) or pass
explicit `AT TIME ZONE 'Asia/Dhaka'` in filters and groupings; add tests.

**Verify.** Unit: a range for a Dhaka day includes exactly the Dhaka-day orders.
E2E: dashboard/analytics counts for a fixed fixture date.

### P1.4 Lifecycle writes should be atomic (and audit inside the tx)

**Problem.** (a) `logAudit` swallows errors and runs **after** commit
(`src/lib/audit.ts:40-54`; callers e.g. `transitions.ts:603-617`,
`payouts/[id]/paid:99-112`) → a crash between commit and audit loses the trail.
(b) Registration/team creation can orphan rows on partial failure
(`src/app/api/merchants/route.ts:244-280`; `src/app/api/team/route.ts:148-173`).
(c) `merchant.email` can be edited without syncing `user.email`, and a duplicate
surfaces as an unhandled 500 (`merchants/[id]/route.ts:120-125`).
(d) There is no append-only order status history — `reattempt` erases the prior
failure (`transitions.ts:334-336`).

**Fix.** Write audit rows inside the same transaction (or an outbox); wrap
multi-table creation in transactions with cleanup; make merchant email
immutable or sync it transactionally with a 409 on conflict; add an
`order_status_history` table written with each transition.

**Verify.** Unit: audit failure rolls back the state change; duplicate email →
409. Integration: reattempt preserves history rows.

### P1.5 Durable email (outbox) instead of fire-and-forget

**Problem.** Sends are unawaited with in-process retries —
`src/lib/auth.ts:35,59`, `src/lib/activation.ts:100`,
`src/app/api/merchants/route.ts:291`, `merchants/[id]/approve:77`,
`rider-applications/[id]/{approve,reject}:72/63`. On serverless/frozen
invocations the send and retries are lost, and the `email_log` row is only
written once the attempt resolves.

**Fix.** Persist an outbox row in the same transaction as the domain change and
drain it from a worker/cron (pairs with P2.5); keep `email_log` as the delivery
record.

**Verify.** Unit: domain change + outbox row committed together; drain marks
sent/failed. Integration: kill the process after commit → row still delivered on
next drain.

### P1.6 Missing constraints, indexes, and typed counts

| Item | Evidence | Fix |
|------|----------|-----|
| `profile.merchantId/warehouseId/riderId` have no FK | `auth.ts:165-167` (comment says so) | Add FKs (`ON DELETE SET NULL`/restrict) |
| `profile.merchantId` not indexed (hot moderator queries) | `auth.ts:178-182` | `index on merchantId` (+ warehouseId) |
| `rider.email` not unique | `warehouses.ts:45` | unique (partial where `email <> ''`) |
| Missing trgm indexes | `merchant.nidNumber` search (`merchants/route.ts:104`); `support_ticket.subject/message/actorName` (`support/route.ts:46-48`) | GIN `gin_trgm_ops` |
| `count(*)` typed `sql<number>` but returns string | `orders/route.ts`, `payouts/route.ts:105,173`, `merchants/route.ts:180`, `email-logs/route.ts:74`, `audit-logs/route.ts:70`, `team/route.ts:90` | Cast `::int` |

**Verify.** `db:generate` produces exactly the intended migration; unit tests
assert numeric `total`.

---

## P2 — Operations & observability

### P2.1 Deploy can report success on a failed migration

**Problem.** `.github/workflows/deploy.yml:40-55` runs migrations with
`|| docker compose run --rm migrate-dashboard` and ends with
`docker image prune -f` — no `set -euo pipefail`, so the job exits 0 even when
both migrations fail. It also triggers on `push: [main]` **without** depending
on CI (`ci.yml`), ships with no pre-migration backup, and assumes a root compose
file that is not in the repo (only `docker/compose.*.yml` exist).

**Fix.** `set -euo pipefail`; a single migrate step that fails the job; gate
deploy with `workflow_run` on CI success; `pg_dump`/snapshot before migrate; add
a root `compose.yaml` or pass `-f docker/compose.<mode>.yml`.

**Verify.** Dry-run the workflow with a failing migration → job fails; a
synthetic bad commit cannot reach prod without CI green.

### P2.2 No error tracking, structured logs, or request ids

**Problem.** Zero Sentry/OTel/pino; `console.*` in 44 files (73 calls);
`src/lib/with-error-handler.ts:16` logs with no method/path/user/id and returns
a 500 with no correlation id; `src/proxy.ts` forwards only `x-pathname`.

**Fix.** Add Sentry (or OTel) + a leveled JSON logger; mint an `x-request-id` in
`proxy.ts`, echo it in error responses and logs; include user/route context.

**Verify.** Unit: logger emits JSON with requestId; error handler includes it.
Manual: an induced 500 is visible in the tracker with the same id as the client
response.

### P2.3 Health check is liveness-only

**Problem.** `src/app/api/health/route.ts:8-10` returns `{ ok: true }` with no
DB/Redis probe, yet every Docker healthcheck points at it.

**Fix.** Add `/api/ready` (`SELECT 1` + Redis `PING`, short timeout) and point
healthchecks there; keep `/api/health` as liveness.

**Verify.** Stop Postgres → `/api/ready` 503, `/api/health` 200.

### P2.4 E2E never runs in CI

**Problem.** `ci.yml` runs typecheck/lint/format/unit/build/security — no
Playwright job; `ci:test` exists but is never invoked. Regressions in roles,
auth, money flows, and moderator/activation (S1–S42) ship unseen. Separately,
the suite is flaky-prone: `networkidle` ×77 and fixed sleeps.

**Fix.** Add an E2E job with a Postgres service + `pnpm build` + `pnpm test:e2e`
(seed is handled by `playwright.config.ts`). Replace `networkidle` with web-first
assertions (`expect(locator).toBeVisible()`, `waitForResponse`) and remove fixed
sleeps; consider `fullyParallel` for speed once stable.

**Verify.** CI red on a deliberately broken flow; suite remains green and
faster.

### P2.5 Cleanup cron is incomplete; upload sweep is stuck in dry-run

**Problem.** The cluster compose schedules the upload sweep with `?dryRun=1`
(`docker/compose.cluster.yml:155`) — it never deletes. The monolith compose has
**no cron service at all** (`docker/compose.monolith.yml`), so session/audit/
email/upload cleanup never runs there. The local pg_cron init path is wrong
(`docker/compose.postgres.yml:28` → `./scripts/...` but the file is at repo
root).

**Fix.** Remove `?dryRun=1` (or make it an env toggle) after one review cycle;
add a cron service to monolith (or enable pg_cron with the custom image); fix
the init path.

**Verify.** Local: orphaned upload file is deleted by the cron route. Ops:
monolith has scheduled jobs.

### P2.6 Docs and env drift

**Problem.** `docs/DEPLOYMENT.md:210,353` says `drizzle-kit push --force` (code
runs `migrate.ts`); `:102-105` ports `5432/5433/5434` vs compose `25432-25434`;
`README.md:21` says uploads go to `./uploads` vs `.env.example:17`
`./.uploads`; `.env.example:13` ships a 10-char `BETTER_AUTH_SECRET` that fails
the ≥32-char boot validation (`src/lib/env.ts:76-79`) — so the documented
`cp .env.example .env.local && pnpm dev` does not boot; `NEXT_PUBLIC_BASE_URL`
is read by `src/app/forgot-password/page.tsx:25` but undocumented/unvalidated
and not passed by deploy.

**Fix.** Reconcile docs with code (or generate env docs from `env.ts`); ship a
≥32-char placeholder + generation instruction; document/validate/pass
`NEXT_PUBLIC_BASE_URL`.

**Verify.** Fresh clone: `cp .env.example .env.local && pnpm dev` boots; doc
commands match compose.

---

## P3 — Performance & data hygiene

| Item | Evidence | Fix |
|------|----------|-----|
| Analytics scans all orders by default | `orders/analytics/route.ts:49-66` — no default window despite the "last 30 days" comment | Default `from = now - 30d`; cap the series |
| Email list ships full HTML bodies | `email-logs/route.ts:41-42` selects `body`/`textBody` per row | Omit from the list; fetch on detail |
| Bulk order creation scans all zone pricing | `orders/bulk/route.ts:147-155` — `allZoneIds` computed then ignored | `WHERE inArray(fromZoneId, allZoneIds)` |
| Hot lists use OFFSET pagination | `src/lib/hooks/use-table-filters.ts` + routes | Keyset pagination for orders/audit/email logs when deep |
| No coverage tooling | no `@vitest/coverage-*`, no `coverage` block | Add coverage-v8 + thresholds in CI |
| No real-DB integration tests | 45 specs `vi.mock("@/lib/db")` | Add a small integration suite (migrations, locks, constraints) |
| Images unoptimized | `next.config.mjs:19-21` `images.unoptimized` | Enable `next/image` with R2 `remotePatterns`, or downscale on upload |
| Dead hook/doc for a missing route | `src/features/team/hooks/use-team.ts:126-140` calls `/api/team/[id]/pricing` (no route); `CONTRIBUTING.md:60` documents it | Delete the hook fn + doc line, or add the route |
| Stale generated file | `drizzle/postgres/schema.ts` missing 0002 columns | Regenerate or delete |

---

## P4 — Product & DX

### P4.1 Notification system (deferred — design kept)
In-app notifications for state changes (per-user, per-event), fanned out **in the
same transaction** as the triggering change via a `src/lib/notify.ts` helper
mirroring `audit.ts`; bell + unread badge in all four shells; `GET
/api/notifications`, `PATCH /api/notifications/[id]`, `PATCH
/api/notifications/read-all`. Email channel in v2 (reuses the P1.5 outbox).
Acceptance: fan-out unit tests (event → recipients) + API specs + e2e
(merchant gets an order-status notification and marks it read).

### P4.2 Quick wins
Subscription/pricing display on the merchant dashboard; pricing tiers on the
landing page; help-center polish (FAQ deep links).

### P4.3 Growth backlog (unchanged from the prior roadmap)
| Area | Tasks |
|------|-------|
| Analytics & reporting | Merchant comparison, PDF/Excel export, scheduled reports, rider performance |
| Mobile | PWA/offline + push, mobile-optimized order form, camera capture, GPS tracking |
| API & integrations | Accounting export (Tally/QuickBooks), SMS gateway, WhatsApp updates |
| Scalability | Redis for hot data, CDN, background jobs (ties to P1.5), multi-instance, promote the `dbRead` split to real replicas, query consolidation |
| Phase 6 backlog | Public API docs (OpenAPI), video tutorials, status page |

### P4.4 DX & quality of life
Add a "skip to content" link in the role shells + root layout and re-enable the
disabled Biome a11y rules (`biome.json:47-53`: `noSvgWithoutTitle`,
`useValidAriaRole`, `noLabelWithoutControl`, `noAutofocus`, `useButtonType`);
pin Node (`engines` + `.nvmrc` = 22; `@types/node` currently `^24`); remove
unused deps (`lighthouse`, `@vercel/og`); drop the dead `deps-prod` Dockerfile
stage; gate body logging behind a debug flag.

---

## Already shipped (do not re-propose)

Phases 1–4 (security, correctness, maintainability, testing/CI/docs — incl.
Redis rate limiting, CSRF checks, route-auth-guard test); H1–H4 security slice
(CI audit gate, audit entity diffs, `ADMIN_IP_ALLOWLIST`, 2FA TOTP + QR +
recovery codes + `ADMIN_2FA_REQUIRED`, merchant opt-in); user management
(password reset/ban/unban + S38), change own email (S39), portal modes
(`admin|public|all`), storage hygiene (orphan-upload sweep), FAQ (`/faq`), user
docs (`/help/{merchant,rider,admin}`), support tickets, landing refresh,
auto-CSV DataTable export, fixed refresh button, order-details right drawer;
**merchant branding revamp** (portal-wide CSS-var theme, `src/lib/brand-color.ts`
contrast utils, tracking-page merchant header, email logo/accent + footer drop,
settings live preview); **merchant moderator accounts + staff activation**
(nav-grant permissions over the merchant sidebar, PENDING→ACTIVE email
activation for moderators and warehouse admins, per-merchant quota set by
SUPER_ADMIN, public `/activate` page, mailer now logs config-missing sends);
Supabase **storage** removed (local + R2 only); SOC 2 removed by decision.

---

## Guardrails — verified-clean areas (don't regress these)

- **Uploads**: content-type/size/folder allowlists + traversal defense
  (`uploads/route.ts`, `uploads/[...path]/route.ts`) — *pending P0.2 hardening*.
- **Order state machine**: every transition goes through
  `applyOrderTransition`/the bulk runner with per-transition guards and a row
  lock (`src/features/orders/transitions.ts`).
- **IDOR**: ownership scoping verified in `orders/[id]`, `payouts`,
  `merchants/[id]/*`, `riders/[id]`, `warehouses/[id]`, `pickup-locations/[id]`,
  team, moderators, support.
- **Admin surface**: write sites gated to SUPER_ADMIN (or role-appropriate) —
  the route-auth-guard test makes this a *static* guarantee.
- **Public tracking**: phone fields masked, no phone-based lookup.
- **No `dangerouslySetInnerHTML`** anywhere; markdown rendered without
  `rehype-raw`; all `sql`` templates parameterized.
- **Secrets**: `.env*` gitignored; `validateEnv()` enforces a ≥32-char auth
  secret and production SMTP key; SMTP password AES-256-GCM encrypted.
- **Money invariant (new)**: once P0.4 lands, `merchant_balance` must always
  equal the sum of its SETTLED ledger rows — assert it in tests.
- **Spec coverage**: 1377 unit + 65 e2e — keep new routes/branches covered
  (colocated `<resource>.spec.ts`; e2e `S<n>` serial, next is S43).

---

## Execution order

```
1. P0.1  Public PII + guessable ids            (security)
2. P0.2  Upload auth + public NID exposure     (security)
3. P0.3  Payout race + bulk ledger gap         (money)
4. P0.4  Money type + ledger signs + recon test(money)
5. P0.5  Server-side 2FA / email verification  (authz)
6. P0.6  Rate-limit hardening                  (abuse)
7. P0.7  Signup off, log/token hygiene         (hygiene)
8. P1.1  TOCTOU constraints + transactions     (correctness)
9. P1.2  Migration runner + docs               (ops)
10. P1.3 Timezone                              (correctness)
11. P1.4 Atomic lifecycle + audit + history    (correctness)
12. P1.5 Email outbox                          (reliability)
13. P1.6 Constraints/indexes/counts            (data)
14. P2.1 Deploy safety                         (ops)
15. P2.2 Observability                         (ops)
16. P2.3 Readiness probe                       (ops)
17. P2.4 E2E in CI + de-flake                  (quality)
18. P2.5 Cron completeness                     (ops)
19. P2.6 Docs/env drift                        (DX)
20. P3.x Performance & data hygiene            (batched)
21. P4.x Product & DX                          (as capacity allows)
```

Each item verifies with `pnpm ci:check` → `pnpm test:unit:run` → `pnpm build`
→ `pnpm test:e2e` before moving on. P0 items additionally require an
integration test against a real Postgres where concurrency is involved.
