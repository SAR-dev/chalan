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

**What's missing:** The platform requires a Super Admin to manually approve merchants, set pricing, and manage everything. To sell it, we need to automate onboarding, add billing, and make it self-service.

---

## Phase 1: Self-Service Onboarding (Priority: Critical)

**Goal:** Let businesses sign up and start using the platform without manual admin intervention.

| Task | Description | Effort |
|------|-------------|--------|
| Auto-approve merchants | Auto-activate after email + phone verification | S |
| Simplified registration | Reduce form fields, add business type selection | S |
| Onboarding wizard | Guided setup: add pickup locations, select cities, view pricing | M |
| Welcome email sequence | Automated emails: welcome, getting started, first order tips | S |
| Demo data | Pre-populate a demo merchant with sample orders | S |

**Why:** Currently every merchant needs manual approval. This blocks self-service signups.

---

## Phase 2: Subscription & Billing (Priority: Critical)

**Goal:** Charge merchants for using the platform.

| Task | Description | Effort |
|------|-------------|--------|
| Subscription plans | Define tiers (Starter, Growth, Enterprise) with limits | S |
| Plan management UI | Admin page to create/edit plans | M |
| Merchant subscription | Assign plan to merchant, enforce limits | M |
| Usage tracking | Track orders, API calls, storage per merchant | M |
| Invoice generation | Auto-generate monthly invoices | L |
| Payment integration | Stripe/Bkash/Nagad for subscription payments | L |
| Trial period | Free trial for new merchants (e.g., 14 days) | S |
| Overage handling | What happens when merchant exceeds plan limits | S |

**Suggested Plans:**

| Plan | Price | Orders/mo | Riders | Warehouses |
|------|-------|-----------|--------|------------|
| Starter | ৳2,000 | 100 | 2 | 1 |
| Growth | ৳5,000 | 500 | 10 | 3 |
| Enterprise | ৳15,000 | Unlimited | Unlimited | Unlimited |

---

## Phase 3: Multi-Tenancy & Data Isolation (Priority: High)

**Goal:** Ensure complete data isolation between different businesses.

| Task | Description | Effort |
|------|-------------|--------|
| Tenant ID on all tables | Add `tenantId` FK to merchants, riders, warehouses, orders | L |
| Query scoping | Ensure all queries filter by tenant | M |
| RLS policies | PostgreSQL Row-Level Security as backup | M |
| Data export | Let merchants export their own data (GDPR) | S |
| Data deletion | Soft-delete vs hard-delete policies | S |

**Note:** Currently the system uses role-based access (MERCHANT sees only their orders). This works for single-tenant. For multi-tenant, we need `tenantId` on all entities.

---

## Phase 4: Customization & White-Labeling (Priority: Medium)

**Goal:** Let businesses customize their portal.

| Task | Description | Effort |
|------|-------------|--------|
| Custom logo | Upload merchant logo, display in sidebar/email | S |
| Custom colors | Theme color override per tenant | M |
| Custom domain | Subdomain or custom domain mapping | L |
| Custom email templates | Merchant-branded email templates | M |
| Custom landing page | Merchant-specific landing page | M |
| Remove platform branding | Option to hide "Powered by X" | S |

---

## Phase 5: Analytics & Reporting (Priority: Medium)

**Goal:** Give merchants insights into their business.

| Task | Description | Effort |
|------|-------------|--------|
| Revenue dashboard | Daily/weekly/monthly revenue charts | M |
| Delivery performance | Success rate, average delivery time, rider stats | M |
| COD reconciliation report | Detailed COD tracking and settlement report | S |
| Merchant comparison | Compare performance across merchants (admin) | S |
| PDF/Excel export | Export reports as PDF or Excel | M |
| Scheduled reports | Email weekly/monthly reports to merchants | M |
| Rider performance | Delivery success rate, average time per rider | S |

---

## Phase 6: Mobile Experience (Priority: Medium)

**Goal:** Optimize for mobile users (riders and merchants).

| Task | Description | Effort |
|------|-------------|--------|
| PWA improvements | Better offline support, push notifications | M |
| Native Android app | Kotlin/Swift app for riders | XL |
| iOS app | Swift app for riders | XL |
| Mobile-optimized forms | Simplified order creation for mobile | S |
| Camera integration | Better photo capture for delivery proof | M |
| GPS tracking | Real-time rider location tracking | L |
| Offline mode | Queue actions when offline, sync when online | L |

---

## Phase 7: API & Integrations (Priority: Low)

**Goal:** Let merchants integrate with their existing systems.

| Task | Description | Effort |
|------|-------------|--------|
| REST API | Public API for order management | L |
| Webhooks | Notify external systems on order events | M |
| Shopify/WooCommerce plugin | E-commerce integration | L |
| Accounting integration | Export to Tally/QuickBooks | M |
| SMS gateway | Integrate with local SMS providers | S |
| WhatsApp notifications | Delivery updates via WhatsApp | M |

---

## Phase 8: Security & Compliance (Priority: High)

| Task | Description | Effort |
|------|-------------|--------|
| SOC 2 compliance | Security audit and compliance certification | XL |
| Data encryption | Encrypt sensitive data at rest | M |
| 2FA for admins | Two-factor authentication for admin accounts | S |
| IP whitelisting | Restrict admin access by IP | S |
| Audit trail enhancements | More detailed audit logging | S |
| Rate limiting improvements | Per-tenant rate limiting | M |
| Vulnerability scanning | Regular security scans | M |

---

## Phase 9: Scalability (Priority: Low)

| Task | Description | Effort |
|------|-------------|--------|
| Database optimization | Indexes, query optimization, connection pooling | M |
| Caching layer | Redis for frequently accessed data | M |
| CDN for static assets | Serve static files from CDN | S |
| Background jobs | Queue for email, reports, notifications | M |
| Horizontal scaling | Support multiple app instances | L |
| Database read replicas | Separate read/write databases | M |

---

## Phase 10: Documentation & Support (Priority: Medium)

| Task | Description | Effort |
|------|-------------|--------|
| User documentation | Help docs for merchants, riders, admins | L |
| API documentation | OpenAPI/Swagger for public API | M |
| Video tutorials | Setup guides, feature walkthroughs | L |
| FAQ page | Common questions and answers | S |
| Support ticket system | In-app support request form | M |
| Status page | Public status page for uptime | S |

---

## Implementation Order

```
Phase 1: Self-Service Onboarding     [2-3 weeks]
    ↓
Phase 2: Subscription & Billing      [3-4 weeks]
    ↓
Phase 3: Multi-Tenancy               [4-6 weeks]
    ↓
Phase 4: Customization               [2-3 weeks]
    ↓
Phase 5: Analytics                   [2-3 weeks]
    ↓
Phase 6: Mobile                      [4-6 weeks]
    ↓
Phase 7: API & Integrations          [4-6 weeks]
    ↓
Phase 8: Security                    [2-3 weeks]
    ↓
Phase 9: Scalability                 [2-3 weeks]
    ↓
Phase 10: Documentation              [2-3 weeks]
```

**Total estimated time:** 25-35 weeks (6-9 months) for a small team.

---

## Quick Wins (Do First)

These can be done in 1-2 weeks and make the platform immediately more sellable:

1. **Auto-approve merchants** after email verification
2. **Add a "Get Started" wizard** for new merchants
3. **Add subscription plan display** on merchant dashboard
4. **Improve the landing page** with pricing tiers
5. **Add a public demo** (sandbox environment)
6. **Create a help center** with basic documentation

---

## Revenue Model Options

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| **Per-order** | ৳5-10 per delivery | Simple, scales with usage | Unpredictable revenue |
| **Monthly subscription** | ৳2,000-15,000/month | Predictable revenue | May deter small merchants |
| **Freemium** | Free tier + paid features | Low barrier to entry | Hard to convert |
| **Hybrid** | Base fee + per-order | Balanced | Complex to manage |

**Recommended:** Hybrid model — base monthly fee + small per-order fee. This provides predictable revenue while keeping the barrier low for small merchants.
