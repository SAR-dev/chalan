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

## DevSecOps Audit Findings

### CRITICAL — Fix Immediately

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | `NEXT_PUBLIC_SUPERADMIN_PASSWORD` exposed in client bundle | `.env:17` | Super admin password visible in browser DevTools |
| 2 | Production database credentials in `.env.vercel` | `.env.vercel:1-17` | Neon DB, R2 storage, auth secret all on disk — verify never committed |
| 3 | Debug `console.log` statements in production dialogs | `out-for-delivery-dialog.tsx`, `warehouse-dispatch-dialog.tsx` | Leaks internal flow details, clutters console |

### HIGH — Fix Soon

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | No Zod validation on merchant NID endpoints | `merchants/[id]/nid/route.ts:49`, `merchants/[id]/nid/verify/route.ts:49` | Raw `req.json()` with no schema enforcement |
| 5 | Merchant PATCH uses raw `req.json()` instead of `parseBody()` | `merchants/[id]/route.ts:88` | Bypasses graceful error handling |
| 6 | N+1 query in bulk order approval | `orders/bulk/approve/route.ts:35-43` | One DB query per order instead of batch |
| 7 | `tx: any` in critical order transition logic | `transitions.ts:472` | Type safety hole in transaction handling |
| 8 | Rider pages access fields via `as any` casts | `rider/page.tsx`, `rider/pickup/page.tsx`, `rider/delivery/page.tsx` | Type unsafety, runtime errors if API changes |
| 9 | CSP allows `unsafe-inline` and `unsafe-eval` | `next.config.mjs:41` | Weakened XSS protection |

### MEDIUM — Address in Next Sprint

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 10 | No CSRF middleware | No `middleware.ts` | Relying solely on SameSite cookies |
| 11 | In-memory rate limiter ineffective on serverless | `rate-limit.ts:8` | Rate limits don't persist across Vercel invocations |
| 12 | Missing rate limiting on public endpoints | `receiver-note`, `resend-verification` | Email flooding, note spam |
| 13 | Missing try/catch in most API route handlers | ~95% of routes | Unhandled errors return generic 500s |
| 14 | Duplicated `InfoRow` component across 8 files | 8 dialog files | Maintenance burden |
| 15 | Missing indexes on `delivery_city.zoneId` and `delivery_city.warehouseId` | Schema | Slow joins in bulk order creation |
| 16 | Sequential `logAudit` in bulk operation loops | 16 locations | Unnecessary latency |
| 17 | 7 `as any` casts for Drizzle enum parameters | Multiple API routes | Should use type helper utility |
| 18 | `typescript: { ignoreBuildErrors: true }` in next.config | `next.config.mjs:21` | Type errors silently ignored during build |

### LOW — Address When Convenient

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 19 | No `middleware.ts` file | Root | No global request-level security hooks |
| 20 | Missing standalone indexes for `order.merchantId` and `order.warehouseId` | Schema | Slower single-column lookups |
| 21 | 17+ API routes without spec files | Various | Test coverage gaps |
| 22 | Missing shared component tests | `src/components/*.tsx` | Component test gaps |
| 23 | Missing `use-table-filters.ts` and `use-data-error.ts` specs | `src/lib/hooks/` | Hook test gaps |

---

## Phase 1: Critical Security Fixes (Priority: Critical)

**Goal:** Fix all critical and high-severity security issues before selling.

| Task                                    | Description                                              | Effort | Status |
|-----------------------------------------|----------------------------------------------------------|--------|--------|
| Remove `NEXT_PUBLIC_SUPERADMIN_PASSWORD` | Delete from `.env`, remove any references               | S      | ⏳     |
| Clean debug console.logs                | Remove `[B8]` and `[B7]` debug logs from dialogs        | S      | ⏳     |
| Add Zod schemas for NID endpoints       | Create `nidSubmitSchema`, `nidReviewSchema`              | S      | ⏳     |
| Fix merchant PATCH to use `parseBody()` | Replace raw `req.json()` with `parseBody()`              | S      | ⏳     |
| Fix N+1 query in bulk approve           | Pre-fetch merchant weight limits in batch                | S      | ⏳     |
| Fix `tx: any` in transitions.ts         | Use proper Drizzle `Transaction` type                    | S      | ⏳     |
| Fix rider page `as any` casts           | Extend `Order` type with joined fields                   | S      | ⏳     |
| Tighten CSP for production              | Remove `unsafe-eval`, use nonce-based scripts            | M      | ⏳     |

---

## Phase 2: Code Quality (Priority: High)

**Goal:** Improve code maintainability and test coverage.

| Task                                    | Description                                              | Effort | Status |
|-----------------------------------------|----------------------------------------------------------|--------|--------|
| Extract `InfoRow` shared component      | Deduplicate from 8 dialog files                          | S      | ⏳     |
| Add try/catch to API route handlers     | Wrap handlers in error boundary                           | M      | ⏳     |
| Add missing DB indexes                  | `delivery_city.zoneId`, `delivery_city.warehouseId`       | S      | ⏳     |
| Parallelize `logAudit` in bulk loops    | Use `Promise.all()` for fire-and-forget calls             | S      | ⏳     |
| Create Drizzle enum type helper         | Fix `as any` casts for `inArray()` enum params            | S      | ⏳     |
| Add error boundaries to route segments  | Add `error.tsx` to onboarding, login, register            | S      | ⏳     |

---

## Phase 3: Subscription & Billing (Priority: Critical)

**Goal:** Charge merchants for using the platform.

| Task                  | Description                                            | Effort |
|-----------------------|--------------------------------------------------------|--------|
| Subscription plans    | Define tiers (Starter, Growth, Enterprise) with limits | S      |
| Plan management UI    | Admin page to create/edit plans                        | M      |
| Merchant subscription | Assign plan to merchant, enforce limits                | M      |
| Usage tracking        | Track orders, API calls, storage per merchant          | M      |
| Invoice generation    | Auto-generate monthly invoices                         | L      |
| Payment integration   | Stripe/Bkash/Nagad for subscription payments           | L      |
| Trial period          | Free trial for new merchants (e.g., 14 days)           | S      |
| Overage handling      | What happens when merchant exceeds plan limits         | S      |

**Suggested Plans:**

| Plan       | Price   | Orders/mo | Riders    | Warehouses |
|------------|---------|-----------|-----------|------------|
| Starter    | ৳2,000  | 100       | 2         | 1          |
| Growth     | ৳5,000  | 500       | 10        | 3          |
| Enterprise | ৳15,000 | Unlimited | Unlimited | Unlimited  |

---

## Phase 4: Analytics & Reporting (Priority: Medium) 🔄 IN PROGRESS

**Goal:** Give merchants insights into their business.

| Task                      | Description                                      | Effort | Status |
|---------------------------|--------------------------------------------------|--------|--------|
| Revenue dashboard         | Daily/weekly/monthly revenue charts              | M      | ✅     |
| Delivery performance      | Success rate, average delivery time, rider stats | M      | ✅     |
| COD reconciliation report | Detailed COD tracking and settlement report      | S      | ✅     |
| Merchant comparison       | Compare performance across merchants (admin)     | S      | ⏳     |
| PDF/Excel export          | Export reports as PDF or Excel                   | M      | ⏳     |
| Scheduled reports         | Email weekly/monthly reports to merchants        | M      | ⏳     |
| Rider performance         | Delivery success rate, average time per rider    | S      | ⏳     |

---

## Phase 5: Mobile Experience (Priority: Medium)

**Goal:** Optimize for mobile users (riders and merchants).

| Task                   | Description                                  | Effort |
|------------------------|----------------------------------------------|--------|
| PWA improvements       | Better offline support, push notifications   | M      |
| Mobile-optimized forms | Simplified order creation for mobile         | S      |
| Camera integration     | Better photo capture for delivery proof      | M      |
| GPS tracking           | Real-time rider location tracking            | L      |

---

## Phase 6: API & Integrations (Priority: Low)

**Goal:** Let merchants integrate with their existing systems.

| Task                       | Description                             | Effort |
|----------------------------|-----------------------------------------|--------|
| Accounting integration     | Export to Tally/QuickBooks              | M      |
| SMS gateway                | Integrate with local SMS providers      | S      |
| WhatsApp notifications     | Delivery updates via WhatsApp           | M      |

---

## Phase 7: Security Hardening (Priority: High)

**Goal:** Production-grade security posture.

| Task                       | Description                                  | Effort |
|----------------------------|----------------------------------------------|--------|
| 2FA for admins             | Two-factor authentication for admin accounts | S      |
| IP whitelisting            | Restrict admin access by IP                  | S      |
| Audit trail enhancements   | More detailed audit logging                  | S      |
| Rate limiting via Redis    | Replace in-memory limiter with Redis         | M      |
| Vulnerability scanning     | Regular security scans                       | M      |
| SOC 2 compliance           | Security audit and compliance certification  | XL     |

---

## Phase 8: Scalability (Priority: Low)

| Task                   | Description                                     | Effort |
|------------------------|-------------------------------------------------|--------|
| Database optimization  | Indexes, query optimization, connection pooling | M      |
| Caching layer          | Redis for frequently accessed data              | M      |
| CDN for static assets  | Serve static files from CDN                     | S      |
| Background jobs        | Queue for email, reports, notifications         | M      |
| Horizontal scaling     | Support multiple app instances                  | L      |
| Database read replicas | Separate read/write databases                   | M      |

---

## Phase 9: Documentation & Support (Priority: Medium)

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
Phase 3: Subscription & Billing     [3-4 weeks]
    ↓
Phase 4: Analytics & Reporting      [2-3 weeks] 🔄 IN PROGRESS
    ↓
Phase 5: Mobile Experience          [4-6 weeks]
    ↓
Phase 6: API & Integrations         [4-6 weeks]
    ↓
Phase 7: Security Hardening         [2-3 weeks]
    ↓
Phase 8: Scalability                [2-3 weeks]
    ↓
Phase 9: Documentation              [2-3 weeks]
```

**Total estimated time:** 22-30 weeks (5-7 months) for a small team.

---

## Quick Wins (Do First)

1. **Fix critical security issues** — Remove exposed secrets, clean debug logs
2. **Add subscription plan display** on merchant dashboard
3. **Improve the landing page** with pricing tiers
4. **Create a help center** with basic documentation
