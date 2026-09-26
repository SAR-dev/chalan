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
    // Required by the better-auth two-factor plugin (ROADMAP H4)
    twoFactorEnabled: boolean("twoFactorEnabled").default(false),
    // Account-activation flow (ROADMAP 5.2): SHA-256 hash of the single-use
    // token emailed to invited staff (moderators, warehouse admins). The raw
    // token never touches the database; cleared on successful activation.
    activationToken: text("activationToken"),
    activationTokenExpiresAt: ts("activationTokenExpiresAt"),
  },
  (t) => [
    index("user_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("user_email_trgm_idx").using("gin", sql`${t.email} gin_trgm_ops`),
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
// Two-factor authentication (better-auth twoFactor plugin — ROADMAP H4)
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
    // Domain entity references. Stored as plain text (no FK constraint) to avoid
    // circular dependencies between the profile table and its referents.
    // Only the field matching the user's role is expected to be populated.
    warehouseId: text("warehouseId"), // WAREHOUSE_ADMIN: the warehouse they manage
    merchantId: text("merchantId"), // MERCHANT: their merchant business
    riderId: text("riderId"), // RIDER: their rider profile
    // Merchant moderator accounts (ROADMAP 5.2). `isModerator` distinguishes
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
    index("profile_phone_trgm_idx").using("gin", sql`${t.phone} gin_trgm_ops`),
  ],
)
