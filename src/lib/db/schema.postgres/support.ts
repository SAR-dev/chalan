import { createId } from "@paralleldrive/cuid2"
import { index, pgTable, text } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { profileRoles, supportStatuses } from "./enums"
import { ts } from "./helpers"

// =============================================================================
// Support tickets
//
// One row per in-app support request from any authenticated role (merchant,
// warehouse admin, rider, admin). `actorName` / `actorRole` are denormalized
// at create time so the admin list renders the requester without a join.
// The MVP allows a single admin reply (`adminReply`) and the status lifecycle
// OPEN → ANSWERED → CLOSED; replies are not a separate table yet.
// =============================================================================

export const supportTicket = pgTable(
  "support_ticket",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorName: text("actorName").notNull(),
    actorRole: text("actorRole", { enum: profileRoles }).notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: supportStatuses }).notNull().default("OPEN"),
    adminReply: text("adminReply"),
    repliedAt: ts("repliedAt"),
    repliedBy: text("repliedBy"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("support_ticket_status_created_at_idx").on(t.status, t.createdAt),
    index("support_ticket_user_id_idx").on(t.userId),
  ],
)
