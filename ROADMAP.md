# ROADMAP — Hardening & Growth

> Last updated: 2026-09-27. Rewritten from a full-stack audit (security,
> data/money correctness, ops/DX) — every item cites the code it comes from.
> The previous "Phase 5.x features" roadmap is preserved at the bottom
> (`P4 — Product`), minus everything already shipped.
>
> Current health: `pnpm ci:check` ✅ · Unit **1595/1595** ✅ · Build ✅ ·
> E2E **87/87** ✅ (21 spec files, S1–S54, now run in CI) · real-DB
> integration suite **8/8** in CI · coverage gate enforced (statements 48 /
> branches 41 / functions 37 / lines 49) · dependency tree has
> **0 high/critical advisories** · route-auth-guard test enforces server-side
> auth on all API routes.

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

## Completed

### ✅ P0.1 — Public tracking token + PII-free receiver note (2026-09-27)

**Was:** `PATCH /api/orders/[id]/receiver-note` was public and returned the whole
order row (`.returning()`), so anyone could enumerate the sequential ids
(`ORD-100001E`) to harvest recipient PII and overwrite live notes.

**Shipped:**
- `order.trackingToken` — 128-bit random, unique — generated on single create,
  bulk create and seed. Migration `drizzle/postgres/0003_orange_rhino.sql` adds
  the column, backfills existing rows (`md5(random()…||id)`) and creates the
  unique index.
- The public note write now **requires the token** and returns `{ ok: true }`
  (never order fields). Unknown order and wrong token both return 404 — no
  existence oracle. Constant-time compare in `src/lib/tracking-token.ts`.
- The tracking page resolves **token first, then the human order code**
  (`src/app/track/[id]/lib.ts` → `matchedByToken`); the note form is enabled only
  for token links and shows a read-only hint for code links.
- Merchant UI links (orders, dashboard, finance, order drawer, `TrackingCell`)
  now share the token URL; `ORDER_CORE_COLUMNS` exposes `trackingToken`.

**Tests:** `src/lib/tracking-token.spec.ts`; `src/app/api/orders/[id]/receiver-note/receiver-note.spec.ts`
(8 cases incl. a no-PII regression guard); extended `src/app/track/[id]/page.spec.tsx`;
e2e **S43** (token link enables the form, code link is read-only, missing token →
400, wrong token → 404, valid token → 200 `{ ok: true }`).

**Residual (tracked elsewhere):** reads by the sequential code stay allowed for
the parcel-label/typed-search UX (token-only reads are an optional follow-up),
and the note write is still read-then-write — hardened under **P1.4**.

---

### ✅ P0.2 — Upload authorization + private NID files (2026-09-27)

**Was:** `/api/uploads` accepted writes from anyone (no session) into `nids/`,
and every stored file was world-readable via `/uploads/[...path]` (and R2's
public URL) — rider/merchant NID documents were permanently public and the
endpoint was free anonymous hosting. The 5 MB cap was also checked *after*
`formData()` had buffered the whole body.

**Shipped:**
- **Read policy** (`src/app/uploads/[...path]/route.ts`): `logos` stays public
  (needed by the public tracking page); `avatars`/`nids` are readable only by
  their owner (the `{folder}/{userId}/…` segment must match the session) or a
  SUPER_ADMIN; everything else needs any authenticated session. Authorization is
  checked **before** the filesystem is touched, and private responses use
  `Cache-Control: private` so shared caches never store them.
- **Write policy** (`src/app/api/uploads/route.ts`): a signed-in user uploads
  into their own namespace; the only anonymous flow (rider-application NIDs)
  must present a short-lived HMAC token from the new rate-limited
  `POST /api/uploads/token` (`src/lib/upload-token.ts`).
- **Content-Length is enforced before parsing** — 413 when it exceeds the cap,
  411 when it is absent — so a declared-oversize body is never buffered.
- **Magic-byte sniffing** (`src/lib/image-signature.ts`) decides the stored type
  and extension, so a spoofed `file.type`/filename cannot smuggle non-images.
- Rider-application NID fields no longer render a URL preview (private files
  cannot be fetched anonymously); they keep the upload/replace controls.

**Tests:** `src/lib/image-signature.spec.ts`; `src/lib/upload-token.spec.ts`;
`src/app/api/uploads/uploads.spec.ts` (411/413/401/403/400, token happy path,
sniffed type); `src/app/uploads/[...path]/uploads.spec.ts` (public / owner /
admin / authenticated policy + traversal); e2e **S44** (anonymous upload needs a
token, non-images rejected, stored NID is 401 to the world and 200 with a
private cache for a reviewer).

**Residual / ops note:** with `STORAGE_PROVIDER=r2` the bucket must be **private**
for `nids`/`avatars` — the app cannot override bucket-level ACLs, so those
folders need a private bucket (or a separate one) and signed access. Also, a
client that omits Content-Length and streams a chunked body can still be
buffered up to the post-parse cap; streaming multipart parsing is the follow-up.

---

### ✅ P0.3 — Payout double-pay + bulk ledger gap (2026-09-27)

**Was:** `POST /api/payouts` read the payable orders *outside* the transaction
and linked orders with a broader predicate, so two concurrent requests could
each insert a request row carrying the same orders' earnings — the loser's row
kept an `amount` with no orders behind it and could still be approved and paid.
Separately, `PATCH /api/payouts/bulk/mark-paid` only flipped the status: it never
wrote the `PAYOUT` ledger row or debited `merchant_balance`, so bulk settlements
silently diverged from the ledger. The seed never linked its payout orders
either, leaving them payable twice.

**Shipped:**
- **Create** (`src/app/api/payouts/route.ts`): the eligible-order read now runs
  **inside** the transaction with `FOR UPDATE`, the amount is derived from that
  locked set, and only those ids are linked. A concurrent request finds no
  eligible rows and returns 400 — no orphan request can be created.
- **Shared settlement** (`src/lib/payout-settlement.ts`): one
  `settlePayoutAsPaid()` used by both the single and bulk endpoints — locks the
  request row, **recomputes the amount from the orders actually linked to the
  request**, refuses a request with **no linked orders**, then writes exactly one
  `PAYOUT` ledger row and one balance debit.
- **Approve** validates that the request has linked orders and corrects the
  stored amount to the recomputed total (visible in the audit diff).
- **Seed** (`src/lib/db/seed/payouts.ts`) now sets `order.payoutRequestId` for its
  PENDING/APPROVED payouts, so seeded orders can no longer be paid twice.
- No extra index was required: `order.payoutRequestId` is single-valued, and the
  locked read plus the "no linked orders" guard make an orphan request
  impossible to create or pay.

**Tests:** `src/app/api/payouts/payouts.spec.ts` (create links exactly the locked
orders; approve recomputes/validates; paid writes the ledger + balance; orphan →
400; bulk settles through the same helper) and e2e **S45** (bulk mark-paid → one
new ledger row and the balance debited by the amount; a directly inserted orphan
request is refused with nothing moved).

**Residual:** the ledger *sign* convention (delivery credit vs payout debit) and
the float money columns are the subject of **P0.4**, which adds the
balance ↔ ledger reconciliation test.

---

### ✅ P0.4 — Money rounding, ledger signs + reconciliation (2026-09-27)

**Was:** every money column is `double precision`; rounding was inconsistent
(the COD fee rounded, the delivery fee/earnings did not); and the ledger used the
same negative sign at delivery and at payout, so a settled order double-counted
its fees — a delivered+payout order left the merchant balance at `-167` for a
100/10/1 order instead of `0`. Nothing asserted `balance == Σ ledger rows`.

**Shipped:**
- **`src/lib/balance-ledger.ts`** — the accounting spec as code: the sign
  convention (`positive = merchant owes the platform`), one builder per ledger
  entry (`orderChargeAmount`, `codCollectedAmount`, `payoutAmount`,
  `paymentAmount`), `toPaisa()` for 2-decimal rounding, and `settledTotal()` for
  the reconciliation invariant. Worked example (productCost 100, deliveryFee 10,
  codFee 1): placed `+11` → delivered `-100` (balance `-89`) → payout `+89`
  (balance `0`); the platform keeps its 11 in fees.
- **Rounding**: `pricing.ts` now rounds the delivery charge and earnings to paisa
  (`toPaisa`), and the order-create/bulk paths round `productCost` and the
  `ORDER_CHARGE` amount at the write boundary.
- **Signs**: the delivered transition credits the **gross** collected COD
  (`codCollectedAmount`), and a payout is a **positive** (credit-consuming)
  entry — in `lib/payout-settlement.ts`, so single and bulk both follow it.
- **Seed**: `ORDER_EARNINGS` now credits the gross COD and the two `PAYMENT_*`
  rows are honest merchant→platform payments (they were mislabelled payouts).

**Tests:** `src/lib/balance-ledger.spec.ts` (worked example + reconciliation
invariant + rounding); `pricing.spec.ts` rounding table; the delivered-transition
spec now asserts the `-productCost` ledger entry (its db mock gained the missing
`insert` chain); `payouts.spec.ts` asserts the positive payout entry; e2e **S45**
adds "every merchant balance equals the sum of its SETTLED ledger rows" against
the real database.

**Residual → P0.8 (now shipped):** the money *columns* were `double precision`;
rounding + reconciliation tests bounded and detected drift, and **P0.8** moved
storage to `numeric(14,2)`, making the invariant exact.

---

### ✅ P0.5 - Server-side session gates (2026-09-27)

**Policy is now enforced in `requireSession()`, not just by shell redirects.**

- **`src/lib/session-policy.ts`** (new, pure + unit-tested): one decision
  function, `sessionBlockReason(user, twoFactorRequired)` → banned /
  unenrolled-admin / unverified-merchant. The block reasons are plain strings so
  both API routes and server pages share one rule set.
- **`src/lib/api-auth.ts`**: `loadSession(lenient)` now selects
  `user.banned`, `user.twoFactorEnabled`, `merchant.emailVerifiedAt` and
  `session.impersonatedBy` (left join on merchant). `requireSession()` refuses
  a session for any block reason; `requireSessionForAccountState()` is the lenient
  variant used where the answer *is* "the account needs setup" (e.g.
  `/api/users/me`, which the client polls to decide where to redirect).
- **Impersonation is auditable**: `AuditActor.impersonatedBy` is merged into the
  audit metadata by `src/lib/audit.ts`, so an admin acting through
  "view as" leaves a distinguishable trail.
- **Client behaviour is unchanged** — the browser redirects were already right;
  the API now simply agrees with them.

**Tests:** `session-policy.spec.ts` (each block reason + allow cases),
`api-auth.spec.ts` (banned / 2FA-policy / unverified / lenient state /
impersonation), e2e **S46** (`13-session-gates.spec.ts`): an unverified merchant
session is refused by `/api/merchants` until `emailVerifiedAt` is set, and a
banned user's session is refused by the API.

### ✅ P0.6 - Rate limiting can't be spoofed or silently bypassed (2026-09-27)

- **`src/lib/client-ip.ts`** (new): the single trust decision for "who is the
  client", shared by Node routes and the edge proxy. Forwarding headers are
  ignored entirely unless `TRUSTED_PROXY_HOPS` is set, and only the entry the
  last trusted hop appended is honoured, so a client cannot mint a fresh bucket
  with a forged `x-forwarded-for` (nor slip past `ADMIN_IP_ALLOWLIST`).
- **`rate-limit.ts`**: uses that resolver; gains `rateLimitByIp({ failClosed })`
  so IP-keyed endpoints (merchant registration, activation, verification
  resend) share one bucket instead of going unlimited when no IP resolves;
  reports `rateLimiterDegraded()` — a missing `REDIS_URL` in production is now a
  loud warning plus a `/api/health` signal instead of a silent per-instance Map.
- **`src/lib/auth.ts`**: sign-in is capped at the global 10/min in production
  (dev/test keep 100 so a test run is not self-DoS'd); get-session stays 60/min.
- **`src/proxy.ts`** uses the same resolver for the admin allowlist and uploads.
- **Config/docs**: `TRUSTED_PROXY_HOPS` added to `.env.example`, `docs/ENV.md`
  (validated by `validateEnv()`), and the four app services in
  `docker/compose.cluster.yml`; Playwright sets it to 1 and sends a fixed
  `x-forwarded-for` so IP-keyed limits behave deterministically.

**Tests:** `client-ip.spec.ts` (untrusted headers ignored, hop-index selection,
XFF/real-ip/cf precedence), extended `rate-limit.spec.ts`, health reports the
degraded flag.

### ✅ P0.7 - Signup closed, mailer redacted, verify token hashed (2026-09-27)

- **`disableSignUp: true`** in `src/lib/auth.ts`: every account is created
  server-side (merchant application, admin/owner invites), so the public
  `POST /api/auth/sign-up/email` was creating profile-less password users.
- **`src/lib/redact.ts`** (new): `redactSecrets()` strips credentials from
  free text/HTML (token/code/key/secret query params, URL userinfo, `Bearer`
  headers, JWTs) and `redactAndTruncate()` bounds the length. The mailer's
  **console** log — the one that reaches container stdout, CI and log
  aggregators — is now redacted, so no live reset/activation link lands there.
  `email_log` rows are stored **truncated** (2 000 chars) and the admin-only,
  10-day-retention table keeps the single-use link params on purpose: the raw
  token expires in 24h, is consumed on first use, and `10-activation` e2e
  depends on that row.
- **Merchant verification tokens are hashed**: `src/lib/verify-token.ts`
  (`issueVerifyToken` → 32 random bytes, SHA-256 stored, 24h expiry) is used by
  registration, `resend-verification` and `merchants/[id]/verify-email`;
  `/api/auth/verify-email` compares hashes, so a table dump can no longer verify
  an arbitrary merchant — the same treatment staff activation tokens already had.
- **Seed password is not a published production secret**: `SEED_PASSWORD` env
  override, and both seed entrypoints refuse to run when
  `NODE_ENV=production` while the default (`12qwaszx`) is in use. Tracked files
  carry no live-looking secrets (`.env` stays git-ignored, `.env.example` is
  placeholders only), and `docs/ENV.md` gained a "Secrets on disk" note.
- Upload size was already covered by P0.2 (Content-Length pre-check + post-parse
  `file.size` cap, `MAX_UPLOAD_BYTES`), so no change was needed here.

**Tests:** `redact.spec.ts`, `verify-token.spec.ts`, `mailer.spec.ts` (no
`token=` in the console output; body truncated in `email_log`),
`seed-content/credentials.spec.ts` (production guard), `env.spec.ts`
(`TRUSTED_PROXY_HOPS` validation), e2e **S47** (`14-signup-locked.spec.ts`):
the sign-up endpoint 4xxs and writes no `user` row, while `/register` still
serves the merchant application. e2e S39 now asserts the stored token is a hash
before driving the flow with a test-owned token.

---

## P0 — Security & money (ship-blockers)

> **P0.1–P0.8 shipped 2026-09-27** — see **Completed**. **No P0 item is
> outstanding**; **P1.1–P1.6 also shipped** (see **Completed**). **All of P1 is
> done**, **all of P2 (P2.1–P2.6) is shipped**, and **P3's hardening batch is
> shipped**; what remains is **P4 (product & DX)**.

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

### P0.8 Money column types: `numeric(14,2)` — ✅ shipped

**Problem.** Every money column was `double precision` (`finance.ts:26-27,51`,
`orders.ts:95-98,139`, `merchants.ts:50-55`, `logistics.ts:78-82`,
`platform.ts:168-184`). P0.4 rounds at every write boundary and the
reconciliation test detects drift, but binary-float storage made
exact-decimal auditing impossible.

**Fix (shipped).**
- `schema.postgres/helpers.ts` exports `money(name)` =
  `numeric(name, { precision: 14, scale: 2, mode: "number" })`; all 15 money
  columns use it (`balance_transaction.amount`, `merchant_balance.balance` /
  `pendingBalance`, `zone_pricing.baseRate` / `extraRatePerKg`,
  `merchant.baseRate` / `extraRatePerKg`, `order.productCost` / `deliveryFee` /
  `codFee` / `merchantEarnings` / `amountCollected`, `payout_request.amount`,
  `platform_config.defaultBaseRate` / `defaultExtraRatePerKg`). Weights and
  percentages deliberately stay `double precision`.
- `drizzle/postgres/0004_stiff_dakota_north.sql` backfills with
  `USING round(x::numeric, 2)` — a no-op on re-apply, so it is idempotent both
  through `src/lib/db/migrate.ts` (Docker) and `drizzle-kit push` (dev).
- `src/lib/db/money-sql.ts` (`sumMoney` / `sumMoneyFiltered` / `sumAbsMoney`)
  aggregates in PostgreSQL exactly, then casts only the *result* to `::float8`.
  Without the cast node-postgres hands back a string for `numeric` / `sum(numeric)`
  while `sql<number>` claims a number — the silent bug this item is about.
- `src/lib/payout-settlement.ts` and the analytics / payable / approve / rider-cash
  / seed aggregate sites now go through those helpers.
- Raw `pg` reads in e2e coerce with `Number(...)` (S45 had to be fixed: a
  `numeric` amount arrives as a string and broke `toBeCloseTo`).

**Verify.** `money-sql.spec.ts` pins the cast (4 unit tests, aggregate column is
never pre-cast, `coalesce(..., 0)` on empty sets); e2e **S48**
(`15-money-decimal.spec.ts`) asserts all 15 money columns are `numeric(14,2)`, that
weights/percentages are still floating, and that the balance/ledger invariant is
an *exact* `=` comparison in SQL rather than a float tolerance. Full gate green:
unit **1496/1496**, e2e **78/78**, S45 still passes.

---

### ✅ P1.1 — Check-then-write races need constraints + transactions (2026-09-27)

**Was:** five flows read a condition and then wrote without a lock or
constraint, so two concurrent requests could both pass the check (moderator
quota, zone-pricing upsert, balance-payment submit, rider application,
merchant approve/suspend/reactivate).

**Shipped:**
- **Constraints** (migration `drizzle/postgres/0005_massive_red_shift.sql`):
  `zone_pricing_pair_uniq` on `(fromZoneId, toZoneId)`,
  `balance_tx_one_pending_payment_uniq` (partial, `type='PAYMENT_PENDING' AND
  status='PENDING'`), and `rider_email_uniq` (`lower(email)` partial). The
  migration first remediates pre-existing duplicates idempotently: surplus
  pending payments are `REJECTED` (ledger stays append-only) and their reserved
  `pendingBalance` released, duplicate zone pairs are collapsed to the newest,
  and duplicate rider emails are blanked (the rider is preserved).
- **Transactions + locks:** moderator create/update run the target read, quota
  check and write in one transaction, with `lockModeratorQuota` doing
  `SELECT … FOR UPDATE` on the merchant row (`src/lib/activation.ts`); the
  balance-payment submit locks the merchant's balance row and re-checks inside;
  the rider application writes rider + profile + audit in one transaction and
  deletes the Better Auth user on failure (`src/lib/db-errors.ts` maps SQLSTATE).
- **Conditional state changes:** single and bulk merchant approve / suspend /
  reactivate repeat the status predicate on the write and surface a conflict
  when no row matched; the moderator update predicates on the read `isActive`.
- `logAudit` accepts an optional transaction: inside one a failure propagates
  so the audit row commits atomically with the change it describes.

**Verify.** Unit: wrong-state guards return 4xx and write nothing; quota lock
takes `FOR UPDATE` and throws `ModeratorQuotaError` with `used/max`; SQLSTATE
helpers; `logAudit` tx semantics (propagate in tx, swallow outside). E2E **S49**
(`16-concurrency.spec.ts`) fires two parallel requests against real Postgres for
each race and asserts one row / one accepted write / no orphan user. Full gate
green: unit **1525/1525**, e2e **81/81**.

---

### ✅ P1.2 — Migration runner is fragile; docs contradict it (2026-09-27)

**Was:** the hand-rolled runner split SQL on `;` (breaking `$$` bodies), ran
each statement outside a transaction, and keyed the ledger on the **filename**
(so a renamed/regenerated file re-applied the whole init migration). The cluster
compose started **four** migrate services with no lock against non-idempotent
DDL, and the docs told operators to run `drizzle-kit push --force` in
production.

**Shipped:**
- `src/lib/db/migrate.ts` now wraps **drizzle's own migrator**
  (`drizzle-orm/node-postgres/migrator`): journal-driven ordering, split on
  `--> statement-breakpoint` (a `$$`-quoted function body survives), the whole
  run in one transaction, and a SHA-256 content-hash ledger. A renamed or
  regenerated file is never re-applied.
- The runner takes a database-wide `pg_advisory_lock` on a dedicated
  connection for the whole run, so concurrent runners queue instead of racing.
- `src/lib/db/migration-ledger.ts` reconciles the old filename ledger in place
  (filename → content hash + journal `when`), so existing deployments keep
  their history; an unmatched row is neutralized rather than allowed to pin the
  ledger. Unit-tested (`migration-ledger.spec.ts`).
- A database with tables but no history (a `drizzle-kit push` DB) now fails
  with an actionable message; `pnpm db:migrate --baseline` records the current
  migrations as applied in one explicit step.
- `0002_*.sql` / `0003_*.sql` made idempotent (`ADD COLUMN IF NOT EXISTS`,
  `CREATE UNIQUE INDEX IF NOT EXISTS`).
- `docker/compose.cluster.yml` has a **single** `migrate` service; all four
  role apps `depends_on: migrate: service_completed_successfully`. The vestigial
  `RUN_MIGRATIONS` env and `migrate-*` services are gone.
- `docs/DEPLOYMENT.md` / `docs/SETUP.md` now describe the runner and ban
  `drizzle-kit push --force` outside local dev.

**Verify.** Integration (manual, scratch DB): create empty database → run
`db:migrate` → 6 migrations applied, 24 tables, ledger 6/6 content hashes → run
again → no-op, no error. On the existing `db:push` dev DB: `db:migrate` refuses
with the baseline hint; `db:migrate --baseline` records 6 rows and the next run
is a no-op. `migration-ledger.spec.ts` covers the reconciliation planner.

---

### ✅ P1.3 — Timezone: pin the business timezone (2026-09-27)

**Was:** range filters used **server-local** end-of-day
(`src/lib/pagination.ts:79`, `orders/payable/route.ts:56`), analytics grouped
by the DB session timezone (`date(created_at)`), and no container set `TZ`, so
a Dhaka evening order landed in the next day's bucket and "today" leaked into
tomorrow by up to six hours. The date picker also formatted via
`toISOString()`, shifting its presets back a day on a Dhaka browser.

**Shipped:**
- `src/lib/timezone.ts` — `BUSINESS_TIMEZONE = "Asia/Dhaka"` and the day math
  (`businessDateString`, `businessDayStart/End/Range`, `businessRangeBound`,
  `businessToday`, `addBusinessDays`, month helpers). Host-timezone independent
  (uses `Intl` with the IANA zone; two-pass offset for DST correctness).
- `parseDateRange` now bounds the Dhaka calendar day (inclusive), and
  `orders/payable/route.ts` uses the same helper.
- `src/lib/db/time-sql.ts` — `businessDate(col)` renders
  `date(col AT TIME ZONE 'Asia/Dhaka')::text`; analytics groups/orders by it.
- `src/lib/db/index.ts` pins the session timezone
  (`options: "-c timezone=Asia/Dhaka"`) on both pools.
- `DateRangePicker` builds presets from business-local dates; Dockerfile adds
  `tzdata` + `ENV TZ=Asia/Dhaka`; `.env.example` documents `TZ`.

**Verify.** Unit: `timezone.spec.ts` (Dhaka boundaries, UTC+6, DST-safe
end = next-start − 1ms, month math) and `time-sql.spec.ts` (renders the explicit
zone, `::text`, no params); `pagination.spec.ts` pins the exact UTC bounds. E2E
**S50** (`17-timezone.spec.ts`) moves a seeded order to `2031-03-15T20:00Z`
(= 2031-03-16 02:00 Dhaka) and asserts the analytics bucket and the list date
range agree. Full gate green: unit **1549/1549**, e2e **82/82**.

---

### ✅ P1.4 — Lifecycle writes are atomic; audit inside the tx (2026-09-27)

**Was:** `logAudit` ran **after** commit, so a crash between the two lost the
trail; registration/team creation could orphan the auth user on a partial
failure; `merchant.email` could change without syncing `user.email` (duplicate →
500); and there was no order status history, so `reattempt` erased the prior
failure.

**Shipped:**
- **Order transitions** (`src/features/orders/transitions.ts`) write the audit
  row and an `order_status_history` row **inside the transition transaction**
  (single and bulk). A failed audit now rolls the change back instead of
  committing state without a trail.
- **`order_status_history`** (migration `0006_exotic_squadron_sinister.sql`):
  append-only `orderId` / `fromStatus` / `toStatus` / `transition` / actor /
  `note` / `createdAt`, indexed on `(orderId, createdAt)`. The `reattempt`
  reason and the failure note survive even though the order row clears them.
- **Registration** (`merchants/route.ts`) and **team creation**
  (`team/route.ts`): the Better Auth user is created first, then the app tables
  are written in one transaction; a failure deletes the user instead of leaving
  an orphan. The activation email is sent after commit.
- **Merchant email** (`merchants/[id]/route.ts`): the owner's `user.email` is
  synced in the same transaction as `merchant.email`, and a duplicate returns
  **409** via `isUniqueViolation` instead of a 500.

**Verify.** Unit: audit failure → 500 (change not committed); history row
written with the right from/to; duplicate email → 409; owner user email synced.
E2E **S51** (`18-order-history.spec.ts`): drive `OUT_FOR_DELIVERY → failed →
reattempt` and assert the history keeps both rows (with the failure note) while
the order row's `failureNote` is null. Full gate green: unit **1551/1551**,
e2e **83/83**.

---

### ✅ P1.5 — Durable email (outbox) instead of fire-and-forget (2026-09-27)

**Was:** sends were unawaited with in-process retries, so a frozen serverless
invocation or a crash after commit lost the send and its retries, and the
`email_log` row only landed once the attempt resolved.

**Shipped:**
- `email_outbox` (migration `0007_cold_doomsday.sql`): a durable queue with
  `PENDING/SENDING/SENT/FAILED`, `attempts`, `lastError`, `nextAttemptAt`.
- `src/lib/email-outbox.ts`: `enqueueEmail(payload, tx)` inserts the row in the
  caller's transaction; `drainEmailOutbox()` claims due rows with
  `FOR UPDATE SKIP LOCKED`, sends via the existing mailer (`maxRetries: 0`, so
  `email_log` stays the delivery record), deletes on success and requeues with
  exponential backoff (5 attempts max) on failure. Stale `SENDING` rows are
  recovered. `flushEmailOutbox()` is the never-throwing post-commit kick.
- Every transactional sender now enqueues in the domain transaction and flushes
  after commit: merchant registration + approval, team creation + resend,
  moderator invite + resend, rider approve/reject, and the Better Auth password
  reset / change-email callbacks.
- `POST /api/cron/drain-email-outbox` (every minute) delivers anything a
  request could not; added to the cluster cron container, `vercel.json`, and the
  deploy/setup docs.

**Verify.** Unit (`email-outbox.spec.ts`): enqueue joins recipients; drain sends
and deletes; failure requeues with backoff; final failure marks FAILED; stale
SENDING recovery. Existing route specs assert the email is enqueued inside the
transaction. E2E **S52** (`19-email-outbox.spec.ts`): insert a row as if the
request died after commit, run the cron, and assert it is processed and an
`email_log` delivery row is written. Full gate green: unit **1557/1557**,
e2e **84/84** (S42's resend flow re-verified end-to-end).

---

### ✅ P1.6 — Missing constraints, indexes, and typed counts (2026-09-27)

**Was:** `profile.merchantId/warehouseId/riderId` had no FK (dangling ids after
a delete); `profile.merchantId` had no index despite hot moderator lookups;
several search columns had no trigram index; and ~15 `count(*)` sites used
`sql<number>` without a cast, so `total` serialized as a **string**.

**Shipped** (migration `0008_fat_old_lace.sql`, idempotent):
- `profile` FKs on `merchantId`/`warehouseId`/`riderId` with `ON DELETE SET
  NULL`; the migration first unlinks any dangling reference so it can't fail.
- `profile_merchant_id_idx`, `profile_warehouse_id_idx`.
- GIN trigram indexes: `merchant.nidNumber`,
  `support_ticket.subject/message/actorName`.
- `rider.email` uniqueness was already shipped in P1.1 (`rider_email_uniq`).
- `count(*)::int` on every paginated list route (orders, payouts, merchants,
  audit-logs, email-logs, riders, team, support, announcements,
  pickup-locations, warehouses, rider-applications, merchant balance) and the
  order-count aggregate.

**Verify.** `db:generate` produced exactly these 9 statements. E2E **S53**
(`20-typed-counts.spec.ts`) asserts `total` is a `number` on the merchants /
audit-logs / email-logs / riders lists and that every `/api/orders/counts`
aggregate is a number. Full gate green: unit **1557/1557**, e2e **86/86**.

---
## P1 — Correctness & consistency

### P1.1 Check-then-write races need constraints + transactions — ✅ shipped

| Flow | Evidence | Fix |
|------|----------|-----|
| Moderator quota | `src/app/api/merchants/[id]/moderators/route.ts:121-146`, `src/lib/activation.ts:112-127` — plain `SELECT` then insert, no tx/lock/constraint | Count + insert in one tx with `SELECT … FOR UPDATE` on the merchant row (or advisory lock); same for re-activation in `moderators/[userId]/route.ts:87-108` |
| Zone pricing upsert | `src/app/api/admin/zone-pricing/route.ts:42-67`; no unique on `(fromZoneId,toZoneId)` (`logistics.ts:66-90`) | Add unique index + `onConflictDoUpdate`; order pricing currently picks an arbitrary duplicate (`orders/route.ts:293-305`) |
| Balance payment submit | `src/app/api/merchants/[id]/balance/payment/route.ts:27-43` — check outside tx | Partial unique index on `(merchantId) WHERE type='PAYMENT_PENDING' AND status='PENDING'`, or lock the balance row |
| Rider application | `src/app/api/rider-applications/route.ts:53-102` — user+rider+profile, no cleanup; `rider.email` not unique (`warehouses.ts:45`) | One transaction + cleanup; unique index on `rider.email` |
| Merchant approve/suspend | `merchants/[id]/{approve,suspend,reactivate}/route.ts` — read status then update | Predicate on current status (`WHERE status='PENDING'`), check affected rows |

**Verify.** Unit tests for each guard (wrong state → 4xx); one integration test
per race using two parallel transactions against a real Postgres.

### P1.2 Migration runner is fragile; docs contradict it — ✅ shipped

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

### P1.3 Timezone: pin the business timezone — ✅ shipped

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

### P1.4 Lifecycle writes should be atomic (and audit inside the tx) — ✅ shipped

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

### P1.5 Durable email (outbox) instead of fire-and-forget — ✅ shipped

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

### P1.6 Missing constraints, indexes, and typed counts — ✅ shipped

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

### ✅ P2.1 — Deploy can report success on a failed migration (2026-09-27)

**Was:** the deploy workflow ran migrations with
`docker compose run --rm migrate || docker compose run --rm migrate-dashboard`
and ended with `docker image prune -f`, so the job exited 0 even when both
migrations failed; it triggered on `push: [main]` without depending on CI, had
no pre-migration backup, and assumed a root compose file that does not exist.

**Shipped** (`.github/workflows/deploy.yml`):
- Trigger changed to `workflow_run` on the **CI** workflow, `branches: [main]`,
  and the job is skipped unless `conclusion == 'success'` — a red CI run can no
  longer reach production.
- Deploys the exact commit CI validated
  (`github.event.workflow_run.head_sha`) and tags the image with it.
- Remote script now starts with `set -euo pipefail`; the `||` fallback is gone,
  so a failing `docker compose run --rm migrate` fails the job and the app is
  never rolled out.
- Pre-migration `pg_dump` (custom format) into `backups/` before migrating.
- Infrastructure is brought up first (`pg-0 pg-1 pgpool redis`), then backup,
  then migrate, then the app.
- Host compose file selected via `COMPOSE_FILE` (defaults to
  `docker/compose.cluster.yml`; monolith hosts override it), replacing the
  nonexistent root compose file.

**Verify.** `src/app/__tests__/deploy-workflow.spec.ts` parses the workflow and
asserts the invariants (CI gate, `set -euo pipefail`, no `||` fallback, backup
before migrate, `head_sha`). `docs/DEPLOYMENT.md` documents the flow. Full unit
suite green: **1561/1561** (build/e2e unaffected — no app code changed).

---

### ✅ P2.2 — Structured logs + request correlation (2026-09-27)

**Was:** zero Sentry/OTel/pino; ad-hoc `console.*` with string interpolation;
`with-error-handler.ts` logged with no method/path/user/id and returned a 500
with no correlation id; `proxy.ts` forwarded only `x-pathname`.

**Shipped:**
- `src/lib/logger.ts` — leveled JSON logger (`level`, `time`, `msg`, fields),
  `err` serialization (name/message/stack/cause), `child()` context, and a
  `LOG_LEVEL` filter. warn/error go to stderr.
- `src/lib/request-id.ts` — `x-request-id` minting/validation; reuses a valid
  inbound id, mints a UUID otherwise.
- `src/proxy.ts` mints/forwards the id and tags every response with it;
  `src/lib/with-error-handler.ts` logs `{ requestId, method, path, err }` and
  returns `{ error, requestId }` with the `x-request-id` header — on every
  response, not just errors.
- Migrated the error/warn path from `console.*` to the logger across the shared
  libraries (audit, auth, crypto, cron-auth, mailer, email-outbox, rate-limit)
  and the API routes (merchants, team, moderators, rider-applications,
  admin/users, verify-email/resend-verification, cron cleanup).

**Verify.** Unit: `logger.spec.ts` (JSON shape, stderr routing, `child`,
`LOG_LEVEL`, error serialization), `request-id.spec.ts` (validation/reuse/mint),
`with-error-handler.spec.ts` (500 body + header + log context, success header
echo). E2E server output now shows single-line JSON records. Full gate green:
unit **1573/1573**, e2e **86/86**.

> Error *tracking* (Sentry/OTel) remains a deployment choice; the logger is the
> structured sink and the correlation id is the hook a tracker would use.

---

### ✅ P2.3 — Readiness probe (2026-09-27)

**Was:** `/api/health` returned `{ ok: true }` with no DB/Redis probe, yet every
Docker healthcheck pointed at it — an instance with a dead database still
reported healthy.

**Shipped:**
- `src/app/api/ready/route.ts`: `SELECT 1` on the primary pool and a Redis
  `PING` (only when `REDIS_URL` is configured), each with a 1.5s timeout;
  returns **503** when a required dependency is unreachable. `/api/health`
  stays a dependency-free liveness probe.
- `pingRedis()` in `src/lib/rate-limit.ts` (returns `true` when Redis is
  optional/unset).
- Dockerfile + both compose files now healthcheck `/api/ready`.
- `docs/DEPLOYMENT.md` documents both probes; `ready/route.ts` added to the
  route-auth-guard public allowlist.

**Verify.** Unit `ready.spec.ts`: 200 when healthy, 503 on DB failure, 503 on a
configured-but-unreachable Redis, and a degraded rate limiter does not fail
readiness. E2E **S54** (`21-readiness.spec.ts`) hits the real endpoint.
Full gate green: unit **1577/1577**, e2e **87/87**.

---

### ✅ P2.4 — E2E in CI + de-flake (2026-09-27)

**Was:** `ci.yml` ran typecheck/lint/format/unit/build/security but no Playwright
job, so role/auth/money/moderator regressions shipped unseen. The suite leaned
on bare `waitForLoadState("networkidle")` (76 sites), which can stall for the
full default timeout under CI load.

**Shipped:**
- `ci.yml` gains an **`e2e` job**: a `postgres:17` service, `pnpm db:migrate`
  (fresh schema via the versioned runner), `pnpm build`, then `pnpm test:e2e`
  (Playwright's `webServer` reseeds and starts `pnpm start`); the report is
  uploaded on failure. The deploy workflow gates on CI, so a red e2e now blocks
  production.
- `e2e/helpers.ts` gains `waitForAppReady(page)` — bounded (10s) and
  best-effort (`load` + `networkidle`), so a never-idle background request
  cannot hang a test; the web-first assertions remain the real gate. All 76 bare
  `networkidle` waits across 9 specs now use it; `login()` uses it too.

**Verify.** `src/app/__tests__/ci-workflow.spec.ts` asserts the e2e job,
Postgres service, migrate/build/Playwright steps. Full e2e suite still green:
**87/87**, unit **1579/1579**.

---

### ✅ P2.5 — Cleanup cron completeness (2026-09-27)

**Was:** the cluster cron ran the upload sweep with `?dryRun=1` (never deleted);
the monolith compose had **no cron service**, so session/audit/email/upload
cleanup never ran there; and the local pg_cron init mounted `./scripts/…` from
`docker/` (the file is at the repo root).

**Shipped:**
- Cluster cron now calls `/api/cron/cleanup-uploads` **without** `?dryRun=1`
  (the sweep keeps its `UPLOAD_SWEEP_MIN_AGE_HOURS` grace, default 48h) and
  `depends_on: dashboard: service_healthy`.
- `docker/compose.monolith.yml` gains the same `cron` service (pointed at
  `app:3000`, `depends_on: app: service_healthy`) scheduling
  `drain-email-outbox`, `cleanup-sessions`, `cleanup-audit-logs`,
  `cleanup-email-logs`, `cleanup-uploads`.
- `docker/compose.postgres.yml` mounts `../scripts/setup-pg-cron.sql` (and the
  usage comment now shows `-f docker/compose.postgres.yml`).
- `docs/DEPLOYMENT.md` lists the monolith `cron` service.

**Verify.** The existing `cleanup-uploads.spec.ts` already covers real deletion
and the min-age grace; `src/app/__tests__/compose-cron.spec.ts` guards the three
invariants (no dry-run in the cluster, monolith cron jobs present, correct
pg_cron path). All three compose files parse. Unit **1582/1582** (app code
unchanged — build/e2e unaffected).

---

### ✅ P2.6 — Docs and env drift (2026-09-27)

**Was:** docs referenced `drizzle-kit push --force` for deploys (code runs the
versioned runner); the monolith port table said `5432/5433/5434` vs compose
`25432-25434`; README said uploads go to `./uploads` vs `./.uploads`; and
`.env.example` shipped a 10-char `BETTER_AUTH_SECRET` that fails the ≥32-char
boot check, so the documented `cp .env.example … && pnpm dev` could not boot.
`NEXT_PUBLIC_BASE_URL` was read by the forgot-password page but undocumented.

**Shipped:**
- `.env.example`: a 44-char `BETTER_AUTH_SECRET` placeholder + `openssl rand
  -base64 32` instruction; documented the optional `NEXT_PUBLIC_BASE_URL`.
- `src/lib/env.ts` validates `NEXT_PUBLIC_BASE_URL` (http(s) URL) when set.
- `deploy.yml` passes `NEXT_PUBLIC_BASE_URL` as a build arg (the Dockerfile
  already accepted it).
- `README.md` quickstart uses `pnpm db:migrate` + `cp .env.example .env` and the
  real `./.uploads`; `docs/DEPLOYMENT.md` ports and troubleshooting reconciled;
  `SETUP.md` / `CONTRIBUTING.md` schema workflow now `db:generate` + `db:migrate`
  with `db:push` marked local-dev only; `docs/ENV.md` documents
  `NEXT_PUBLIC_BASE_URL`.

**Verify.** `src/app/__tests__/docs-drift.spec.ts` guards the env-example secret
length, the README commands, and the compose/docs port match; `env.spec.ts`
covers the new validation. Full gate green: unit **1587/1587**, e2e **87/87**.

---
## P2 — Operations & observability

### P2.1 Deploy can report success on a failed migration — ✅ shipped

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

### P2.2 No error tracking, structured logs, or request ids — ✅ shipped

**Problem.** Zero Sentry/OTel/pino; `console.*` in 44 files (73 calls);
`src/lib/with-error-handler.ts:16` logs with no method/path/user/id and returns
a 500 with no correlation id; `src/proxy.ts` forwards only `x-pathname`.

**Fix.** Add Sentry (or OTel) + a leveled JSON logger; mint an `x-request-id` in
`proxy.ts`, echo it in error responses and logs; include user/route context.

**Verify.** Unit: logger emits JSON with requestId; error handler includes it.
Manual: an induced 500 is visible in the tracker with the same id as the client
response.

### P2.3 Health check is liveness-only — ✅ shipped

**Problem.** `src/app/api/health/route.ts:8-10` returns `{ ok: true }` with no
DB/Redis probe, yet every Docker healthcheck points at it.

**Fix.** Add `/api/ready` (`SELECT 1` + Redis `PING`, short timeout) and point
healthchecks there; keep `/api/health` as liveness.

**Verify.** Stop Postgres → `/api/ready` 503, `/api/health` 200.

### P2.4 E2E never runs in CI — ✅ shipped

**Problem.** `ci.yml` runs typecheck/lint/format/unit/build/security — no
Playwright job; `ci:test` exists but is never invoked. Regressions in roles,
auth, money flows, and moderator/activation (S1–S45) ship unseen. Separately,
the suite is flaky-prone: `networkidle` ×77 and fixed sleeps.

**Fix.** Add an E2E job with a Postgres service + `pnpm build` + `pnpm test:e2e`
(seed is handled by `playwright.config.ts`). Replace `networkidle` with web-first
assertions (`expect(locator).toBeVisible()`, `waitForResponse`) and remove fixed
sleeps; consider `fullyParallel` for speed once stable.

**Verify.** CI red on a deliberately broken flow; suite remains green and
faster.

### P2.5 Cleanup cron is incomplete; upload sweep is stuck in dry-run — ✅ shipped

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

### P2.6 Docs and env drift — ✅ shipped

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

### ✅ P3 shipped (2026-09-27)

| Item | Was | Shipped |
|------|-----|---------|
| Analytics scans all orders by default | `orders/analytics/route.ts` — no default window despite the "last 30 days" comment | Defaults to a 30-day window when `from`/`to` are absent or invalid, so the scan and the `ordersByDay` series are both bounded. Explicit ranges still win. |
| Email list ships full HTML bodies | `email-logs/route.ts` selected `body`/`textBody` per row | List projection drops both; new `GET /api/email-logs/[id]` returns the full record, the detail dialog fetches it on open, and "Send manually" resolves the body before building the `mailto:`. |
| Bulk order creation scans all zone pricing | `orders/bulk/route.ts` computed `allZoneIds` then ignored it | `WHERE "fromZoneId" IN (allZoneIds)` — the lookup only ever matches an origin zone, so the matrix is no longer fully scanned. |
| Hot lists use OFFSET pagination | unbounded `?offset=` | `MAX_OFFSET` (100k) clamp in `parsePagination`. True keyset was rejected: `DataTable` is page-number + total based, so cursors would require redesigning it. The clamp bounds the worst case without hiding any realistic page. |
| No coverage tooling | no `@vitest/coverage-*` | `@vitest/coverage-v8` + a `coverage` block, a `pnpm test:coverage` script, a dedicated CI job, and global floors (statements 48 / branches 41 / functions 37 / lines 49) set just under the measured baseline (49.5 / 42.7 / 38.6 / 50.1). |
| No real-DB integration tests | every spec mocks `@/lib/db` | `src/lib/db/integration.spec.ts` — 8 opt-in tests (`INTEGRATION_DATABASE_URL`) proving the P1.1 unique indexes reject duplicates, the P1.2 ledger matches the journal, the advisory lock actually serialises two runners, and Asia/Dhaka is present in the image. Runs in a new CI `integration` job; skips cleanly when the variable is unset. |
| Dead hook/doc for a missing route | `use-team.ts` called `/api/team/[id]/pricing` (no such route) | Removed the unused `togglePricingPermission` mutation and its `CONTRIBUTING.md` line. |
| Stale generated file | `drizzle/postgres/schema.ts` predated 0002 and imported nothing | Deleted it and the equally stale `drizzle/postgres/relations.ts`; the app schema is `src/lib/db/schema.postgres/`. |
| Images unoptimized | `next.config.mjs` set `images.unoptimized` | Deferred, deliberately: nothing in the app uses `next/image` (uploads render through plain `<img>` in `image-zoom.tsx` / `image-upload.tsx`), so the flag was inert. Payload is handled at upload time (client-side downscale to `UPLOAD_MAX_DIMENSIONS` + a 5MB API cap). The config now documents this so the flag cannot be mistaken for an active choice. |

**Verify.** `pnpm ci:check` ✅ · unit **1595/1595** ✅ · coverage gate ✅
(49.48 / 42.73 / 38.58 / 50.12) · build ✅ · e2e **87/87** ✅ ·
`pnpm test:integration` **8/8** against a migrated database.

**Still open in P3 (product work, not hardening).** Converting uploads to
`next/image` with `remotePatterns`; keyset pagination if the DataTable ever
becomes an infinite-scroll feed; raising the coverage floors as tests land.

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
  equal the sum of its SETTLED ledger rows — assert it in tests. Since P0.8 they
  are `numeric(14,2)`, so the assertion is exact, not a float tolerance (S48).
- **Spec coverage**: 1496 unit + 78 e2e — keep new routes/branches covered
  (colocated `<resource>.spec.ts`; e2e `S<n>` serial, next is S49).

---

## Execution order

```
1. ✅ P0.1  Public PII + guessable ids            (security) — DONE
2. ✅ P0.2  Upload auth + public NID exposure     (security) — DONE
3. ✅ P0.3  Payout race + bulk ledger gap         (money) — DONE
4. ✅ P0.4  Money rounding + ledger signs + recon (money) — DONE
5. ✅ P0.5  Server-side 2FA / email verification  (authz) - DONE
6. ✅ P0.6  Rate-limit hardening                  (abuse) - DONE
7. ✅ P0.7  Signup off, log/token hygiene         (hygiene) - DONE
7b. ✅ P0.8 Money columns to numeric(14,2)     (money) — DONE
8. ✅ P1.1 TOCTOU constraints + transactions     (correctness) — DONE
9. ✅ P1.2  Migration runner + docs               (ops) — DONE
10. ✅ P1.3 Timezone                              (correctness) — DONE
11. ✅ P1.4 Atomic lifecycle + audit + history    (correctness) — DONE
12. ✅ P1.5 Email outbox                          (reliability) — DONE
13. ✅ P1.6 Constraints/indexes/counts            (data) — DONE
14. ✅ P2.1 Deploy safety                         (ops) — DONE
15. ✅ P2.2 Observability                         (ops) — DONE
16. ✅ P2.3 Readiness probe                       (ops) — DONE
17. ✅ P2.4 E2E in CI + de-flake                 (quality) — DONE
18. ✅ P2.5 Cron completeness                     (ops) — DONE
19. ✅ P2.6 Docs/env drift                        (DX) — DONE
20. ✅ P3.x Performance & data hygiene            (batched) - DONE
21. P4.x Product & DX                          (as capacity allows)
```

Each item verifies with `pnpm ci:check` → `pnpm test:unit:run` → `pnpm build`
→ `pnpm test:e2e` before moving on. P0 items additionally require an
integration test against a real Postgres where concurrency is involved.
