# ROADMAP — Product & Growth

> Forward-looking only. Completed work is tracked in git history, not here.
>
> Current health: `pnpm ci:check` ✅ · Unit **1605/1605** ✅ · Build ✅ ·
> E2E **87/87** ✅ (21 spec files, S1–S54) · real-DB integration suite ✅ in CI ·
> coverage gate enforced (statements 48 / branches 41 / functions 37 / lines 49,
> measured 49.48 / 42.78 / 38.60 / 50.12) · dependency tree has
> **0 high/critical advisories** · route-auth-guard test enforces server-side
> auth on all API routes.
>
> Every change verifies with: `pnpm ci:check` → `pnpm test:unit:run` →
> `pnpm build` → `pnpm test:e2e`.

---

## P4.1 Notification system (deferred — design kept)

In-app notifications for state changes (per-user, per-event), fanned out **in the
same transaction** as the triggering change via a `src/lib/notify.ts` helper
mirroring `audit.ts`; bell + unread badge in all four shells; `GET
/api/notifications`, `PATCH /api/notifications/[id]`, `PATCH
/api/notifications/read-all`. Email channel in v2 (reuses the email outbox).

**Acceptance:** fan-out unit tests (event → recipients) + API specs + e2e
(merchant gets an order-status notification and marks it read).

## P4.2 Quick wins

Subscription/pricing display on the merchant dashboard; pricing tiers on the
landing page; help-center polish (FAQ deep links).

## P4.3 Growth backlog

| Area | Tasks |
|------|-------|
| Analytics & reporting | Merchant comparison, PDF/Excel export, scheduled reports, rider performance |
| Mobile | PWA/offline + push, mobile-optimized order form, camera capture, GPS tracking |
| API & integrations | Accounting export (Tally/QuickBooks), SMS gateway, WhatsApp updates |
| Scalability | Redis for hot data, CDN, background jobs, multi-instance, promote the `dbRead` split to real replicas, query consolidation |
| Phase 6 backlog | Public API docs (OpenAPI), video tutorials, status page |

## Carry-over (open, lower priority)

- **`next/image` for uploads** — deliberately deferred. Nothing uses it today
  (uploads render through plain `<img>` in `image-zoom.tsx` /
  `image-upload.tsx`), so `images.unoptimized` in `next.config.mjs` is inert and
  documented as such. Payload is handled at upload time (client downscale to
  `UPLOAD_MAX_DIMENSIONS` + a 5 MB API cap). Converting needs `remotePatterns`
  for R2.
- **Keyset pagination** — hot lists are bounded by a `MAX_OFFSET` (100k) clamp
  instead. Real keyset was rejected because `DataTable` is page-number + total
  based; revisit only if it becomes an infinite-scroll feed.
- **Raise the coverage floors** as tests land. They are a regression guard
  (48 / 41 / 37 / 49), not a target.

---

## Guardrails — verified-clean areas (don't regress these)

- **Uploads**: content-type/size/folder allowlists + traversal defense
  (`uploads/route.ts`, `uploads/[...path]/route.ts`), owner-or-admin read policy
  with `Cache-Control: private` for private folders, and Content-Length
  enforced *before* parsing.
- **Order state machine**: every transition goes through
  `applyOrderTransition`/the bulk runner with per-transition guards and a row
  lock (`src/features/orders/transitions.ts`).
- **IDOR**: ownership scoping verified in `orders/[id]`, `payouts`,
  `merchants/[id]/*`, `riders/[id]`, `warehouses/[id]`, `pickup-locations/[id]`,
  team, moderators, support.
- **Admin surface**: write sites gated to SUPER_ADMIN (or role-appropriate) —
  the route-auth-guard test makes this a *static* guarantee.
- **Public tracking**: only a secretless PII-free receiver note is writable, and
  it requires the per-order tracking token; reads by the sequential code stay
  allowed for the parcel-label UX.
- **Session policy**: `requireSession()` enforces banned users, admin 2FA
  enrolment and merchant email verification server-side — not just via browser
  redirects.
- **No `dangerouslySetInnerHTML`** anywhere; markdown rendered without
  `rehype-raw`; all `sql`` templates parameterized.
- **Secrets**: `.env*` gitignored; `validateEnv()` enforces a ≥32-char auth
  secret and production SMTP key; SMTP password AES-256-GCM encrypted; merchant
  verification tokens stored hashed; console logs carry no live tokens.
- **Money**: all money columns are `numeric(14,2)`; `merchant_balance` must
  always equal the sum of its SETTLED ledger rows (asserted in tests as an exact
  SQL `=`, not a float tolerance).
- **Logging**: `logger` (never `console.*`) on the request/error path, and
  `x-request-id` on every response for correlation.
- **Spec coverage**: 1605 unit + 87 e2e — keep new routes/branches covered
  (colocated `<resource>.spec.ts`; e2e `S<n>` serial, next is S55).
