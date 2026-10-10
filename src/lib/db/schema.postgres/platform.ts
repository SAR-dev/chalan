import { createId } from "@paralleldrive/cuid2"
import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { emailLogStatuses, emailOutboxStatuses, profileRoles } from "./enums"
import { ts } from "./helpers"

// =============================================================================
// Failed mail log — REMOVED
//
// `failed_mail` was a write-only table inserted by `mailer.ts` and never read
// (superseded by `email_log`, which records failed sends with
// `status = 'FAILED'`). Dropped in favour of email_log — see the 2026-09 audit.
// =============================================================================

// =============================================================================
// Email log
//
// A row is inserted by sendMail() for every send attempt (one attempt per
// email — no retries). SENT rows are the delivery record; FAILED rows are kept
// so failed mail is retained in the DB for review or manual re-send. This is
// the complete email history shown to Admin/Super Admin.
// =============================================================================

export const emailLog = pgTable(
  "email_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    to: text("to").notNull(), // comma-joined if multiple recipients
    subject: text("subject").notNull(),
    status: text("status", { enum: emailLogStatuses }).notNull(),
    // Number of attempts made before resolving (1 = succeeded on first try).
    attempts: integer("attempts").notNull(),
    // Populated only when status is FAILED.
    error: text("error"),
    // Plain-text version of the email body, stored for inspection in Email
    // Logs and for manual re-sends. The HTML version is NOT stored.
    textBody: text("textBody"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
    // Populated only when an Admin/Super Admin manually overrides a FAILED
    // entry to SENT (e.g. after confirming delivery or resending by hand).
    markedSentBy: text("markedSentBy"),
    markedSentAt: ts("markedSentAt"),
  },
  (t) => [
    index("email_log_status_idx").on(t.status),
    index("email_log_created_at_idx").on(t.createdAt),
    index("email_log_to_trgm_idx").using("gin", sql`${t.to} gin_trgm_ops`),
    index("email_log_subject_trgm_idx").using(
      "gin",
      sql`${t.subject} gin_trgm_ops`,
    ),
  ],
)

// =============================================================================
// Email outbox
//
// Durable queue for transactional email. Callers insert a row in the same
// transaction as the domain change (via `enqueueEmail`), so a crash or a frozen
// serverless invocation cannot lose the send. A worker/cron drains due rows
// with `drainEmailOutbox()`, which sends through the existing mailer (writing
// the `email_log` delivery record) and deletes the row on success, or marks it
// FAILED. Rows are attempted once and never retried; only the plain-text body
// is stored.
// =============================================================================

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    to: text("to").notNull(), // comma-joined if multiple recipients
    subject: text("subject").notNull(),
    text: text("text"),
    status: text("status", { enum: emailOutboxStatuses })
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError"),
    // Earliest time the row may be attempted. With no retries this is always
    // the enqueue time; kept for the initial deliver-by contract.
    nextAttemptAt: ts("nextAttemptAt").notNull().defaultNow(),
    sentAt: ts("sentAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("email_outbox_status_next_attempt_idx").on(t.status, t.nextAttemptAt),
    index("email_outbox_created_at_idx").on(t.createdAt),
  ],
)

// =============================================================================
// Announcements
//
// Created by Admins and Super Admins; targeted at one or more platform roles.
// An announcement is "live" when isActive=true, publishedAt <= now, and either
// expiresAt is null or expiresAt > now. targetRoles is a jsonb array of Role
// values — same pattern as payoutRequest.orderIds.
// =============================================================================

export const announcement = pgTable(
  "announcement",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    title: text("title").notNull(),
    content: text("content").notNull(),
    // When the announcement becomes visible. Null = not yet scheduled (draft).
    publishedAt: ts("publishedAt"),
    // When it stops being visible. Null = no expiry.
    expiresAt: ts("expiresAt"),
    // Master toggle — allows admins to pull an announcement without deleting it.
    isActive: boolean("isActive").notNull().default(true),
    // Which roles this announcement targets. Stored as jsonb array of Role strings.
    targetRoles: jsonb("targetRoles").$type<string[]>().notNull(),
    // Name of the admin who created the announcement (matches the approvedBy pattern).
    createdBy: text("createdBy").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("announcement_is_active_idx").on(t.isActive),
    index("announcement_published_at_idx").on(t.publishedAt),
    index("announcement_expires_at_idx").on(t.expiresAt),
    index("announcement_title_trgm_idx").using(
      "gin",
      sql`${t.title} gin_trgm_ops`,
    ),
  ],
)

// =============================================================================
// In-app notification
//
// One row per recipient per raised event. Unlike `announcement` — a broadcast
// everybody reads — a notification is addressed: it is written for the users who
// can act on it, so there is no `targetRoles` fan-out at read time and no
// per-item read receipt either. "What's new" is one watermark on the profile
// (`profile.notificationsSeenAt`), the same shape `announcementsSeenAt` uses.
//
// The `notification_read` table that a per-item receipt model would need is
// still absent on purpose; `announcement_read` was built and removed for the
// same reason.
// =============================================================================

export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    // The recipient. Read as the "mine" filter on every inbox query.
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // One of ORDER_EVENTS (src/lib/order-events.ts). Kept as text rather than a
    // PG enum so a new event is a one-line schema change, matching `webhook_delivery.event`.
    event: text("event").notNull(),
    // Null for platform money events with no order behind them.
    orderId: text("orderId"),
    // Which merchant this fact belongs to. Not a read filter — the inbox reads
    // by `userId` — but the only way to answer "why did this account get this?"
    // without joining back through the order, which money events have none of.
    merchantId: text("merchantId"),
    // Who acted, when the emitter knows it. Null for system-generated facts.
    actorName: text("actorName"),
    // The headline, stored so the row is readable on its own. Derived from
    // `event` at write time; `notificationTitleForEvent` owns the copy.
    title: text("title").notNull(),
    // Deep link, resolved by `notificationHrefForEvent` at read time.
    href: text("href").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    // The inbox query: "my notifications, newest first". Without this it is a
    // seq scan per poll, and the tray polls.
    index("notification_user_created_idx").on(t.userId, t.createdAt),
    // Backs the retention sweep — the only other query that scans by age.
    index("notification_created_at_idx").on(t.createdAt),
  ],
)

// =============================================================================
// Announcement read state — REMOVED
//
// `announcement_read` (one row per announcement × user) was built for this
// feature and then deleted: announcements are broadcasts, not per-recipient
// messages, so per-item read receipts rebuilt the notification model that
// in-app notifications now own. The state is one timestamp on the profile row
// (`profile.announcementsSeenAt` = when you last looked at the feed) and the
// badge counts live announcements published after it.
// =============================================================================

// =============================================================================
// Audit log
//
// A generic, append-only trail of state-changing actions taken by Admin /
// Super Admin (and, where relevant, Warehouse Admin / Merchant / Rider)
// accounts. Visible only to Admin and Super Admin. Rows are written through
// the single lib/audit.ts#logAudit() helper — never inserted ad hoc — so the
// shape stays consistent across every call site.
// =============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    actorId: text("actorId"), // profile.userId of whoever performed the action
    actorName: text("actorName").notNull(),
    actorRole: text("actorRole", { enum: profileRoles }).notNull(),
    // Short machine-readable verb, e.g. "ORDER_APPROVED", "MERCHANT_SUSPENDED".
    action: text("action").notNull(),
    // The kind of entity affected, e.g. "order", "merchant", "payout_request".
    entityType: text("entityType").notNull(),
    entityId: text("entityId"),
    // Human-readable summary shown directly in the table, e.g.
    // "Approved order ORD-0042".
    description: text("description").notNull(),
    // Optional structured context (old/new values, etc.) for future drill-down.
    metadata: jsonb("metadata"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_actor_name_trgm_idx").using(
      "gin",
      sql`${t.actorName} gin_trgm_ops`,
    ),
    index("audit_log_action_trgm_idx").using(
      "gin",
      sql`${t.action} gin_trgm_ops`,
    ),
    index("audit_log_entity_type_trgm_idx").using(
      "gin",
      sql`${t.entityType} gin_trgm_ops`,
    ),
    index("audit_log_description_trgm_idx").using(
      "gin",
      sql`${t.description} gin_trgm_ops`,
    ),
  ],
)

// =============================================================================
// Platform configuration
//
// Delivery/COD/cancellation fees are NOT here — they live per lane in
// `zone_pricing` (one row per ordered zone pair). A lane with no row is an
// unconfigured lane, and order creation rejects it rather than inheriting a
// platform-wide rate; the dashboard coverage list surfaces the gaps.
// =============================================================================

export const platformConfig = pgTable("platform_config", {
  id: text("id").primaryKey().default("default"),
  minCodFeePercentage: doublePrecision("minCodFeePercentage")
    .notNull()
    .default(0.5),
  maxCodFeePercentage: doublePrecision("maxCodFeePercentage")
    .notNull()
    .default(5),
  // Whether a cancelled order is refunded its creation charge.
  // true = refund (default); false = the merchant keeps the fee.
  refundOnCancel: boolean("refundOnCancel").notNull().default(true),
  // R9 scan gates: platform-wide toggles for the three QR-scan points. The scan
  // is an accelerator, never a gate — turning these off removes the scan UI
  // from the rider flow entirely; the transition body never changes either way.
  pickupScanRequired: boolean("pickupScanRequired").notNull().default(true),
  deliveryScanRequired: boolean("deliveryScanRequired").notNull().default(true),
  // Rider collects the parcel from the warehouse for delivery
  // (`out-for-delivery` transition).
  warehouseScanRequired: boolean("warehouseScanRequired")
    .notNull()
    .default(true),
  // Warehouse admin receives the parcel from the rider (`receive` transition).
  warehouseReceiveScanRequired: boolean("warehouseReceiveScanRequired")
    .notNull()
    .default(true),
  updatedAt: ts("updatedAt").notNull().defaultNow(),
})

// =============================================================================
// Mail (SMTP) configuration
//
// Stores multiple SMTP configs. Only one can be active at a time.
// Super Admins can add, edit, and switch between configs at runtime.
// =============================================================================

export const mailConfig = pgTable(
  "mail_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    label: text("label").notNull(), // human-friendly name, e.g. "Primary SMTP"
    host: text("host").notNull(),
    port: text("port").notNull().default("587"),
    secure: boolean("secure").notNull().default(false),
    user: text("user").notNull(),
    pass: text("pass").notNull(),
    fromEmail: text("fromEmail").notNull(),
    fromName: text("fromName").notNull().default("Delivery Management"),
    isActive: boolean("isActive").notNull().default(false),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  // "Only one active" is an invariant the app maintains by deactivating every
  // row before activating one, which a partial unique index turns from a
  // convention into a fact: a second active row cannot be inserted even if a
  // future code path forgets the deactivation step. Same shape as the
  // one-default rule on `label_template`.
  (t) => [
    uniqueIndex("mail_config_one_active_uniq")
      .on(t.isActive)
      .where(sql`${t.isActive} = true`),
  ],
)

// =============================================================================
// Cron heartbeat
//
// One row per scheduled job, upserted after each successful run, so "did cron
// stop?" becomes `max(lastRanAt) GROUP BY job` rather than a guess read off log
// lines nobody aggregates.
//
// A dedicated table rather than `audit_log` on purpose: `drain-email-outbox`
// runs every minute, which would be 1440 rows/day into a table that already has
// its own 30-day retention job — and it would couple "is the scheduler alive?"
// to whether someone changed that retention.
// =============================================================================

export const cronRun = pgTable(
  "cron_run",
  {
    /** Route name, e.g. `cleanup-audit-logs`. */
    job: text("job").primaryKey(),
    lastRanAt: ts("lastRanAt").notNull().defaultNow(),
    durationMs: integer("durationMs"),
    /** False when the run completed but reported failures. */
    ok: boolean("ok").notNull().default(true),
    lastError: text("lastError"),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    // The watchdog scans "oldest last run", so this is the only index it needs.
    index("cron_run_last_ran_at_idx").on(t.lastRanAt),
  ],
)
