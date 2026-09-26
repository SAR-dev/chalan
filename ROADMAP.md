# ROADMAP — Remaining Work

> Last updated: 2026-09-26. **Completed Phase-5 slices are removed from this
> document** (full audit trail in git history — see "Already shipped" below).
>
> Current health: Build ✅ · Typecheck ✅ · Unit **1285/1285** ✅ · E2E **59/59** ✅ ·
> `pnpm ci:check` ✅ (649 files) · CI runs typecheck/lint/format/**security-audit**/build ·
> husky pre-commit (lint-staged) active · dependency tree has **0 high/critical advisories** ·
> **route-auth-guard** test enforces server-side auth on all API routes.

---

## Work order

Sections are listed **in the order they will be worked on**:

| #   | Section                          | Priority  | Effort | Status |
|-----|----------------------------------|-----------|--------|--------|
| 5.1 | Merchant branding revamp        | 🟡 Medium | M      | ⏳ Next |
| 5.2 | Merchant moderator accounts     | 🟡 Medium | M      | ⏳ after 5.1 |
| 5.3 | Notification system             | 🟡 Medium | L      | ⏳ Later (deferred by choice) |
| 5.4 | 1% Improvements (quick wins)    | —         | S      | ⏳      |
| 5.5 | Analytics & Reporting           | 🟡 Medium | M      | ⏳      |
| 5.6 | Mobile Experience               | 🟡 Medium | M–L    | ⏳      |
| 5.7 | API & Integrations              | 🟢 Low    | M      | ⏳      |
| 5.8 | Scalability                     | 🟢 Low    | M–L    | ⏳      |
| 6   | Backlog (deferred)              | —         | —      | ⏳      |

**Already shipped (do not re-propose):** phases 1–4 (security, correctness,
maintainability, testing/CI/docs — incl. Redis rate limiting, CSRF checks,
route-auth-guard test); Phase-5: H1–H4 security slice (CI audit gate + all
high/critical deps fixed, audit entity diffs, `ADMIN_IP_ALLOWLIST`, 2FA TOTP +
QR enrollment + recovery codes + `ADMIN_2FA_REQUIRED` env toggle + merchant
opt-in); user management (password reset/ban/unban + S38), change own email
(S39), portal modes (`admin|public|all`), storage hygiene (orphan-upload sweep),
FAQ (`/faq`), user docs (`/help/{merchant,rider,admin}`), support tickets,
landing refresh, auto-CSV DataTable export, fixed refresh button, order-details
right drawer, Supabase **storage** removed (local + R2 only); SOC 2 removed by
decision.

---

## Current State

Functional B2B delivery platform (one instance + one database per customer, no multi-tenancy):

- Multi-role access (Super Admin, Warehouse Admin, Merchant, Rider)
- Order lifecycle: create → approve → pickup → warehouse → dispatch → deliver → COD → payout
- Zone-to-zone pricing matrix, delivery cities, warehouses, pickup locations
- Merchant balance & payout system, COD settlement, audit logs
- Merchant branding (sidebar only — see 5.1), analytics with charts, PWA, onboarding wizard, public tracking
- 2FA (TOTP) for admins + merchant opt-in, IP allowlist, audit diffs, support tickets, FAQ/help docs
- CSV bulk import (page + parcel-card preview), portal modes, storage sweep

---

## 5.1 Merchant branding revamp — MEDIUM (next)

**Problem:** today `brandColor` only recolors `--sidebar-primary` in the sidebar/mobile header, the logo lives only in the nav, and `hidePlatformBranding` only hides nav marks — merchants can't see their brand anywhere it matters, so the feature feels useless.

**Scope (impact order):**
1. **Portal-wide theme:** the merchant shell injects CSS vars from `brandColor`
   (`--primary`, `--sidebar-primary`, `--ring`) so buttons, links, badges and
   tabs take the brand color. Contrast-safe foreground via a pure
   `src/lib/brand-color.ts` (relative luminance → white/black
   `--primary-foreground`; invalid hex falls back to the theme default) with unit tests.
2. **Per-order surfaces (multi-merchant safe):** the public tracking page
   `/track/[code]` shows the order's merchant logo + a brand-accent header
   ("Fulfilled by {merchant}"); `hidePlatformBranding` also hides the platform
   footer/mark there — branding follows the ORDER's merchant, not the instance.
3. **Emails:** merchant-scoped transactional templates embed `logoUrl` + a brand
   accent; `hidePlatformBranding` drops the platform footer line.
4. **Settings feedback:** a live preview card (logo + color + sample
   button/chip), an explicit "Where this appears: sidebar · order tracking page ·
   customer emails" list, existing presets kept, and a WCAG contrast warning
   (warn, never block) when the color can't carry readable text.

**Non-goals:** landing page and login page (platform-level, shared across
merchants on `all` instances), PWA icons, per-warehouse branding.

**Tests:** brand-color unit tests (luminance → fg, invalid hex), mail-template
rendering with/without logo, e2e: settings preview visible; tracking page shows
the merchant logo for the seeded demo brand.

**Open question:** apply the same theme injection to rider/warehouse portals?
(Recommended: no — merchant brand belongs on merchant-represented surfaces only.)

---

## 5.2 Merchant moderator accounts — MEDIUM

Merchant owners create and manage staff logins ("moderators") for their own
merchant; admins only cap how many each merchant may open. Moderator
permissions are **based on the merchant's sidebar nav menus** — the owner picks
which sections a moderator can use.

**Model:**
- A moderator is a merchant-portal user: `profile.role = MERCHANT` +
  `profile.merchantId` + **new `profile.isModerator` (default false)** —
  the owner stays false.
- **Permissions = nav grants:** new `profile.moderatorPermissions` (jsonb
  array of nav hrefs from `MERCHANT_SIDEBAR`, e.g.
  `["/merchant/orders", "/merchant/support"]`). The owner has full access
  (field unused); Account is always self-service; Settings and the
  moderator-management entry are not grantable.
- **Enforcement (three layers):**
  1. **Nav** — the merchant sidebar renders only granted items for a moderator.
  2. **Shell route guard** — `merchant-shell` redirects a moderator who opens
     a non-granted route to their first granted page.
  3. **Hard server checks on a small explicit list** of sensitive endpoints
     (payout request, branding/settings PATCH, moderator management, merchant
     profile PATCH) → 403 without the grant (`requireNavPermission`). All
     other data APIs stay merchant-scoped — a moderator is a legitimate member
     of that merchant, so platform security is unchanged; this is
     merchant-defined scoping, not an authz boundary.
- Quota: **new `merchant.maxModerators` (int, default 3** — usable out of the
  box), overridden per merchant (0–20) by SUPER_ADMIN on
  `/dashboard/merchants/[id]` (audited `MODERATOR_QUOTA_CHANGED`).

**APIs (owner-only — admins only set the quota):**

| Route | Notes |
|---|---|
| `GET/POST /api/merchants/[id]/moderators` | List + create (name, email, password ≥8, `permissions: string[]` → credential user + profile). **403 when active count ≥ maxModerators** (message includes "2/3"). Audit `MODERATOR_CREATED` |
| `PATCH /api/merchants/[id]/moderators/[userId]` | Update permissions and/or activate/deactivate. Audit `MODERATOR_UPDATED` |

**Merchant UI:** a "Moderators" card on `/merchant/settings` — list with
granted-nav chips, create/edit dialog with **checkboxes mirroring the sidebar
nav** — all grantable items are **checked by default** (the owner
unchecks what the moderator should not access), deactivate button. Moderators appear as MERCHANT
users in admin user management (already shipped) for password resets/bans.

**Tests:** API specs (non-owner 403, quota 403 with count, permission updates,
create/deactivate + audit, sensitive-endpoint 403 without the grant); a
nav-filtering helper spec; e2e: admin sets quota → owner creates a moderator
with an Orders-only grant → moderator signs in → sees only granted nav →
creates an order → Finance route redirects away → owner edits grants or
deactivates. data-testid policy throughout.

---

## 5.3 Notification system — MEDIUM (largest item, deferred)

In-app notifications for state changes (announcements are broadcast — this is
**per-user, per-event**):

**V1 (in-app only):**

| Piece    | Design                                                                                                                                                                                                                                                                                                                            |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Table    | `notification`: id, userId FK, type (enum), title, body, link, readAt nullable, createdAt — new `schema.postgres` module                                                                                                                                          |
| Fan-out  | written **inside the same transaction** as the triggering change (order transitions → merchant/rider; payout approve/paid → merchant; support reply → ticket owner; merchant approve → merchant; user-mgmt actions → target user). Central helper `src/lib/notify.ts` mirroring `audit.ts` (never throws, one entry point)       |
| API      | `GET /api/notifications` (own, paginated + unread count), `PATCH /api/notifications/[id]` (mark read), `PATCH /api/notifications/read-all`                                                                                                                       |
| UI       | bell in all four shells with unread badge (poll/`useNotifications` SWR hook, refresh-on-focus), dropdown or page `/{role}/notifications`, `data-testid`s                                                                                                          |
| Delivery | insert-only, no background queue in v1 (same-instance); queue/Redis as follow-up in 5.8                                                                                                                                                                          |

**V2 (later, deferred):** email channel for critical types (reuse `mailer.ts` +
`MAIL_DISABLED`), per-user preferences.

Acceptance: unit tests for fan-out helper (event → expected recipients) + API
specs; e2e (merchant gets order-status notification → marks read).

---

## 5.4 1% Improvements (Quick Wins)

1. Subscription plan / pricing display on merchant dashboard
2. Pricing tiers on the landing page
3. Help center polish (link FAQ from `/help`, deep links)

---

## 5.5 Analytics & Reporting (Medium)

| Task                | Description                                  | Effort |
|---------------------|----------------------------------------------|--------|
| Merchant comparison | Compare performance across merchants (admin) | S      |
| PDF/Excel export    | Export reports as PDF or Excel               | M      |
| Scheduled reports   | Email weekly/monthly reports to merchants    | M      |
| Rider performance   | Delivery success rate, avg time per rider    | S      |

---

## 5.6 Mobile Experience (Medium)

| Task                   | Description                                                 | Effort |
|------------------------|-------------------------------------------------------------|--------|
| PWA improvements       | Better offline support, push notifications (pairs with 5.3) | M      |
| Mobile-optimized forms | Simplified order creation for mobile                        | S      |
| Camera integration     | Better photo capture for delivery proof                     | M      |
| GPS tracking           | Real-time rider location tracking                           | L      |

---

## 5.7 API & Integrations (Low)

| Task                   | Description                                        | Effort |
|------------------------|----------------------------------------------------|--------|
| Accounting integration | Export to Tally/QuickBooks                         | M      |
| SMS gateway            | Local SMS providers (order/receiver notifications) | S      |
| WhatsApp notifications | Delivery updates via WhatsApp                      | M      |

---

## 5.8 Scalability (Low)

| Task                   | Description                                                | Effort |
|------------------------|------------------------------------------------------------|--------|
| Caching layer          | Redis for hot data (rate limiting already uses Redis)      | S      |
| CDN for static assets  | Serve static files from CDN                               | S      |
| Background jobs        | Queue for email, reports, notifications                   | M      |
| Horizontal scaling     | Multiple app instances (Redis rate limiter already shared) | L      |
| Database read replicas | Promote the existing `dbRead` split                       | M      |
| Database optimization  | Remaining query consolidation                             | M      |

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
- **Admin surface**: write sites gated to SUPER_ADMIN (or role-appropriate) — the route-auth-guard test makes this a *tested invariant*, not a convention
- **Public tracking**: phone fields masked, no phone-based lookup
- **No `dangerouslySetInnerHTML`** anywhere in `src`
- **Spec coverage**: 1285 tests — keep new routes/branches covered (colocated `<resource>.spec.ts`)
- **Git history**: no secrets ever committed; sensitive env files gitignored

---

## Execution order

```
1. 5.1 Branding revamp        portal theme + tracking/emails       [NEXT]
2. 5.2 Moderator accounts     nav-grant staff logins + quota       after 5.1
3. 5.3 Notification system    in-app v1 (email v2 later)           LATER (deferred by choice)
4. 5.4 Quick wins              anytime
5. 5.5–5.8                    medium/low, opportunistic
6. Phase 6 Backlog            only when their readiness notes match
```

Each item verifies with `pnpm ci:check` · `pnpm test:unit:run` · `pnpm build` ·
`pnpm test:e2e` before moving to the next.


