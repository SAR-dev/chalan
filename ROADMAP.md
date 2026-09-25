# ROADMAP — Remaining Work

> Last updated: 2026-09-25. **Phases 1–4 and the first Phase-5 slices are complete and
> removed from this document** (full audit trail in git history — see "Recently
> Completed" entries in older commits).
>
> Current health: Build ✅ · Typecheck ✅ · Unit **1154/1154** ✅ · E2E **54/54** ✅ ·
> `pnpm ci:check` ✅ (627 files) · CI runs typecheck/lint/format/**security-audit**/build ·
> husky pre-commit (lint-staged) active · dependency tree has **0 high/critical advisories** ·
> **route-auth-guard** test enforces server-side auth on all 104 API routes.

---

## Work order

Sections are listed **in the order they will be worked on**:

| #    | Section                                   | Priority  | Effort | Status |
|------|-------------------------------------------|-----------|--------|--------|
| 5.1  | Backend permission enforcement sweep      | 🔴 High   | M      | ✅      |
| 5.2  | User management (admin panel)             | 🔴 High   | M      | ✅      |
| 5.3  | Change own email address                  | 🟡 Medium | S–M    | ✅      |
| 5.4  | Portal modes — 3 deployable formats       | 🟡 Medium | M      | ✅      |
| 5.5  | Notification system                       | 🟡 Medium | L      | ⏳ Next |
| 5.6  | Storage hygiene — periodic image cleaning | 🟡 Medium | M      | ⏳      |
| 5.7  | 1% Improvements (quick wins)              | —         | S      | ⏳      |
| 5.8  | Analytics & Reporting                     | 🟡 Medium | M      | ⏳      |
| 5.9  | Mobile Experience                         | 🟡 Medium | M–L    | ⏳      |
| 5.10 | API & Integrations                        | 🟢 Low    | M      | ⏳      |
| 5.11 | Scalability                               | 🟢 Low    | M–L    | ⏳      |
| 6    | Backlog (deferred)                        | —         | —      | ⏳      |

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

## 5.1 Backend permission enforcement sweep — HIGH ✅

**Done.** Automated guard: `src/app/api/route-auth-guard.spec.ts` statically scans all
**104 route files** — each must contain `requireSession(` / `auth.api.getSession(` /
cron-secret auth / a transitions delegate, or sit in the verified 6-route public
allowlist (auth catch-all, verify-email, health, resend-verification, receiver-note,
warehouses/public). Guard fails on new unauthenticated routes and on stale allowlist
entries.

- **Gaps fixed (4):** `GET /api/announcements` (was any-role → SUPER_ADMIN only),
  `GET /api/riders/[id]` (cross-hub WAREHOUSE_ADMIN → forbidden),
  `PATCH orders/:id/receive` + `cancel`/bulk (cross-hub → warehouse scope guard,
  `warehouseOrderInScope()`)
- **Specs:** +80 cases; uncovered routes 15 → 3 (all public-by-design); parity table
  for all 104 routes verified (route → auth → scope → spec)

---

## 5.2 User management (admin panel) — HIGH ✅

**Done.** `GET /api/admin/users` (paginated, `?q=`/`?role=`/`?sort=`) +
`PATCH /api/admin/users/[id]/{password,ban,unban}` — SUPER_ADMIN-gated, better-auth
admin APIs (`setUserPassword`/`banUser`/`unbanUser`), audited (`USER_PASSWORD_RESET`/
`USER_BANNED`/`USER_UNBANNED`, password never logged), self-ban blocked.
UI: `/dashboard/users` DataTable + reset-password & ban dialogs + nav entry +
`USER_STATUS_*` badges + 11 testids. Tests: 22 unit + **S38 e2e** (reset→login→restore,
ban→sign-in rejected→unban — full state restoration in `try/finally`).
Fixed en-route: better-auth admin permissions needed `user.role='admin'` on seeded
SUPER_ADMIN rows (seed helper + DB backfill).

---

## 5.3 Change own email address — MEDIUM ✅

**Done.** better-auth `user.changeEmail` flow: `authClient.changeEmail({newEmail})` →
JWT verification link emailed to the **NEW** address (`changeEmailTemplate`) →
`/api/auth/verify-email` confirms and rewrites the session. App's static verify-email
route now delegates dotted (change-email) tokens to `auth.handler` (routing conflict
fixed + spec). UI: Email card on the Profile tab (current email, new input,
`email-change-*` testids, no-op guard, expired-link toast). `merchant.email` untouched.
Tests: +9 unit (template + route delegation) + **S39 e2e** (throwaway merchant,
JWT re-signed from `BETTER_AUTH_SECRET` for confirm, asserts `user.email` changed /
`merchant.email` unchanged / old sign-in rejected).
Known limitation: duplicate new email returns success silently (better-auth
anti-enumeration — no 409 oracle); self-service change is intentionally unaudited.

---

## 5.4 Portal modes — 3 deployable formats — MEDIUM ✅

**Done.** `PORTAL_MODE=admin|public|all` (server-only env, default `all`, validated in
`env.ts`, documented in ENV.md + .env.example):

| Mode | Portals | Roles |
|---|---|---|
| `admin` | dashboard + warehouse | SUPER_ADMIN, WAREHOUSE_ADMIN |
| `public` | merchant + rider (publicly accessible) | MERCHANT, RIDER |
| `all` | everything (dev/e2e default) | all four |

Enforcement: **edge** `portalModeGuard` in proxy (disabled portal pages → 404,
segment-aware, CSP untouched) · **API** `requireSession()` returns null for
disallowed roles → 401 · **client** `portalAllowed` from `/api/users/me` →
sign-in/bootstrap rejected with "This portal is not available on this deployment."
Nav filtering is automatic (404'd shells never render). Precedence `ALLOWED_ROLE` >
`PORTAL_MODE` (both must pass). Tests: 23 new (mode matrix, page filter, gate,
env validation); full e2e green in default mode.

---

## 5.5 Notification system — MEDIUM (largest item)

In-app notifications for state changes (announcements are broadcast — this is
**per-user, per-event**):

**V1 (in-app only):**

| Piece    | Design                                                                                                                                                                                                                                                                                                                            |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Table    | `notification`: id, userId FK, type (enum), title, body, link, readAt nullable, createdAt — new `schema.postgres` module                                                                                                                                                                                                          |
| Fan-out  | written **inside the same transaction** as the triggering change (order transitions → merchant/rider; payout approve/paid → merchant; support reply → ticket owner; merchant approve → merchant; user-mgmt actions in 5.2 → target user). Central helper `src/lib/notify.ts` mirroring `audit.ts` (never throws, one entry point) |
| API      | `GET /api/notifications` (own, paginated + unread count), `PATCH /api/notifications/[id]` (mark read), `PATCH /api/notifications/read-all`                                                                                                                                                                                        |
| UI       | bell in all four shells (`dashboard-shell`, `merchant-shell`, `warehouse-shell`, `rider-shell`) with unread badge (poll/`useNotifications` SWR hook, refresh-on-focus), dropdown or page `/{role}/notifications` (pick dropdown + full page if cheap), `data-testid`s                                                             |
| Delivery | insert-only, no background queue in v1 (same-instance); note queue/Redis as follow-up in 5.11                                                                                                                                                                                                                                     |

**V2 (later, mark in-scope-but-deferred):** email channel for critical types
(reuse `mailer.ts` + `MAIL_DISABLED`), per-user preferences.

Acceptance: unit tests for fan-out helper (event → expected recipients) + API
specs; e2e (merchant gets order-status notification → marks read).

---

## 5.6 Storage hygiene — periodic image cleaning — MEDIUM

Periodically find and delete **orphaned uploads** (files whose referencing row was
deleted, or uploads from forms the user abandoned).

**Design (DB-driven sweep):**

| Piece           | Design                                                                                                                                                                                                                                                                                                |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Referenced set  | Scan known image columns → normalize stored URLs to provider-relative keys: `user.image`, `merchant.logoUrl`, `merchant.nid{Front,Back,Selfie}Image`, `rider.nid*`, `rider_applications.nid*`, `order.deliveryProofRef`, `order.pickupProofRefs[]`, (any future image column added to this list)      |
| Storage listing | Add `listFiles()` + `deleteFile(key)` to `src/lib/storage/` for both providers: local = `fs.readdir`/`unlink`, R2 = `ListObjectsV2`/`DeleteObject`                                                             |
| Orphan rule     | file **not in referenced set** AND **older than grace period** — grace period is mandatory: `ImageUpload` uploads immediately on file select, *before* the form submits, so fresh files are often not yet referenced. Env: `UPLOAD_SWEEP_MIN_AGE_HOURS` (default 48)                                  |
| Trigger         | new `/api/cron/cleanup-uploads` endpoint authenticated by `CRON_SECRET` (same pattern as the 3 existing cleanup jobs); scheduled where the others are: `pg_cron` (local), cron container (cluster compose), Vercel cron. Response: `{ scanned, orphans, deleted, bytesFreed }`; `?dryRun=1` supported |
| Safety rails    | age check per file; re-check referenced-set right before each delete (no stale snapshot); log every deletion; never fail the whole job on one file error                                                                                                                                              |

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

| Task                | Description                                  | Effort |
|---------------------|----------------------------------------------|--------|
| Merchant comparison | Compare performance across merchants (admin) | S      |
| PDF/Excel export    | Export reports as PDF or Excel               | M      |
| Scheduled reports   | Email weekly/monthly reports to merchants    | M      |
| Rider performance   | Delivery success rate, avg time per rider    | S      |

---

## 5.9 Mobile Experience (Medium)

| Task                   | Description                                                 | Effort |
|------------------------|-------------------------------------------------------------|--------|
| PWA improvements       | Better offline support, push notifications (pairs with 5.5) | M      |
| Mobile-optimized forms | Simplified order creation for mobile                        | S      |
| Camera integration     | Better photo capture for delivery proof                     | M      |
| GPS tracking           | Real-time rider location tracking                           | L      |

---

## 5.10 API & Integrations (Low)

| Task                   | Description                                        | Effort |
|------------------------|----------------------------------------------------|--------|
| Accounting integration | Export to Tally/QuickBooks                         | M      |
| SMS gateway            | Local SMS providers (order/receiver notifications) | S      |
| WhatsApp notifications | Delivery updates via WhatsApp                      | M      |

---

## 5.11 Scalability (Low)

| Task                   | Description                                                | Effort |
|------------------------|------------------------------------------------------------|--------|
| Caching layer          | Redis for hot data (rate limiting already uses Redis)      | S      |
| CDN for static assets  | Serve static files from CDN                                | S      |
| Background jobs        | Queue for email, reports, notifications                    | M      |
| Horizontal scaling     | Multiple app instances (Redis rate limiter already shared) | L      |
| Database read replicas | Promote the existing `dbRead` split                        | M      |
| Database optimization  | Remaining query consolidation                              | M      |

---

## Phase 6 — Backlog (deferred)

| Task              | Description                        | Effort | Notes                                      |
|-------------------|------------------------------------|--------|--------------------------------------------|
| API documentation | OpenAPI/Swagger for public API     | M      | Needs a stable public API surface first    |
| Video tutorials   | Setup guides, feature walkthroughs | L      | Recorded once product flow stops churning  |
| Status page       | Public status page for uptime      | S      | Meaningful once there's production traffic |

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
1. 5.1 Permission sweep        guard test + fixes + specs           ✅ DONE
2. 5.2 User management         password reset + ban/unban           ✅ DONE
3. 5.3 Change own email        verification-link flow               ✅ DONE
4. 5.4 Portal modes            env-driven 3 deployable formats      ✅ DONE
5. 5.5 Notification system     in-app v1 (email v2 later)           [NEXT]
6. 5.6 Storage hygiene         periodic orphan-image sweep (dry-run first)
7. 5.7 Quick wins              anytime
8. 5.8–5.11                    medium/low, opportunistic
9. Phase 6 Backlog             only when their readiness notes match
```

Each item verifies with `pnpm ci:check` · `pnpm test:unit:run` · `pnpm build` ·
`pnpm test:e2e` before moving to the next.
