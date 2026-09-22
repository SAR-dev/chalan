# Unified Plan — Order Actions Expansion + Role Module Features

This merges **ORDER.md** (new order statuses/actions, schema, API, audit, notifications) with **REFACTOR.md** (per-role UI feature roadmap for Merchant, Rider, Warehouse, Admin). Several REFACTOR features directly depend on, or duplicate, ORDER actions — those overlaps are called out explicitly in §8 so they aren't built twice or inconsistently.

---

## 1. Updated Order Status Flow

```
PENDING → APPROVED → PICKED_UP → IN_WAREHOUSE → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
   ↓ ↓        ↓            ↓             ↓              ↓              ↓
REJECTED  CANCELLED    CANCELLED     CANCELLED      CANCELLED      FAILED_ATTEMPT → RETURNED
   |         ↓             ↓                                              ↓
   |    (assigned to    HELD ⇄ (APPROVED/PICKED_UP/IN_WAREHOUSE)      REATTEMPT → OUT_FOR_DELIVERY
   |       rider)             ↓
   |                       DAMAGED (from IN_WAREHOUSE only)
   ↓
CANCELLED
```

New terminal/side statuses: `HELD` (pausable from APPROVED/PICKED_UP/IN_WAREHOUSE, returns to prior status on release), `DAMAGED` (from IN_WAREHOUSE), `REJECTED` (from PENDING, alternative to CANCELLED).

---

## 2. Full Transition Table

| Transition | Roles | From | To | Source |
|---|---|---|---|---|
| `approve` | SUPER_ADMIN | PENDING | APPROVED | existing |
| `reject` | SUPER_ADMIN | PENDING | REJECTED | ORDER §2 |
| `edit` | SUPER_ADMIN | PENDING | PENDING (no change) | ORDER §1 |
| `edit` (merchant-scoped) | MERCHANT | PENDING | PENDING (no change) | REFACTOR Merchant F2 — **see §8.1 conflict** |
| `cancel` | SUPER_ADMIN, WAREHOUSE_ADMIN, MERCHANT | PENDING…IN_TRANSIT | CANCELLED | existing |
| `hold` | SUPER_ADMIN, WAREHOUSE_ADMIN | APPROVED, PICKED_UP, IN_WAREHOUSE | HELD | ORDER §3 |
| `release` | SUPER_ADMIN, WAREHOUSE_ADMIN | HELD | previous status | ORDER §4 |
| `assign-pickup-rider` | WAREHOUSE_ADMIN | APPROVED | APPROVED (+riderId) | existing |
| `reassign-rider` (generic) | SUPER_ADMIN, WAREHOUSE_ADMIN | APPROVED / IN_WAREHOUSE | same | ORDER §7 |
| `reassign-pickup-rider` | WAREHOUSE_ADMIN | APPROVED (has pickupRiderId) | same | ORDER §12 — specialization of §7 |
| `reassign-delivery-rider` | WAREHOUSE_ADMIN | IN_WAREHOUSE (has deliveryRiderId) | same | ORDER §13 — specialization of §7 |
| `picked-up` | RIDER | APPROVED | PICKED_UP | existing |
| `receive` | WAREHOUSE_ADMIN | PICKED_UP | IN_WAREHOUSE | existing |
| `transfer-warehouse` | SUPER_ADMIN, WAREHOUSE_ADMIN | PICKED_UP, IN_WAREHOUSE | same warehouse-shifted | ORDER §5 |
| `hold-parcel` | WAREHOUSE_ADMIN | IN_WAREHOUSE | HELD | ORDER §9 |
| `mark-damaged` | WAREHOUSE_ADMIN | IN_WAREHOUSE | DAMAGED | ORDER §10 |
| `dispatch` | WAREHOUSE_ADMIN | IN_WAREHOUSE | IN_TRANSIT | existing |
| `force-dispatch` | WAREHOUSE_ADMIN | IN_WAREHOUSE | IN_TRANSIT | ORDER §11 |
| `reschedule` | SUPER_ADMIN, WAREHOUSE_ADMIN | IN_WAREHOUSE, IN_TRANSIT | same (+rescheduledTo) | ORDER §8 |
| `out-for-delivery` | RIDER | IN_TRANSIT | OUT_FOR_DELIVERY | existing |
| `delivered` | RIDER | OUT_FOR_DELIVERY | DELIVERED | existing |
| `failed` | RIDER | OUT_FOR_DELIVERY | FAILED_ATTEMPT | existing |
| `reattempt` | WAREHOUSE_ADMIN | FAILED_ATTEMPT | OUT_FOR_DELIVERY | existing |
| `return` | WAREHOUSE_ADMIN | FAILED_ATTEMPT | RETURNED | existing |
| `settle-cod` | WAREHOUSE_ADMIN | DELIVERED | DELIVERED (+codSettledAt) | existing |
| `add-note` | SUPER_ADMIN, WAREHOUSE_ADMIN | any | same | ORDER §6 |

---

## 3. Schema Changes (unchanged from ORDER.md, no additions needed from REFACTOR)

```sql
ALTER TABLE "order" ADD COLUMN "heldAt" timestamp;
ALTER TABLE "order" ADD COLUMN "heldBy" text;
ALTER TABLE "order" ADD COLUMN "holdReason" text;
ALTER TABLE "order" ADD COLUMN "releasedAt" timestamp;
ALTER TABLE "order" ADD COLUMN "releasedBy" text;

ALTER TABLE "order" ADD COLUMN "rejectedAt" timestamp;
ALTER TABLE "order" ADD COLUMN "rejectedBy" text;
ALTER TABLE "order" ADD COLUMN "rejectionReason" text;

ALTER TABLE "order" ADD COLUMN "damagedAt" timestamp;
ALTER TABLE "order" ADD COLUMN "damagedBy" text;
ALTER TABLE "order" ADD COLUMN "damageNotes" text;
ALTER TABLE "order" ADD COLUMN "damagePhotos" text[];

ALTER TABLE "order" ADD COLUMN "rescheduledAt" timestamp;
ALTER TABLE "order" ADD COLUMN "rescheduledBy" text;
ALTER TABLE "order" ADD COLUMN "rescheduledTo" timestamp;
ALTER TABLE "order" ADD COLUMN "rescheduleReason" text;

ALTER TABLE "order" ADD COLUMN "internalNotes" text;

ALTER TABLE "order" ADD COLUMN "transferredAt" timestamp;
ALTER TABLE "order" ADD COLUMN "transferredBy" text;
ALTER TABLE "order" ADD COLUMN "previousWarehouseId" text;
ALTER TABLE "order" ADD COLUMN "transferReason" text;
```

```typescript
export const orderStatuses = [
  "PENDING", "APPROVED", "PICKED_UP", "IN_WAREHOUSE", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_ATTEMPT", "RETURNED", "CANCELLED",
  "HELD", "DAMAGED", "REJECTED",
] as const
```

---

## 4. Consolidated API Endpoints

### Order actions (ORDER.md — backend, role-guarded per §2 table)

| Method | Endpoint | Notes |
|---|---|---|
| `PATCH` | `/api/orders/[id]/edit` | **Shared by SUPER_ADMIN and MERCHANT** — see §8.1 |
| `PATCH` | `/api/orders/[id]/reject` | SUPER_ADMIN |
| `PATCH` | `/api/orders/[id]/hold` | SUPER_ADMIN, WAREHOUSE_ADMIN |
| `PATCH` | `/api/orders/[id]/release` | SUPER_ADMIN, WAREHOUSE_ADMIN |
| `PATCH` | `/api/orders/[id]/transfer-warehouse` | SUPER_ADMIN, WAREHOUSE_ADMIN |
| `PATCH` | `/api/orders/[id]/note` | SUPER_ADMIN, WAREHOUSE_ADMIN |
| `PATCH` | `/api/orders/[id]/reassign-rider` | SUPER_ADMIN, WAREHOUSE_ADMIN (generic) |
| `PATCH` | `/api/orders/[id]/reschedule` | SUPER_ADMIN, WAREHOUSE_ADMIN |
| `PATCH` | `/api/orders/[id]/damage` | WAREHOUSE_ADMIN |

### Bulk (shared across modules — see §8.2)

| Method | Endpoint | Consumers |
|---|---|---|
| `PATCH` | `/api/orders/bulk/cancel` | Merchant F4, Warehouse F3, Admin F3 |
| `PATCH` | `/api/orders/bulk/approve` | exists — Admin F3 |
| `PATCH` | `/api/orders/bulk/reattempt` | Warehouse F3 (new) |
| `PATCH` | `/api/orders/bulk/return` | Warehouse F3 (new) |
| `PATCH` | `/api/merchants/bulk/approve` | exists — Admin F3 |
| `PATCH` | `/api/merchants/bulk/suspend` | Admin F3 (new) |
| `PATCH` | `/api/merchants/bulk/reactivate` | Admin F3 (new) |

### Per-module additions (REFACTOR.md)

| Method | Endpoint | Module |
|---|---|---|
| `GET` | `/api/merchants/[id]/analytics` | Merchant F6 |
| `GET` | `/api/riders/[id]/delivery-history` | Rider F2 |
| `GET` | `/api/riders/[id]/earnings` | Rider F3 |
| `PATCH` | `/api/riders/[id]/active` | Rider F5 |
| `PATCH` | `/api/users/me` (extend w/ notification prefs) | Rider F6 |
| `GET` | `/api/riders/performance` | Warehouse F2 |
| `GET` | `/api/warehouses/[id]/analytics` | Warehouse F4 |
| `GET` | `/api/warehouses/[id]/reconciliation` | Warehouse F5 |
| `GET` | `/api/warehouses/[id]/activity` | Warehouse F6 |
| `GET` | `/api/analytics/platform` | Admin F1 |
| `GET` | `/api/riders/[id]/performance` | Admin F5 |
| `GET/PATCH` | `/api/notifications*` | Admin F6 |
| `GET` (extended) | `/api/audit-logs` (+dateFrom/dateTo/actorRole/actionType/entityType) | Admin F7 |

---

## 5. Consolidated Audit Actions

```typescript
export const ORDER_AUDIT_ACTIONS = {
  ORDER_EDITED: "Edited order",                 // fired by both merchant + admin edit paths — see §8.1
  ORDER_REJECTED: "Rejected order",
  ORDER_HELD: "Held order",
  ORDER_RELEASED: "Released order",
  ORDER_WAREHOUSE_TRANSFERRED: "Transferred order to different warehouse",
  ORDER_NOTE_ADDED: "Added internal note to order",
  ORDER_RIDER_REASSIGNED: "Reassigned rider on order",
  ORDER_RESCHEDULED: "Rescheduled delivery",
  PARCEL_DAMAGED: "Marked parcel as damaged",
  PARCEL_FORCE_DISPATCHED: "Force dispatched parcel",
  PICKUP_RIDER_REASSIGNED: "Reassigned pickup rider",
  DELIVERY_RIDER_REASSIGNED: "Reassigned delivery rider",
} as const
```

Recommend distinguishing actor in the audit **entry** (existing `actorRole`/`actorId` fields) rather than adding parallel `ORDER_EDITED_BY_MERCHANT` actions — keeps the audit log filterable by role (needed anyway for Admin F7).

---

## 6. Consolidated Notifications

| Event | Recipient | Channel | Template |
|---|---|---|---|
| Order edited | Merchant | Email | "Your order {code} was edited by admin" |
| Order rejected | Merchant | Email | "Your order {code} was rejected. Reason: {reason}" |
| Order held | Merchant | Email | "Your order {code} is on hold. Reason: {reason}" |
| Order released | Merchant | Email | "Your order {code} has been released" |
| Parcel damaged | Merchant | Email | "Order {code} was damaged in warehouse" |
| Rider reassigned | Old rider | In-app | "Order {code} has been reassigned" |
| Rider reassigned | New rider | In-app | "Order {code} has been assigned to you" |
| Delivery rescheduled | Merchant | Email | "Order {code} delivery rescheduled to {date}" |
| New assignment / status change | Rider | In-app + Email (per prefs) | Rider F6 preferences gate this |
| Order/merchant/rider/payout events | Admin/Super Admin | In-app feed | Admin F6 notification center |

---

## 7. Per-Module UI Roadmap (from REFACTOR.md, cross-referenced to ORDER actions)

### Merchant (`/merchant`)
1. **Order Detail Page** (`/merchant/orders/[id]`) — foundation; shared `order-timeline.tsx` component reused by Rider.
2. **Delivery Proof Viewer** — read-only section on detail page.
3. **Order Editing** — reuses `PATCH /api/orders/[id]/edit`, merchant-scoped (§8.1).
4. **Bulk Cancel UI** — reuses shared `PATCH /api/orders/bulk/cancel` (§8.2).
5. **Balance Transaction History** (`/merchant/finance/transactions`).
6. **Analytics Dashboard** (`/merchant/analytics`).

### Rider (`/rider`)
1. **Order Detail Page** (`/rider/orders/[id]`) — reuses shared `order-timeline.tsx`.
2. **Open in Maps / Navigation** — no new API.
3. **Delivery History & Stats** (`/rider/history`).
4. **Earnings / COD Summary** (`/rider/earnings`).
5. **Availability Toggle**.
6. **Notification Preferences**.

### Warehouse (`/warehouse`)
0. **Order Detail Page** — already exists, shared component.
1. **Hold Parcel / Mark Damaged / Transfer Warehouse / Force Dispatch** — direct UI wiring for ORDER §5, §9, §10, §11. *(Not itemized as its own feature in REFACTOR — add explicitly, see §8.5/§8.6.)*
2. **Reassign Pickup/Delivery Rider** — dispatch page buttons for ORDER §12/§13.
3. **Bulk Operations Expansion** — bulk reattempt/return, reuses shared bulk cancel.
4. **Rider Performance Dashboard**.
5. **Warehouse Analytics Dashboard**.
6. **COD Reconciliation Enhancements**.
7. **Parcel Tracking / Activity Feed**.

### Admin / Super Admin (`/dashboard`)
1. **Order action dropdown additions**: Edit, Reject, Hold, Reassign rider, Reschedule, Add note (ORDER §1–§2, §3, §7, §8, §6).
2. **Held Orders page/tab** (`/dashboard/held-orders`) — release/cancel/transfer actions. *(New; not in REFACTOR's original Admin feature list — add per ORDER's UI Changes section.)*
3. **Merchant Detail Page**.
4. **Bulk Operations Expansion** (orders bulk-cancel, merchants bulk suspend/reactivate).
5. **Rider Performance page**.
6. **Platform Analytics Dashboard**.
7. **Data Export** (CSV, all major tables).
8. **Audit Log Enhancements** (filters, detail drawer, export).
9. **Notification Center**.

---

## 8. Conflicts / Overlaps to Resolve Before Building

1. **Duplicate `edit` endpoint.** ORDER.md gives SUPER_ADMIN a full-field edit while REFACTOR gives MERCHANT a narrower edit (no `productCost`/`parcelWeightKg` recalculation implied). Recommend **one** `PATCH /api/orders/[id]/edit` handler that branches allowed fields by role, rather than two separate routes — avoids drift between the two field sets and a single `ORDER_EDITED` audit trail.
2. **Duplicate bulk-cancel endpoint.** Merchant, Warehouse, and Admin modules each ask for `PATCH /api/orders/bulk/cancel`. Build once, scope the order-set query by the caller's role (merchant → own orders; warehouse → own warehouse; admin → any), not three separate routes.
3. **Generic vs. specialized rider reassignment.** ORDER.md's own Phase 4 ("Warehouse Optimizations") already flags `reassign-pickup-rider`/`reassign-delivery-rider` (§12–13) as a **refactor of** the generic `reassign-rider` (§7) built in Phase 1. Build the generic endpoint + UI first (Admin dropdown), then specialize into the Warehouse dispatch page — don't build both from scratch in parallel.
4. **Reschedule exposure.** ORDER.md gives SUPER_ADMIN/WAREHOUSE_ADMIN a `reschedule` action; REFACTOR's Merchant open question asks whether merchants should get this too. Recommend building the backend/admin UI first and treating merchant-facing reschedule as a follow-up decision, not blocking Phase 1–2.
5. **Held Orders page is net-new.** It's in ORDER.md's "UI Changes" section but absent from REFACTOR's Admin feature list — add it explicitly to the Admin roadmap (done above) so it isn't dropped.
6. **Damage / Force Dispatch UI is net-new for Warehouse.** ORDER.md defines these as Warehouse Admin actions with target pages (`/warehouse/exceptions`, `/warehouse/dispatch`), but REFACTOR's Warehouse module plan doesn't list them as features — added explicitly to §7 above.

---

## 9. Unified Implementation Roadmap

**Phase 0 — Shared foundation**
- Shared `order-timeline.tsx` + order detail pages for Merchant and Rider (Warehouse's already exists).

**Phase 1 — Core admin actions + first UI**
- Backend: `edit` (role-branched, §8.1), `reject`, `reassign-rider` (generic).
- Frontend: Admin order dropdown (Edit/Reject/Reassign), Merchant order editing on detail page.

**Phase 2 — Exception handling**
- Backend: `hold`/`release`, `mark-damaged`, `transfer-warehouse`.
- Frontend: Held Orders page, Warehouse exceptions "Mark damaged", Warehouse dispatch "Transfer warehouse" + "Hold parcel".

**Phase 3 — Bulk operations (cross-cutting)**
- Backend: shared `bulk/cancel` (role-scoped, §8.2), `bulk/reattempt`, `bulk/return`, `merchants/bulk/suspend`, `merchants/bulk/reactivate`.
- Frontend: Merchant bulk-cancel UI, Warehouse bulk reattempt/return, Admin bulk expansion.

**Phase 4 — Advanced ops**
- Backend: `reschedule`, `add-note`, `force-dispatch`.
- Frontend: Reschedule dialog, internal notes UI, force-dispatch dialog.

**Phase 5 — Warehouse rider-assignment specialization**
- Backend: `reassign-pickup-rider`, `reassign-delivery-rider` (refactor of Phase 1's generic endpoint, §8.3).
- Frontend: Dispatch page reassign buttons.

**Phase 6 — Analytics & reporting** *(independent, highest effort — parallelizable across modules)*
- Merchant analytics, Rider history/earnings, Warehouse rider-performance/analytics/reconciliation, Admin platform analytics + rider performance + merchant detail page.

**Phase 7 — Polish / nice-to-haves**
- Data export, audit log enhancements, notification center, rider notification prefs + availability toggle, open-in-maps, delivery proof viewer.

---

## 10. Open Questions (merged)

- Should the merchant-facing `edit` and admin `edit` truly share one endpoint, or does the differing field set (COD/weight recalculation) justify a thin wrapper instead? (§8.1)
- Should merchants be able to request a reschedule, or only view one set by admin/warehouse?
- Chart library: Recharts vs. CSS-based bars — pick once, reuse across Merchant/Rider/Warehouse/Admin analytics (four separate analytics features all need this decision).
- Should CSV bulk upload for orders be included? (currently out of scope everywhere)
- Should riders see merchant phone number at pickup time?
- Is a real-time activity feed (Warehouse F6) needed, or is polling sufficient — same question applies to the Admin notification center.
- Should reconciliation/settlement support partial (selected-orders-only) settling?
- Should Super Admin be able to impersonate users for debugging?
- Should analytics support scheduled email reports?
- Should audit logs capture IP address?
