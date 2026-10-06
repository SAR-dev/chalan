# TODO — Warehouse-to-warehouse transfer

## Status

**Design only.** Tables and the change list are specified below; nothing is
implemented, every box in a future plan stays unticked. The two open questions
from the concept draft are answered here — batches, and a neutral carrier field.

---

## Why tables, when a status alone would have worked

The status-only shape (flip `order.warehouseId` to B on departure) needs no new
tables, but it makes B the owner of a parcel still on the truck, purely so that
B can see it well enough to receive it. That is a lie baked into the most-scoped
field in the product.

A transfer **document** removes the reason for the lie: B's incoming queue is a
query against the transfer, not against ownership. `order.warehouseId` then stays
with A until the parcel physically arrives — which is what it means.

Four things the tables buy that statuses alone cannot:

1. **A batch.** A truck load is one action, one reference, one receipt.
2. **Destination without ownership.** B can see what is coming while A still owns it.
3. **Refusal.** B can reject a transfer. You cannot reject an ownership flip.
4. **Audit as a row.** Who sent it, when, what was on it — one record instead of
   N independent order-history entries that must be read together.

## The tables

Both follow the local conventions: singular snake_case names, `ts()` timestamps,
`gen_entity_code()` human ids off a sequence, `_idx` suffixes.

### `warehouse_transfer` — one handover

```ts
// In `enums.ts`, beside `orderStatuses` — defined first, because the table
// below references it.
export const warehouseTransferStatuses = [
  "OPEN", // built, nothing has left
  "IN_TRANSIT", // left A, B has not received it
  "RECEIVED", // terminal
  "CANCELLED", // terminal, only from OPEN
] as const

// In `helpers.ts`, beside the other entity-id sequences. Two of them: sharing
// one would interleave TRF and TRI numbers (TRF-100001E, TRI-100002E, TRF-100004E),
// so neither type would read as a run of its own.
export const warehouseTransferIdSeq = pgSequence("warehouse_transfer_id_seq", {
  startWith: 100001,
})
export const warehouseTransferItemIdSeq = pgSequence(
  "warehouse_transfer_item_id_seq",
  { startWith: 100001 },
)

export const warehouseTransfer = pgTable(
  "warehouse_transfer",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('TRF', nextval('warehouse_transfer_id_seq'))`),
    fromWarehouseId: text("fromWarehouseId").notNull()
      .references(() => warehouse.id, { onDelete: "restrict" }),
    toWarehouseId: text("toWarehouseId").notNull()
      .references(() => warehouse.id, { onDelete: "restrict" }),
    status: text("status", { enum: warehouseTransferStatuses }).notNull().default("OPEN"),

    // The neutral carrier: not `pickupRiderId`, not `deliveryRiderId`.
    transferRiderId: text("transferRiderId").references(() => rider.id),

    note: text("note"),
    createdBy: text("createdBy").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),

    // The three points a handover is judged at.
    dispatchedBy: text("dispatchedBy"),
    dispatchedAt: ts("dispatchedAt"),
    receivedBy: text("receivedBy"),
    receivedAt: ts("receivedAt"),
    cancelledBy: text("cancelledBy"),
    cancelledAt: ts("cancelledAt"),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("warehouse_transfer_from_idx").on(t.fromWarehouseId),
    index("warehouse_transfer_to_idx").on(t.toWarehouseId),
    index("warehouse_transfer_status_idx").on(t.status),
    // No DB `check()` here: this schema has never used one — every rule of that
    // kind lives in a transition's `guard`, including "a hub cannot transfer to
    // itself". Following that is a choice, not an oversight.
  ],
)
```

`transferRiderId` exists as its own field rather than reusing a leg's rider
because reusing `deliveryRiderId` would drop the parcel into a delivery rider's
queue while it is travelling to a *different hub* — corrupting their run sheet
with a parcel they will never deliver.

### `warehouse_transfer_item` — which parcels are on it

```ts
export const warehouseTransferItem = pgTable(
  "warehouse_transfer_item",
  {
    id: text("id").primaryKey().default(sql`gen_entity_code('TRI', nextval('warehouse_transfer_item_id_seq'))`),
    transferId: text("transferId").notNull()
      // `restrict`, not `cascade`. A transfer that has carried parcels is a
      // record of a handover, and cascading would let deleting the header
      // erase the evidence — the items would go with it the moment receipt
      // cleared `order.transferId` and nothing else pinned the row down.
      // An abandoned transfer is CANCELLED, never deleted; that matches the
      // audit posture everywhere else here.
      .references(() => warehouseTransfer.id, { onDelete: "restrict" }),
    orderId: text("orderId").notNull()
      .references(() => order.id, { onDelete: "restrict" }),
    addedAt: ts("addedAt").notNull().defaultNow(),
  },
  (t) => [
    // `uniqueIndex`, matching the composite precedent (`zone_pricing_pair_uniq`).
    uniqueIndex("warehouse_transfer_item_uniq").on(t.transferId, t.orderId),
    index("warehouse_transfer_item_order_idx").on(t.orderId),
    index("warehouse_transfer_item_transfer_idx").on(t.transferId),
  ],
)
```

**The one constraint that cannot be an index.** `unique(transferId, orderId)`
stops a parcel appearing twice on *one* transfer, but nothing stops it appearing
on two *in-flight* transfers — and the two facts live in different tables, so a
partial unique index on `orderId` cannot see the transfer's status.

Two options, and this is a real choice:

| | Guard in the transition | Denormalise `inFlight` onto the item |
|---|---|---|
| Consistency window | one transaction — safe | also safe, but a column that can desync |
| Style | matches this codebase: rules live in `guard` | a second source of truth |
| Cost | a read before every add | always correct without the read |

**Recommendation: the guard.** It is where every other invariant in
`transitions.ts` already lives, and an item can only be added inside a
transaction that has the transfer locked anyway.

## How the existing schema changes

Additive only — **no existing row is rewritten**, so no data migration.

| Table | Change | Why |
|---|---|---|
| `order` | **+ `transferId`** (nullable FK → `warehouse_transfer`, `onDelete: "restrict"`) | the board answers "where is this going" without a join on a read-hot surface |
| `order` | `warehouseId` **unchanged until receipt** | the whole point — A keeps ownership until arrival |
| `order` | **+ status `IN_TRANSFER`** in `orderStatuses` | rides every existing mechanism (labels, badges, ranks, board lanes, audit) |
| — | new sequences, 2 tables | above |

`transferId` is a deliberate denormalisation, and it buys that by creating an
invariant the code must hold:

> `order.transferId !== null` **⟺** `order.status === 'IN_TRANSFER'`

Both sides are written by exactly two transitions, each setting both fields in
the same transaction — so the invariant has one writer per direction rather than
being maintained by convention across the codebase. That is the cost, stated
rather than buried.

## The transitions

```
IN_WAREHOUSE (at A) ──dispatch-transfer──► IN_TRANSFER ──receive-transfer──► IN_WAREHOUSE (at B)
                             │                                           │
                    transfer.status = IN_TRANSIT              transfer.status = RECEIVED
                    order.warehouseId = A (unchanged)         order.warehouseId = B
                    order.transferId = transfer               order.transferId = null
```

**`dispatch-transfer`** — *authorise* `WAREHOUSE_ADMIN`, and `session.warehouseId`
must equal `transfer.fromWarehouseId`. *Guard*: transfer is `OPEN`, has ≥1 item,
each item's `warehouseId` is the source hub, no item already carries a
`transferId`, destination hub is `isActive`. *Build*: header → `IN_TRANSIT`; every
item's order → `status: "IN_TRANSFER"`, `transferId`.

**`receive-transfer`** — *authorise* `WAREHOUSE_ADMIN`, `session.warehouseId` must
equal `transfer.toWarehouseId` (**not** `order.warehouseId` — it is still A's).
*Guard*: transfer is `IN_TRANSIT`. *Build*: header → `RECEIVED`; orders →
`warehouseId: session.warehouseId`, `status: "IN_WAREHOUSE"`,
`receivedAtWarehouseAt`, `receivedByWarehouse`, `transferId: null`.

Both are batch operations over items, so they go through
`applyBulkOrderTransition` rather than a new one-row path.

## What this changes elsewhere

Compiler-driven — `tsc` lists them, exactly as it did for `OUT_FOR_PICKUP`:

- `orderStatuses`, `ORDER_STATUS_LABELS`, `ORDER_STATUS_TONES`, `STATUS_RANK`
- the timeline's steps and the public tracking page's three maps

Not compiler-driven, and this is where it goes wrong:

- **`buildWarehouseOrderScope` stays untouched.** Because `warehouseId` does not
  flip, A's board is correct with no edit — and B's incoming queue needs a
  *new, separate* query over the transfer join rather than an OR bolted onto the
  shared predicate.
- **`receive` must refuse `IN_TRANSFER`** — it guards on `PICKED_UP`, so this
  falls out for free; worth asserting rather than assuming.
- **`dispatch` (to a delivery rider) must refuse `IN_TRANSFER`**, as must
  auto-assign's `ACTIVE_DELIVERY_STATUSES`.
- **`CANCELLABLE_ORDER_STATUSES`** — decide monotonically. `IN_WAREHOUSE` is
  cancellable, so a parcel parked in an open transfer should be too; once
  `IN_TRANSIT` it is on a truck and should not be.
- **COD settlement is unaffected until receipt** — `warehouseId` still points at
  A, so A still owns the balance. Responsibility moves on arrival, which is the
  behaviour the concept wanted.
- **Board**: decide whether `IN_TRANSFER` gets its own lane or a badge on
  `In warehouse`. Its own lane is consistent; a badge keeps the board to five
  conceptual columns.
- Seed, `order-status-lists.spec.ts` (the guard will flag the cancel window
  automatically), and e2e.

## Migration

`pnpm db:generate` → a new `drizzle/postgres/0005_*.sql`, applied by
`pnpm db:migrate` — which is what CI and the e2e job run, not `db:push`.

- Adds: 2 tables, 1 sequence, 1 nullable column on `order`
- Rewrites: **nothing** — existing orders get `transferId = NULL` and keep their
  status, so no backfill and no downtime
- Rollback is *not* free: dropping the column orphans rows that reference it, so
  a revert needs a destructive migration after the feature stops writing

## Still open

1. **Does `IN_TRANSFER` get a board lane?** (above — needs deciding, not deriving)
2. **Can B reject a single parcel, or only the whole transfer?** The item table
   has `rejectedAt` in anticipation; the receipt semantics do not.
3. **Is transfer restricted to hubs in the same zone?** `delivery_city` →
   `warehouse` gives a natural grouping, but nothing requires it yet.
4. **Who may build a transfer but not dispatch it?** One role today
   (`WAREHOUSE_ADMIN`); a builder/dispatcher split would need a second authorise.

Each is a business rule. None of them can be read off the schema.
