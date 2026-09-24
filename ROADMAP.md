# ROADMAP — Remaining Work

> Last updated: 2026-09-25. **Phases 1–4 and the first Phase-5 slices are complete and
> removed from this document** (full audit trail in git history — see "Recently
> Completed" entries in older commits).
>
> Current health: Build ✅ · Typecheck ✅ · Unit **1018/1018** ✅ · E2E **51/51** ✅ ·
> `pnpm ci:check` ✅ (606 files) · CI runs typecheck/lint/format/**security-audit**/build/e2e ·
> husky pre-commit (lint-staged) active · dependency tree has **0 high/critical advisories**.

---

## Work order

Sections are listed **in the order they will be worked on**:

| #   | Section                              | Priority    | Effort | Status |
|-----|--------------------------------------|-------------|--------|--------|
| 5.1 | Backend permission enforcement sweep | 🔴 High     | M      | ⏳     |
| 5.2 | User management (admin panel)        | 🔴 High     | M      | ⏳     |
| 5.3 | Change own email address             | 🟡 Medium   | S–M   | ⏳     |
| 5.4 | Portal modes — 3 deployable formats  | 🟡 Medium   | M      | ⏳     |
| 5.5 | Notification system                  | 🟡 Medium   | L      | ⏳     |
| 5.6 | Storage hygiene — periodic image cleaning | 🟡 Medium | M    | ⏳     |
| 5.7 | 1% Improvements (quick wins)         | —           | S      | ⏳     |
| 5.8 | Analytics & Reporting                | 🟡 Medium   | M      | ⏳     |
| 5.9 | Mobile Experience                    | 🟡 Medium   | M–L    | ⏳     |
| 5.10| API & Integrations                   | 🟢 Low      | M      | ⏳     |
| 5.11| Scalability                          | 🟢 Low      | M–L    | ⏳     |
| 6   | Backlog (deferred)                   | —           | —      | ⏳     |

**Already shipped (do not re-propose):** phases 1–4 (security S/L, correctness B,
maintainability Q, testing/CI/docs T — incl. Redis rate limiting S6, CSRF origin
checks S9, aria-labels Q7); Phase-5 security slice H1–H4 (CI audit gate + all
high/critical deps fixed, audit entity diffs, `ADMIN_IP_ALLOWLIST` IP whitelist,
2FA TOTP with recovery codes + optional require-toggle); FAQ page (`/faq`),
user documentation (`/help/{merchant,rider,admin}`), support ticket system
(`support_ticket` + API + UI in all roles); SOC 2 removed by decision.

---

## Current State

Functional B2B delivery platform (one instance + one database per customer, no multi-tenancy):

- Multi-role access (Super Admin, Warehouse Admin, Merchant, Rider)
- Order lifecycle: create → approve → pickup → warehouse → dispatch → deliver → COD → payout
- Zone-to-zone pricing matrix, delivery cities, warehouses, pickup locations
- Merchant balance & payout system, COD reconciliation, audit logs
- Merchant branding, analytics with charts, PWA, onboarding wizard, public tracking
- 2FA (TOTP) for admins, IP allowlist, audit diffs, support tickets, FAQ/help docs

---

## 5.1 Backend permission enforcement sweep — HIGH (first)

**Problem:** permission checks must never live only in the frontend (hidden buttons/
routes). Every API must re-verify session, role, and ownership server-side.

**Scope — check ALL of `src/app/api/**`:**

1. **Inventory**: enumerate every route file; for each, document: auth entry
   (`requireSession`), role gate, ownership/scoping rule, public-by-design (only
   `receiver-note`, health, auth, verify-email, uploads/nids are expected public —
   confirm the list).
2. **Fix gaps** found by the sweep: any handler missing `requireSession()`, any
   role check that exists only in the UI, any read/write missing owner/warehouse/
   merchant scoping (Neon has no RLS — server is the only line).
3. **Automated guard**: add a unit test that statically scans
   `src/app/api/**/route.ts` and fails if a handler file has no auth entry point
   (allow-list the known-public routes) — so future routes can't regress.
4. **Spec coverage**: every route keeps/gets a colocated spec asserting 401
   (unauthenticated) + 403 (wrong role) at minimum.
5. **Frontend/backend parity pass**: for each admin/role-gated UI action, confirm
   the endpoint behind it enforces the same rule (e.g. dialogs hidden client-side
   must still be rejected server-side).

Acceptance: guard test in `pnpm test:unit:run`; zero unauthenticated/unscoped
write endpoints; sweep result table (route → auth → scope → spec) appended here
when done.

---

## 5.2 User management (admin panel) — HIGH (second)

A **`/dashboard/users`** page (SUPER_ADMIN only) to manage all accounts:

| Capability | Implementation notes |
|---|---|
| List users | all roles: name, email, role, active/banned status, created; server-paginated DataTable (repo pattern) |
| **Change user password** | better-auth `admin()` plugin is already installed — use its `api.admin.setUserPassword` (no custom hashing); confirm password policy via existing validation |
| **Ban / unban user** | plugin's ban API — `user.banned/banReason/banExpires` columns already exist in our schema; banned users rejected at sign-in; ban requires a reason (+ optional duration) |
| Audit | `logAudit` every reset/ban/unban (`USER_PASSWORD_RESET`, `USER_BANNED`, `USER_UNBANNED`), entity `user` |
| Out of scope (note, don't build) | impersonation (plugin supports it — defer), role changes |

Deliverables: route(s) + validation + `use-users` hook + page + dialogs
(reset-password dialog, ban dialog with ConfirmDialog), nav entry, colocated
spec (401/403/validation/happy + audit assertions), e2e (admin resets password →
login with new password; admin bans → banned login rejected).

---

## 5.3 Change own email address — MEDIUM

Users change their **login email** from account settings (all roles):

- Flow: current password (or 2FA code for enrolled admins) → new email →
  **verification link sent to the NEW address** (mailer exists) → on confirm,
  `user.email` updated (unique index — handle duplicate with a clear 409 message)
- Reject while a change is pending; allow resend; token expiry via Better Auth
  verification table (already in schema)
- Better Auth has `changeEmail`/updateEmail support — use the library flow where
  possible rather than hand-rolling tokens
- **Scope decision:** only the account (`user.email`) changes — the merchant's
  business email (`merchant.email`, used for display/receipts) stays admin-managed;
  note this in UI copy ("this changes your login email")
- Specs: request → token created/mail sent (mailer mocked) → confirm → email
  changed; duplicate-email 409; wrong-password 400; e2e happy path with mailer
  disabled fallback? (verify how e2e handles verification tokens — reuse the
  existing verify-email e2e technique)

---

## 5.4 Portal modes — 3 deployable formats — MEDIUM

One codebase, **three deployment shapes, selected by env var at runtime (no rebuild)**:

| `PORTAL_MODE` | Portals served | Intended deployment |
|---|---|---|
| `admin` | Dashboard (Super Admin) + Warehouse | internal ops instance |
| `public` | Merchant + Rider | **publicly accessible** customer-facing instance (public = the merchant portal renamed — it will be open to the internet for merchant self-onboarding) |
| `all` *(default)* | everything | single-instance / dev |

**Implementation notes:**

- Server-only env (validated in `src/lib/env.ts`, documented in `docs/ENV.md` +
  `.env.example`) — must NOT be `NEXT_PUBLIC` (deployment-time choice, same
  reasoning as `ALLOWED_ROLE`).
- Enforcement points:
  1. `src/proxy.ts` — pages of disabled portals → 404 at the edge (and their
     nav never renders)
  2. **Sign-in gate** — post-auth, roles outside the mode are rejected with a
     clear message (otherwise their sessions could still call shared APIs)
  3. Nav/shell — filter role nav from the mode so client bundles of a
     `public` instance never link to disabled areas
- Naming: mode `public` ≠ role name — it maps to roles `MERCHANT` + `RIDER`;
  keep the env value `public` (the customer portals are the public-facing side).
- Shared surface stays shared: `/login`, `/register`, `/track`, `/faq`, `/help`,
  public APIs (zone pricing, cities) work in all modes.
- Relationship to existing `ALLOWED_ROLE` (single-role containers, multi-instance
  Docker): `PORTAL_MODE` selects a *group*; `ALLOWED_ROLE` (if set) still wins
  for single-role containers — document precedence: `ALLOWED_ROLE` > `PORTAL_MODE`.
- Tests: unit for the mode→roles mapping; proxy gating spec; e2e runs in `all`
  mode (default) — plus a unit/e2e assertion that `PORTAL_MODE=public` rejects
  an admin sign-in (use env override in a targeted test if feasible).

---

## 5.5 Notification system — MEDIUM (largest item)

In-app notifications for state changes (announcements are broadcast — this is
**per-user, per-event**):

**V1 (in-app only):**

| Piece | Design |
|---|---|
| Table | `notification`: id, userId FK, type (enum), title, body, link, readAt nullable, createdAt — new `schema.postgres` module |
| Fan-out | written **inside the same transaction** as the triggering change (order transitions → merchant/rider; payout approve/paid → merchant; support reply → ticket owner; merchant approve → merchant; user-mgmt actions in 5.2 → target user). Central helper `src/lib/notify.ts` mirroring `audit.ts` (never throws, one entry point) |
| API | `GET /api/notifications` (own, paginated + unread count), `PATCH /api/notifications/[id]` (mark read), `PATCH /api/notifications/read-all` |
| UI | bell in all four shells (`dashboard-shell`, `merchant-shell`, `warehouse-shell`, `rider-shell`) with unread badge (poll/`useNotifications` SWR hook, refresh-on-focus), dropdown or page `/{role}/notifications` (pick dropdown + full page if cheap), `data-testid`s |
| Delivery | insert-only, no background queue in v1 (same-instance); note queue/Redis as follow-up in 5.11 |

**V2 (later, mark in-scope-but-deferred):** email channel for critical types
(reuse `mailer.ts` + `MAIL_DISABLED`), per-user preferences.

Acceptance: unit tests for fan-out helper (event → expected recipients) + API
specs; e2e (merchant gets order-status notification → marks read).

---

## 5.6 Storage hygiene — periodic image cleaning — MEDIUM

Periodically find and delete **orphaned uploads** (files whose referencing row was
deleted, or uploads from forms the user abandoned).

**Design (DB-driven sweep):**

| Piece | Design |
|---|---|
| Referenced set | Scan known image columns → normalize stored URLs to provider-relative keys: `user.image`, `merchant.logoUrl`, `merchant.nid{Front,Back,Selfie}Image`, `rider.nid*`, `rider_applications.nid*`, `order.deliveryProofRef`, `order.pickupProofRefs[]`, (any future image column added to this list) |
| Storage listing | Add `listFiles()` + `deleteFile(key)` to `src/lib/storage/` for all 3 providers: local = `fs.readdir`/`unlink`, R2 = `ListObjectsV2`/`DeleteObject`, Supabase = `.list()`/`.remove()` (today only `saveFile` exists — small S/M addition) |
| Orphan rule | file **not in referenced set** AND **older than grace period** — grace period is mandatory: `ImageUpload` uploads immediately on file select, *before* the form submits, so fresh files are often not yet referenced. Env: `UPLOAD_SWEEP_MIN_AGE_HOURS` (default 48) |
| Trigger | new `/api/cron/cleanup-uploads` endpoint authenticated by `CRON_SECRET` (same pattern as the 3 existing cleanup jobs); scheduled where the others are: `pg_cron` (local), cron container (cluster compose), Vercel cron. Response: `{ scanned, orphans, deleted, bytesFreed }`; `?dryRun=1` supported |
| Safety rails | age check per file; re-check referenced-set right before each delete (no stale snapshot); log every deletion; never fail the whole job on one file error |

Acceptance: unit tests for URL→key normalization + orphan decision; provider
specs for `listFiles`/`deleteFile` (local fs); cron endpoint spec (401 without
secret, dry-run deletes nothing); run `dryRun` for a week before enabling deletes.

---

## 5.7 1% Improvements (Quick Wins)

1. Subscription plan / pricing display on merchant dashboard
2. Pricing tiers on the landing page
3. Help center polish (link FAQ from `/help`, deep links)

---

## 5.8 Analytics & Reporting (Medium)

| Task | Description | Effort |
|------|-------------|--------|
| Merchant comparison | Compare performance across merchants (admin) | S |
| PDF/Excel export | Export reports as PDF or Excel | M |
| Scheduled reports | Email weekly/monthly reports to merchants | M |
| Rider performance | Delivery success rate, avg time per rider | S |

---

## 5.9 Mobile Experience (Medium)

| Task | Description | Effort |
|------|-------------|--------|
| PWA improvements | Better offline support, push notifications (pairs with 5.5) | M |
| Mobile-optimized forms | Simplified order creation for mobile | S |
| Camera integration | Better photo capture for delivery proof | M |
| GPS tracking | Real-time rider location tracking | L |

---

## 5.10 API & Integrations (Low)

| Task | Description | Effort |
|------|-------------|--------|
| Accounting integration | Export to Tally/QuickBooks | M |
| SMS gateway | Local SMS providers (order/receiver notifications) | S |
| WhatsApp notifications | Delivery updates via WhatsApp | M |

---

## 5.11 Scalability (Low)

| Task | Description | Effort |
|------|-------------|--------|
| Caching layer | Redis for hot data (rate limiting already uses Redis) | S |
| CDN for static assets | Serve static files from CDN | S |
| Background jobs | Queue for email, reports, notifications | M |
| Horizontal scaling | Multiple app instances (Redis rate limiter already shared) | L |
| Database read replicas | Promote the existing `dbRead` split | M |
| Database optimization | Remaining query consolidation | M |

---

## Phase 6 — Backlog (deferred)

| Task | Description | Effort | Notes |
|------|-------------|--------|-------|
| API documentation | OpenAPI/Swagger for public API | M | Needs a stable public API surface first |
| Video tutorials | Setup guides, feature walkthroughs | L | Recorded once product flow stops churning |
| Status page | Public status page for uptime | S | Meaningful once there's production traffic |

---

## Guardrails — verified-clean areas (don't regress these)

- **Uploads**: content-type/size/folder allowlists + traversal defense (`uploads/route.ts`, `uploads/[...path]/route.ts`)
- **Order state machine**: every transition goes through `applyOrderTransition` (or the bulk runner) with per-transition `authorize`, transaction + `.for("update")` row lock
- **IDOR**: `orders/[id]`, `payouts`, `merchants/[id]/*`, `riders/[id]/active`, `warehouses/[id]`, `pickup-locations/[id]`, `support/[id]` all server-side scoped
- **Admin surface**: write sites gated to SUPER_ADMIN (or role-appropriate) — 5.1 makes this a *tested invariant*, not a convention
- **Public tracking**: phone fields masked, no phone-based lookup
- **No `dangerouslySetInnerHTML`** anywhere in `src`
- **Spec coverage**: 1018 tests — keep new routes/branches covered (colocated `<resource>.spec.ts`)
- **Git history**: no secrets ever committed; sensitive env files gitignored

---

## Execution order

```
1. 5.1 Permission sweep        guard test + fixes + specs           [NOW]
2. 5.2 User management         password reset + ban/unban           [NEXT]
3. 5.3 Change own email        verification-link flow
4. 5.4 Portal modes            env-driven 3 deployable formats (admin|public|all)
5. 5.5 Notification system     in-app v1 (email v2 later)
6. 5.6 Storage hygiene         periodic orphan-image sweep (dry-run first)
7. 5.7 Quick wins              anytime
8. 5.8–5.11                    medium/low, opportunistic
9. Phase 6 Backlog             only when their readiness notes match
```

Each item verifies with `pnpm ci:check` · `pnpm test:unit:run` · `pnpm build` ·
`pnpm test:e2e` before moving to the next.
