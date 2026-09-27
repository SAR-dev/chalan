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
} from "drizzle-orm/pg-core"
import { emailLogStatuses, emailOutboxStatuses, profileRoles } from "./enums"
import { money, ts } from "./helpers"

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
// A row is inserted by sendMail() for every send attempt that's fully
// resolved (either delivered, or exhausted all retries). This is the
// complete email history shown to Admin/Super Admin — failed_mail above
// remains untouched (and still used for any future manual-resend tooling),
// this table is the superset that also includes successful sends.
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
    // Raw HTML body of the email, stored for inspection in Email Logs.
    body: text("body"),
    // Plain-text version of the email body, stored for manual re-sends.
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
// Email outbox (ROADMAP P1.5)
//
// Durable queue for transactional email. Callers insert a row in the same
// transaction as the domain change (via `enqueueEmail`), so a crash or a frozen
// serverless invocation cannot lose the send. A worker/cron drains due rows
// with `drainEmailOutbox()`, which sends through the existing mailer (writing
// the `email_log` delivery record) and deletes the row on success. Failed rows
// stay for retry with exponential backoff.
// =============================================================================

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    to: text("to").notNull(), // comma-joined if multiple recipients
    subject: text("subject").notNull(),
    html: text("html"),
    text: text("text"),
    status: text("status", { enum: emailOutboxStatuses })
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError"),
    // Earliest time the row may be attempted again (exponential backoff).
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
// =============================================================================

export const platformConfig = pgTable("platform_config", {
  id: text("id").primaryKey().default("default"),
  defaultCodFeePercentage: doublePrecision("defaultCodFeePercentage")
    .notNull()
    .default(1),
  minCodFeePercentage: doublePrecision("minCodFeePercentage")
    .notNull()
    .default(0.5),
  maxCodFeePercentage: doublePrecision("maxCodFeePercentage")
    .notNull()
    .default(5),
  defaultBaseRate: money("defaultBaseRate").notNull().default(0),
  defaultExtraRatePerKg: money("defaultExtraRatePerKg").notNull().default(0),
  defaultFreeWeightKg: doublePrecision("defaultFreeWeightKg")
    .notNull()
    .default(1),
  defaultMaxWeightKg: doublePrecision("defaultMaxWeightKg")
    .notNull()
    .default(3),
  updatedAt: ts("updatedAt").notNull().defaultNow(),
})

// =============================================================================
// Mail (SMTP) configuration
//
// Stores multiple SMTP configs. Only one can be active at a time.
// Super Admins can add, edit, and switch between configs at runtime.
// =============================================================================

export const mailConfig = pgTable("mail_config", {
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
})
