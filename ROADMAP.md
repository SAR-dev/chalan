# ROADMAP — Making This Platform Ready for Selling

## Current State
The platform is a fully functional B2B delivery management system with:
- Multi-role access (Super Admin, Warehouse Admin, Merchant, Rider)
- Order lifecycle management (create → approve → pickup → deliver → COD → payout)
- Zone-to-zone pricing matrix
- COD tracking & reconciliation
- Merchant balance & payout system
- Rider fleet management
- Warehouse operations (intake, dispatch, exceptions)
- Audit logging
- PWA support
- Self-service onboarding with 3-step wizard
- Merchant branding (custom logo, colors, hide platform branding)
- Analytics dashboard with charts (merchant + admin)

**Architecture:** Each customer gets a separate instance with its own database. No multi-tenancy required.

---

## Phase 1: Critical Security Fixes (Priority: Critical)

**Goal:** Fix all critical and high-severity security issues before selling.

| Task                                                 | Description                                                                                                                                                          | Effort | Status |
|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|--------|
| Remove `NEXT_PUBLIC_SUPERADMIN_PASSWORD` from `.env` | Exposed in client bundle via `NEXT_PUBLIC_*` — visible in browser DevTools                                                                                           | S      | ⏳      |
| Verify `.env.vercel` never committed to git          | Contains Neon DB creds, R2 keys, auth secret, cron secret                                                                                                            | S      | ⏳      |
| Clean debug `console.log` in dialogs                 | Remove `[B8]` logs from `out-for-delivery-dialog.tsx` (9 statements), `[B7]` from `warehouse-dispatch-dialog.tsx` (2 statements)                                     | S      | ⏳      |
| Add Zod schemas for NID endpoints                    | `merchants/[id]/nid/route.ts` and `merchants/[id]/nid/verify/route.ts` use raw `req.json()` with no schema enforcement — create `nidSubmitSchema`, `nidReviewSchema` | S      | ⏳      |
| Fix merchant PATCH to use `parseBody()`              | `merchants/[id]/route.ts:88` uses raw `req.json()` — bypasses graceful error handling                                                                                | S      | ⏳      |
| Fix N+1 query in bulk approve                        | `orders/bulk/approve/route.ts:35-43` issues one DB query per order — pre-fetch merchant weight limits in batch                                                       | S      | ⏳      |
| Fix `tx: any` in transitions.ts                      | `transitions.ts:472` — type safety hole in critical order transition logic, use proper Drizzle `Transaction` type                                                    | S      | ⏳      |
| Fix rider page `as any` casts                        | `rider/page.tsx`, `rider/pickup/page.tsx`, `rider/delivery/page.tsx` access fields not in `Order` type via `as any` — extend type with joined fields                 | S      | ⏳      |
| Tighten CSP for production                           | `next.config.mjs:41` allows `unsafe-inline` and `unsafe-eval` — remove `unsafe-eval`, use nonce-based scripts                                                        | M      | ⏳      |

---

## Phase 2: Code Quality (Priority: High)

**Goal:** Improve code maintainability, error handling, and test coverage.

| Task                                        | Description                                                                                                                                                                                                                                                                                         | Effort | Status |
|---------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|--------|
| Extract `InfoRow` shared component          | Deduplicate from 8 dialog files (`out-for-delivery-dialog.tsx`, `warehouse-dispatch-dialog.tsx`, `warehouse-receive-dialog.tsx`, `pickup-confirm-dialog.tsx`, `cancel-order-dialog.tsx`, `failed-delivery-dialog.tsx`, `assign-pickup-rider-dialog.tsx`, `delivery-attempt-dialog.tsx`)             | S      | ⏳      |
| Add try/catch to API route handlers         | ~95% of routes have no top-level error handling — unhandled exceptions return generic 500s                                                                                                                                                                                                          | M      | ⏳      |
| Add missing DB indexes                      | `delivery_city.zoneId`, `delivery_city.warehouseId` — no indexes despite being joined in bulk order creation                                                                                                                                                                                        | S      | ⏳      |
| Parallelize `logAudit` in bulk loops        | 16 locations call `await logAudit()` sequentially in for loops — use `Promise.all()` since `logAudit` swallows errors                                                                                                                                                                               | S      | ⏳      |
| Create Drizzle enum type helper             | 7 `as any` casts for `inArray()` enum params across API routes — fix with a type utility                                                                                                                                                                                                            | S      | ⏳      |
| Add error boundaries to route segments      | Add `error.tsx` to `src/app/(onboarding)/`, `src/app/login/`, `src/app/register/`, `src/app/forgot-password/`                                                                                                                                                                                       | S      | ⏳      |
| Add missing API route specs                 | 17+ routes without spec files: `orders/analytics`, `orders/counts`, `orders/payable`, `orders/bulk/*`, `merchants/bulk/*`, `merchants/me/onboarding`, `merchants/[id]/nid/*`, `payouts/[id]/*`, `admin/mail-config`, `admin/delivery-*`, `zone-pricing/*`, `warehouses/public`, `email-logs/bulk/*` | M      | ⏳      |
| Add missing shared component tests          | `status-badge.tsx`, `stat-card-list.tsx`, `form-dialog.tsx`, `confirm-dialog.tsx`, `quick-filters.tsx`, `page-header.tsx`, `date-range-picker.tsx`, `image-upload.tsx`                                                                                                                              | M      | ⏳      |
| Add missing hook tests                      | `use-table-filters.ts`, `use-data-error.ts`                                                                                                                                                                                                                                                         | S      | ⏳      |
| Remove `ignoreBuildErrors` from next.config | `next.config.mjs:21` — type errors silently ignored during build                                                                                                                                                                                                                                    | S      | ⏳      |

---

## Phase 3: Analytics & Reporting (Priority: Medium) 🔄 IN PROGRESS

**Goal:** Give merchants insights into their business.

| Task                      | Description                                                                                        | Effort | Status |
|---------------------------|----------------------------------------------------------------------------------------------------|--------|--------|
| Revenue dashboard         | Daily/weekly/monthly revenue charts on merchant overview                                           | M      | ✅      |
| Delivery performance      | Success rate, average delivery time, rider stats — admin page at `/dashboard/delivery-performance` | M      | ✅      |
| COD reconciliation report | Detailed COD tracking and settlement report — admin page at `/dashboard/cod-reconciliation`        | S      | ✅      |
| Merchant comparison       | Compare performance across merchants (admin)                                                       | S      | ⏳      |
| PDF/Excel export          | Export reports as PDF or Excel                                                                     | M      | ⏳      |
| Scheduled reports         | Email weekly/monthly reports to merchants                                                          | M      | ⏳      |
| Rider performance         | Delivery success rate, average time per rider                                                      | S      | ⏳      |

---

## Phase 4: Mobile Experience (Priority: Medium)

**Goal:** Optimize for mobile users (riders and merchants).

| Task                   | Description                                | Effort |
|------------------------|--------------------------------------------|--------|
| PWA improvements       | Better offline support, push notifications | M      |
| Mobile-optimized forms | Simplified order creation for mobile       | S      |
| Camera integration     | Better photo capture for delivery proof    | M      |
| GPS tracking           | Real-time rider location tracking          | L      |

---

## Phase 5: API & Integrations (Priority: Low)

**Goal:** Let merchants integrate with their existing systems.

| Task                   | Description                        | Effort |
|------------------------|------------------------------------|--------|
| Accounting integration | Export to Tally/QuickBooks         | M      |
| SMS gateway            | Integrate with local SMS providers | S      |
| WhatsApp notifications | Delivery updates via WhatsApp      | M      |

---

## Phase 6: Security Hardening (Priority: High)

**Goal:** Production-grade security posture.

| Task                                  | Description                                                                                                            | Effort |
|---------------------------------------|------------------------------------------------------------------------------------------------------------------------|--------|
| 2FA for admins                        | Two-factor authentication for admin accounts                                                                           | S      |
| IP whitelisting                       | Restrict admin access by IP                                                                                            | S      |
| Audit trail enhancements              | More detailed audit logging                                                                                            | S      |
| Rate limiting via Redis               | Replace in-memory limiter (`rate-limit.ts`) with Redis — current limiter is per-instance and ineffective on serverless | M      |
| Add rate limiting to public endpoints | `receiver-note` and `resend-verification` have no rate limiting                                                        | S      |
| Add CSRF middleware                   | Create `middleware.ts` — currently relying solely on SameSite cookies from better-auth                                 | M      |
| Vulnerability scanning                | Regular security scans                                                                                                 | M      |
| SOC 2 compliance                      | Security audit and compliance certification                                                                            | XL     |

---

## Phase 7: Scalability (Priority: Low)

| Task                   | Description                                                                                                          | Effort |
|------------------------|----------------------------------------------------------------------------------------------------------------------|--------|
| Database optimization  | Indexes, query optimization, connection pooling — add standalone indexes for `order.merchantId`, `order.warehouseId` | M      |
| Caching layer          | Redis for frequently accessed data                                                                                   | M      |
| CDN for static assets  | Serve static files from CDN                                                                                          | S      |
| Background jobs        | Queue for email, reports, notifications                                                                              | M      |
| Horizontal scaling     | Support multiple app instances                                                                                       | L      |
| Database read replicas | Separate read/write databases                                                                                        | M      |

---

## Phase 8: Documentation & Support (Priority: Medium)

| Task                  | Description                             | Effort |
|-----------------------|-----------------------------------------|--------|
| User documentation    | Help docs for merchants, riders, admins | L      |
| API documentation     | OpenAPI/Swagger for public API          | M      |
| Video tutorials       | Setup guides, feature walkthroughs      | L      |
| FAQ page              | Common questions and answers            | S      |
| Support ticket system | In-app support request form             | M      |
| Status page           | Public status page for uptime           | S      |

---

## Implementation Order

```
Phase 1: Critical Security Fixes    [1 week]
    ↓
Phase 2: Code Quality               [1-2 weeks]
    ↓
Phase 3: Analytics & Reporting      [2-3 weeks] 🔄 IN PROGRESS
    ↓
Phase 4: Mobile Experience          [2-3 weeks]
    ↓
Phase 5: API & Integrations         [2-3 weeks]
    ↓
Phase 6: Security Hardening         [2-3 weeks]
    ↓
Phase 7: Scalability                [2-3 weeks]
    ↓
Phase 8: Documentation              [2-3 weeks]
```

**Total estimated time:** 15-22 weeks (4-5 months) for a small team.

---

## Quick Wins (Do First)

1. **Fix critical security issues** — Remove exposed secrets, clean debug logs
2. **Add subscription plan display** on merchant dashboard
3. **Improve the landing page** with pricing tiers
4. **Create a help center** with basic documentation
