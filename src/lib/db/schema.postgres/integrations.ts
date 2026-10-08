import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { webhookDeliveryStatuses } from "./enums"
import { ts } from "./helpers"
import { merchant } from "./merchants"

// =============================================================================
// Merchant API keys (R2)
//
// A merchant's programmatic credential. One key = one merchant, and the key is
// the *only* thing that authorizes `/api/v1/*` — there is no session and no
// user attached to an API request.
//
// **Only the hash is stored.** The plaintext key is shown once, at creation,
// and never again — not in the list, not in the edit form, not in an audit
// row. `prefix` is the non-secret leading segment (`chl_live_…`) kept purely so
// a merchant can tell two keys apart in a list without the UI needing to store
// the secret. This mirrors how the platform already treats tracking tokens and
// CRON_SECRET: the secret never touches a readable column.
//
// A key row is never hard-deleted — `revokedAt` flips it instead, so an
// incident review can still see that the key existed, when it was last used,
// and which merchant it belonged to.
// =============================================================================

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    // Merchant-chosen label ("Production", "Staging laptop") so a list of keys
    // is meaningful. Not unique — two keys may legitimately share a label.
    label: text("label").notNull(),
    // Non-secret leading segment of the key, for display only.
    prefix: text("prefix").notNull(),
    // SHA-256 of the full key. Never reversible; compared timing-safe.
    keyHash: text("keyHash").notNull(),
    // Free-form scopes, e.g. ["orders:write"]. Empty means the key may only
    // read. Guarded by an allowlist in `src/lib/api-keys.ts`.
    scopes: jsonb("scopes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // null = live. A revoked key is rejected even when the hash still matches.
    revokedAt: ts("revokedAt"),
    // Last successful request, for "is this key still in use?" in the list.
    lastUsedAt: ts("lastUsedAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    // Looked up on every API request by hash, so it must be indexed — and
    // unique, because two keys colliding on a SHA-256 is not a case we can
    // resolve at request time.
    uniqueIndex("api_key_hash_uniq").on(t.keyHash),
    // The merchant's key list, newest first.
    index("api_key_merchant_created_idx").on(t.merchantId, t.createdAt),
  ],
)

// =============================================================================
// Webhook endpoints (R2)
//
// Where a merchant wants order events delivered. One row per URL; the secret is
// used to HMAC-sign each payload so the receiver can verify it came from us.
//
// `events` is a jsonb array of event names (`order.created`,
// `order.delivered`, …). An empty array means "every event" — the same
// "unspecified means all" rule the query params use elsewhere. `isActive` is the
// kill switch that does not lose the configuration.
// =============================================================================

export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // Per-endpoint signing secret. Stored in plaintext because the receiver has
    // to be shown it in order to verify a signature, and HMAC verification is
    // symmetric — unlike an API key, where we are the only verifier.
    secret: text("secret").notNull(),
    events: jsonb("events")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean("isActive").notNull().default(true),
    // Consecutive failures; reset on any success. Drives auto-disable so a dead
    // endpoint stops consuming delivery rows.
    failureCount: integer("failureCount").notNull().default(0),
    disabledAt: ts("disabledAt"),
    lastDeliveredAt: ts("lastDeliveredAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("webhook_endpoint_merchant_idx").on(t.merchantId)],
)

// =============================================================================
// Webhook deliveries (R2)
//
// One row per (event × endpoint), written inside the same transaction as the
// state change. The drain route (`/api/cron/drain-webhooks`) POSTs them and
// records the outcome, so a delivery that fails because *we* were down is
// retried rather than lost — the same contract `email_outbox` already provides.
//
// `payload` is the exact JSON body that was (or will be) signed. It is stored
// rather than rebuilt at send time so the signature and the bytes a receiver
// verifies always agree, even if the order changes between enqueue and send.
// =============================================================================

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    endpointId: text("endpointId")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    // Event name, e.g. `order.delivered`. Kept as a plain column so the drain
    // can filter without parsing `payload`.
    event: text("event").notNull(),
    // The order this event is about, when there is one. Nullable because R3
    // will reuse this outbox for events with no order behind them.
    orderId: text("orderId"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    // Deduplication handle handed to the receiver, so a retried delivery is
    // recognisable as the same event rather than a new one.
    eventId: text("eventId").notNull(),
    status: text("status", { enum: webhookDeliveryStatuses })
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError"),
    nextAttemptAt: ts("nextAttemptAt").notNull().defaultNow(),
    deliveredAt: ts("deliveredAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    // The drain's claim query: pending rows, oldest first.
    index("webhook_delivery_status_next_attempt_idx").on(
      t.status,
      t.nextAttemptAt,
    ),
    index("webhook_delivery_endpoint_idx").on(t.endpointId),
    // "Show me everything we ever sent this merchant", for the docs page.
    index("webhook_delivery_merchant_created_idx").on(
      t.merchantId,
      t.createdAt,
    ),
  ],
)
