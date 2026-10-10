import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core"
import { profileRoles } from "./enums"
import { ts } from "./helpers"
import { merchant } from "./merchants"
import { rider, warehouse } from "./warehouses"

// =============================================================================
// Better Auth tables
//
// Better Auth manages its own migrations and talks to Postgres directly
// (see lib/auth.ts: `database: pool`), so it never reads these Drizzle
// definitions. They exist solely to give the app typed access for queries and
// joins. The SQL shape here MUST stay in sync with whatever Better Auth
// creates in the database — if Better Auth changes a column, update it here.
//
// Column names are camelCase because that is what Better Auth requires.
// Better Auth generates and injects its own IDs, so no $defaultFn is needed.
// =============================================================================

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
    // Required by the better-auth admin plugin
    role: text("role"),
    banned: boolean("banned"),
    banReason: text("banReason"),
    banExpires: ts("banExpires"),
    // Required by the better-auth two-factor plugin
    twoFactorEnabled: boolean("twoFactorEnabled").default(false),
    // Account-activation flow: SHA-256 hash of the single-use
    // token emailed to invited staff (moderators, warehouse admins). The raw
    // token never touches the database; cleared on successful activation.
    activationToken: text("activationToken"),
    activationTokenExpiresAt: ts("activationTokenExpiresAt"),
    // Consent record: which version of the Terms/Privacy the account holder
    // accepted, and when.
    //
    // Stamped server-side from config, never from the request body — a client
    // that could choose its own timestamp or version could forge an acceptance.
    // Nullable on purpose: an account created outside the UI forms, or by a
    // caller that does not attest, records nothing rather than a consent nobody
    // actually gave. Without this there is no way to show which wording a given
    // user agreed to once the documents are revised.
    termsAcceptedAt: ts("termsAcceptedAt"),
    termsVersion: text("termsVersion"),
  },
  (t) => [
    index("user_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("user_email_trgm_idx").using("gin", sql`${t.email} gin_trgm_ops`),
    // `admin/users` and `admin/team` both default to `ORDER BY createdAt DESC`
    //. The table only ever had two trigram GINs, so every page
    // turn sorted the whole user set.
    index("user_created_at_idx").on(t.createdAt),
    // `POST /api/auth/activate` is unauthenticated and looks the row up by this
    // value, so every click on an activation link scanned the whole table
    //. Partial: activated accounts hold NULL and cost nothing.
    index("user_activation_token_idx")
      .on(t.activationToken)
      .where(sql`${t.activationToken} is not null`),
  ],
)

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    // Set when an admin impersonates a user (required by better-auth >=1.7)
    impersonatedBy: text("impersonatedBy"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("session_user_id_idx").on(t.userId),
    // Used by the expired-session cleanup job (DELETE WHERE expiresAt < now())
    index("session_expires_at_idx").on(t.expiresAt),
  ],
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: ts("accessTokenExpiresAt"),
    refreshTokenExpiresAt: ts("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expiresAt").notNull(),
    createdAt: ts("createdAt").defaultNow(),
    updatedAt: ts("updatedAt").defaultNow(),
  },
  (t) => [
    // Better Auth looks up verification records by identifier (email address)
    index("verification_identifier_idx").on(t.identifier),
  ],
)

// =============================================================================
// Two-factor authentication (better-auth twoFactor plugin)
//
// One row per user while TOTP is enrolled. `secret` holds the plugin's
// symmetric-encrypted TOTP secret and `backupCodes` the encrypted recovery
// codes — neither is ever returned to the client (plugin marks them
// `returned: false`).
// =============================================================================

export const twoFactor = pgTable(
  "twoFactor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backupCodes").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failedVerificationCount").default(0),
    lockedUntil: ts("lockedUntil"),
  },
  (t) => [
    index("two_factor_user_id_idx").on(t.userId),
    index("two_factor_secret_idx").on(t.secret),
  ],
)

// =============================================================================
// Platform profile (extends a Better Auth user with role + domain links)
// userId is the PK and comes from Better Auth — no $defaultFn needed.
// =============================================================================

export const profile = pgTable(
  "profile",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: profileRoles }).notNull(),
    phone: text("phone").notNull().default(""),
    isActive: boolean("isActive").notNull().default(true),
    // DataTable's default rows-per-page when the caller doesn't pass an
    // explicit `pageSize` prop. Clamped to 1-250 at the validation layer
    // (lib/validation.ts) and again defensively in components/data-table.tsx.
    tableRowsPerPage: integer("tableRowsPerPage").notNull().default(20),
    // When the user last looked at the announcements feed. The badge counts
    // live announcements published after this - "new since you last visited
    // the board", not per-item read receipts (announcements are broadcasts;
    // per-item state would rebuild the notification model that belongs to
    // R4.1). Null = never visited, so everything live counts as new.
    announcementsSeenAt: ts("announcementsSeenAt"),
    // When the user last opened the in-app notification inbox. The badge counts
    // their notifications created after this — the same watermark shape as
    // `announcementsSeenAt`, because both are "what's new since you last
    // looked", not per-item read receipts. Null = never looked, so everything
    // counts as new. Stamped with `GREATEST` so a stale client cannot re-badge
    // notifications it has already seen.
    notificationsSeenAt: ts("notificationsSeenAt"),
    // Domain entity references. Only the field matching the user's role is
    // expected to be populated. FKs with `ON DELETE SET NULL` so removing the
    // domain row unlinks the account instead of leaving a dangling id
    warehouseId: text("warehouseId").references(() => warehouse.id, {
      onDelete: "set null",
    }), // WAREHOUSE_ADMIN: the warehouse they manage
    merchantId: text("merchantId").references(() => merchant.id, {
      onDelete: "set null",
    }), // MERCHANT: their merchant business
    riderId: text("riderId").references(() => rider.id, {
      onDelete: "set null",
    }), // RIDER: their rider profile
    // Merchant moderator accounts. `isModerator` distinguishes
    // staff from the merchant owner; `moderatorPermissions` holds the nav
    // hrefs the owner granted (jsonb array, null for owners). `activatedAt`
    // is set once the invitee clicks their activation link — null + isActive
    // false = PENDING, non-null + isActive false = DEACTIVATED.
    isModerator: boolean("isModerator").notNull().default(false),
    moderatorPermissions: jsonb("moderatorPermissions").$type<string[]>(),
    activatedAt: ts("activatedAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("profile_role_idx").on(t.role),
    index("profile_rider_id_idx").on(t.riderId),
    // Hot moderator/owner lookups filter by merchant; warehouse rosters by
    // Warehouse.
    index("profile_merchant_id_idx").on(t.merchantId),
    index("profile_warehouse_id_idx").on(t.warehouseId),
    index("profile_phone_trgm_idx").using("gin", sql`${t.phone} gin_trgm_ops`),
  ],
)
