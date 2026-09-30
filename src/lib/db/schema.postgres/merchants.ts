import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { merchantStatuses } from "./enums"
import { ts } from "./helpers"
import { deliveryCity } from "./logistics"

// =============================================================================
// Merchants (standalone entity — owner contact info stored here directly)
// =============================================================================

export const merchant = pgTable(
  "merchant",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('MER', nextval('merchant_id_seq'))`),
    businessName: text("businessName").notNull(),
    // Owner contact details captured at registration.
    ownerName: text("ownerName").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    businessType: text("businessType", {
      enum: [
        "E-commerce",
        "Restaurant",
        "Grocery",
        "Pharmacy",
        "Fashion",
        "Electronics",
        "Other",
      ],
    })
      .notNull()
      .default("Other"),
    // Onboarding — set when merchant completes the setup wizard.
    onboardingCompletedAt: ts("onboardingCompletedAt"),
    status: text("status", { enum: merchantStatuses })
      .notNull()
      .default("PENDING"),
    // NOTE: deliberately no per-merchant weight limit. The maximum parcel weight
    // belongs to the lane — `zone_pricing.maxWeightKg` — so one zone pair means
    // one limit and a merchant cannot disagree with it. See `order-pricing.ts`.
    // Moderator quota (ROADMAP 5.2): how many ACTIVE+PENDING staff logins the
    // owner may hold. SUPER_ADMIN-managed (0 = moderators disabled).
    maxModerators: integer("maxModerators").notNull().default(3),
    // Email verification — set when merchant verifies their email.
    emailVerifiedAt: ts("emailVerifiedAt"),
    emailVerificationToken: text("emailVerificationToken"),
    emailVerificationExpiresAt: ts("emailVerificationExpiresAt"),
    // Phone verification — set when merchant verifies their phone.
    phoneVerifiedAt: ts("phoneVerifiedAt"),
    phoneVerificationOtp: text("phoneVerificationOtp"),
    phoneVerificationExpiresAt: ts("phoneVerificationExpiresAt"),
    // Soft reference (user id) to the admin who approved this merchant.
    // Null until an admin acts on the PENDING application.
    approvedBy: text("approvedBy"),
    approvedAt: ts("approvedAt"),
    // NID verification — merchant uploads front/back/selfie images for admin review.
    nidFrontImage: text("nidFrontImage"),
    nidBackImage: text("nidBackImage"),
    nidSelfieImage: text("nidSelfieImage"),
    nidNumber: text("nidNumber"),
    nidSubmittedAt: ts("nidSubmittedAt"),
    nidVerifiedAt: ts("nidVerifiedAt"),
    nidVerifiedBy: text("nidVerifiedBy"),
    nidRejectedAt: ts("nidRejectedAt"),
    nidRejectedBy: text("nidRejectedBy"),
    nidRejectionReason: text("nidRejectionReason"),
    // Branding — merchant-specific color + platform-branding toggle. The
    // business name is the brand mark (no logos).
    brandColor: text("brandColor"),
    hidePlatformBranding: boolean("hidePlatformBranding")
      .notNull()
      .default(false),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    // Also serves plain `WHERE status = …` (status is the leading column).
    index("merchant_status_created_at_idx").on(t.status, t.createdAt),
    index("merchant_created_at_idx").on(t.createdAt),
    // `user.email` is unique; the merchant link must be too or a
    // check-then-insert race can create duplicate merchant rows per email.
    uniqueIndex("merchant_email_unique").on(t.email),
    index("merchant_email_verified_at_idx").on(t.emailVerifiedAt),
    index("merchant_nid_submitted_at_idx").on(t.nidSubmittedAt),
    index("merchant_nid_verified_at_idx").on(t.nidVerifiedAt),
    index("merchant_nid_rejected_at_idx").on(t.nidRejectedAt),
    index("merchant_business_name_trgm_idx").using(
      "gin",
      sql`${t.businessName} gin_trgm_ops`,
    ),
    index("merchant_owner_name_trgm_idx").using(
      "gin",
      sql`${t.ownerName} gin_trgm_ops`,
    ),
    index("merchant_email_trgm_idx").using("gin", sql`${t.email} gin_trgm_ops`),
    index("merchant_phone_trgm_idx").using("gin", sql`${t.phone} gin_trgm_ops`),
    // NID search uses ILIKE (ROADMAP P1.6).
    index("merchant_nid_number_trgm_idx").using(
      "gin",
      sql`${t.nidNumber} gin_trgm_ops`,
    ),
  ],
)

// =============================================================================
// Pickup locations (simplified: no city, no is_default)
// =============================================================================

export const pickupLocation = pgTable(
  "pickup_location",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_entity_code('PKL', nextval('pickup_location_id_seq'))`),
    merchantId: text("merchantId")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    address: text("address").notNull(),
    // City this pickup location is in. The warehouse is derived from the city.
    cityId: text("cityId")
      .notNull()
      .references(() => deliveryCity.id, { onDelete: "restrict" }),
    // Optional map link (e.g. Google Maps URL) so riders can pinpoint the shop.
    mapLink: text("mapLink"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    index("pickup_location_merchant_id_idx").on(t.merchantId),
    index("pickup_location_city_id_idx").on(t.cityId),
  ],
)
