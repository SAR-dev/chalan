import { NextResponse } from "next/server"
import { z } from "zod"
import {
  MAX_BULK_ORDERS,
  MAX_TABLE_ROWS_PER_PAGE,
  ORDER_DELIVERY_TYPES,
  PACKAGE_RULE_TYPES,
  PROFILE_ROLES,
  RIDER_TASK_TYPES,
  RIDER_VEHICLE_TYPES,
} from "@/lib/constants"
import { isAllowedOrigin } from "@/lib/csrf"

export const idsSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, "At least one ID is required")
    .max(100, "Maximum 100 items per bulk operation"),
})

/**
 * Client-side validation helper. Runs a Zod schema against form data and
 * returns a flat `Record<string, string>` of field-level errors suitable for
 * display in a form-level error banner. Returns an empty object when valid.
 */
export function validateFormData<T extends z.ZodType>(
  schema: T,
  data: unknown,
): Record<string, string> {
  const result = schema.safeParse(data)
  if (result.success) return {}
  const flattened = z.flattenError(result.error)
  const fieldErrors = flattened.fieldErrors as Record<string, string[]>
  const out: Record<string, string> = {}
  for (const [key, msgs] of Object.entries(fieldErrors)) {
    if (msgs && msgs.length > 0) out[key] = msgs[0]
  }
  return out
}

export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<
  { data: z.infer<T>; error: null } | { data: null; error: NextResponse }
> {
  // CSRF — reject cross-site requests up front. Browsers attach Origin to
  // state-changing same/cross-origin requests, so any mismatch cannot come
  // from a legitimate page in this app.
  if (!isAllowedOrigin(req)) {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      ),
    }
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    raw = undefined
  }

  // Treat a missing or unparseable body as an empty object so that schemas
  // where every field is optional (e.g. orderCancelSchema) still pass.
  // Zod 4 rejects `undefined` for z.object() even when all fields are optional.
  if (raw === undefined) {
    raw = {}
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path,
      message: i.message,
    }))
    return {
      data: null,
      error: NextResponse.json(
        {
          error: "Invalid request body",
          issues,
        },
        { status: 400 },
      ),
    }
  }

  return { data: result.data, error: null }
}

export function formatError(
  data:
    | {
        error?: string
        issues?: Array<{ path: (string | number)[]; message: string }>
      }
    | null
    | undefined,
  fallback = "Request failed.",
): string {
  if (!data || !data.issues || data.issues.length === 0) {
    return data?.error ?? fallback
  }
  const msgs = data.issues.map((i) => {
    const field = i.path
      .filter((p) => typeof p === "string")
      .join(" ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
    return field ? `${field}: ${i.message}` : i.message
  })
  return msgs.length > 0 ? msgs.join(". ") : (data.error ?? fallback)
}

const requiredString = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)

// Bangladeshi phone number validation
const BD_PHONE_REGEX = /^(?:\+?880|0)?1[3-9]\d{8}$/

export function isValidBdPhone(phone: string): boolean {
  const normalized = phone.replace(/[\s-]/g, "")
  return BD_PHONE_REGEX.test(normalized)
}

/** Email shape check for client-side gating — e.g. enabling the "Send test
 * email" button before a recipient is typed. The server re-validates every
 * address with its own schema; this only decides whether a button may be
 * pressed. */
export function isValidEmail(value: string): boolean {
  return z.email().safeParse(value).success
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "")
  if (cleaned.startsWith("+880")) return `0${cleaned.slice(4)}`
  if (cleaned.startsWith("880")) return `0${cleaned.slice(3)}`
  if (cleaned.startsWith("0")) return cleaned
  return `0${cleaned}`
}

const bdPhone = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .refine(isValidBdPhone, {
      message: `Invalid Bangladeshi phone number. Format: 01XXXXXXXXX`,
    })

// Accepts either an absolute URL (e.g. an externally hosted image) or a
// site-relative upload path served by app/uploads/[...path]/route.ts — the
// local storage driver returns paths like "/uploads/avatars/<id>/<uuid>.png",
// which z.url() alone would reject.
const imageUrl = (label: string) =>
  z
    .string({ error: `${label} must be a valid URL` })
    .trim()
    .refine((v) => v.startsWith("/") || z.url().safeParse(v).success, {
      error: `${label} must be a valid URL`,
    })

/**
 * Attested by the signup form, which blocks submission until the box is ticked.
 *
 * `.optional()` so an API caller that never attests records **no** consent —
 * see `user.termsAcceptedAt`, which stays null rather than claiming agreement
 * nobody gave. `z.literal(true)` rejects `false` outright: a refusal must not
 * be storable as though it were an acceptance. The value itself is discarded
 * after validation; the server stamps the timestamp and version from config so
 * a client cannot back-date its own acceptance.
 */
const termsAcceptedField = z.literal(true).optional()

export const merchantRegisterSchema = z.object({
  businessName: requiredString("Business name"),
  ownerName: requiredString("Owner name"),
  email: z.email("A valid email is required"),
  phone: bdPhone("Phone"),
  address: requiredString("Address"),
  businessType: z
    .enum([
      "E-commerce",
      "Restaurant",
      "Grocery",
      "Pharmacy",
      "Fashion",
      "Electronics",
      "Other",
    ])
    .optional()
    .transform((v) => v ?? "Other"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  termsAccepted: termsAcceptedField,
})

export const warehouseCreateSchema = z.object({
  name: requiredString("Warehouse name"),
  address: requiredString("Address"),
  city: requiredString("City"),
})

export const warehouseUpdateSchema = z
  .object({
    name: requiredString("Warehouse name").optional(),
    address: requiredString("Address").optional(),
    city: requiredString("City").optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.address !== undefined ||
      d.city !== undefined ||
      d.isActive !== undefined,
    { error: "Provide at least one field to update" },
  )

// NOTE: there is deliberately no per-merchant weight limit schema. The maximum
// parcel weight belongs to the lane (`zone_pricing.maxWeightKg`), so one zone
// pair means one limit. See the note on the `merchant` table.

/**
 * Platform settings. Deliberately small: delivery/COD/cancellation rates are
 * per-lane `zone_pricing` rows, so there is no platform-wide price to set here.
 */
export const platformConfigSchema = z.object({
  refundOnCancel: z.boolean().optional(),
})

// Disabling 2FA requires a *current* second factor — a live TOTP
// code or one of the remaining recovery codes — even though the caller is
// already signed in.
export const twoFactorDisableSchema = z.object({
  code: z
    .string({ error: "Verification code is required" })
    .trim()
    .min(1, "Verification code is required")
    .max(64, "Verification code is too long"),
})

const noteField = (label: string) =>
  z.string().trim().max(100, `${label} cannot exceed 100 characters`).nullish()

/**
 * What is in the parcel, as free text.
 *
 * Optional, and a blank submission is stored as NULL rather than "" so
 * "did not say" stays distinguishable from "said nothing useful" when the field
 * is later grouped or counted. The cap is a single line of a label — enough for
 * "saree", "cooked food", "phone charger" — and stops the field being used as
 * free-form notes that nothing will ever read.
 */
const itemTypeField = () =>
  z
    .string()
    .trim()
    .max(60, "Item type cannot exceed 60 characters")
    .nullish()
    .transform((v) => (v ? v.replace(/\s+/g, " ") : null))

/**
 * The recipient's email — optional, because most orders are placed by a
 * merchant who has only ever collected a phone number.
 *
 * Blank means "did not say" and is stored as NULL rather than "": they look
 * identical in a text input and are not identical in the database, and NULL is
 * exactly what the future unsubscribe path needs to be able to skip.
 *
 * 254 is the RFC 5321 limit on a whole address (64 for the local part plus 253
 * for the domain), so anything longer is malformed rather than merely unusual.
 */
const recipientMailField = () =>
  z
    .string({ error: "Recipient email must be a valid email address" })
    .trim()
    .max(254, "Recipient email cannot exceed 254 characters")
    .nullish()
    .refine((v) => !v || z.email().safeParse(v).success, {
      error: "Recipient email must be a valid email address",
    })
    .transform((v) => v || null)

export const orderCreateSchema = z.object({
  pickupLocationId: requiredString("Pickup location"),
  recipientName: requiredString("Recipient name"),
  recipientPhone: bdPhone("Recipient phone"),
  recipientMail: recipientMailField(),
  deliveryAddress: requiredString("Delivery address"),
  deliveryCityId: requiredString("Delivery city"),
  deliveryMapLink: z
    .url("Map link must be a valid URL")
    .or(z.literal(""))
    .nullish(),
  parcelWeightKg: z.number().positive("Parcel weight must be greater than 0"),
  itemType: itemTypeField(),
  deliveryType: z.enum(ORDER_DELIVERY_TYPES).optional(),
  productCost: z.number().nonnegative("Product cost cannot be negative"),
  merchantNote: noteField("Merchant note"),
})

export const orderReceiverNoteSchema = z.object({
  receiverNote: z
    .string()
    .trim()
    .max(100, "Receiver note cannot exceed 100 characters")
    .min(1, "Note cannot be empty"),
  // Public write authorization: the order's tracking token.
  token: requiredString("Tracking token"),
})

export const orderMerchantNoteSchema = z.object({
  merchantNote: z
    .string()
    .trim()
    .max(100, "Merchant note cannot exceed 100 characters")
    .min(1, "Note cannot be empty"),
})

export const orderBulkCreateSchema = z.object({
  orders: z
    .array(orderCreateSchema)
    .min(1, "At least one order is required")
    .max(
      MAX_BULK_ORDERS,
      `You can create up to ${MAX_BULK_ORDERS} orders at a time`,
    ),
})

export const orderAssignPickupRiderSchema = z.object({
  riderId: requiredString("riderId"),
})

export const orderDispatchSchema = z.object({
  riderId: requiredString("riderId"),
})

/**
 * A promised delivery day, set by an admin or warehouse admin.
 *
 * Sent as a calendar day rather than an instant because the day is what gets
 * promised ("by the 9th") — the server expands it to the end of that Dhaka day,
 * the same boundary `computeExpectedDeliveryAt` uses when it quotes from the
 * zone matrix, so an override and a quote are never on different calendars.
 */
export const orderSetExpectedDeliverySchema = z.object({
  date: z
    .string({ error: "A delivery date is required" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Delivery date must be YYYY-MM-DD"),
})

export const orderPickedUpSchema = z.object({
  proofRefs: z
    .array(imageUrl("Each pickup proof photo"))
    .min(1, "At least one pickup proof photo is required")
    .max(10, "You can add up to 10 pickup proof photos"),
  // The rider may correct the parcel weight at pickup (re-prices the delivery).
  parcelWeightKg: z
    .number()
    .positive("Parcel weight must be greater than 0")
    .optional(),
})

export const orderDeliveredSchema = z.object({
  proofRef: z.string().trim().min(1).optional(),
  // COD actually collected. Omitted = the full productCost.
  // The route rejects a value above the order's expected COD.
  amountCollected: z
    .number()
    .nonnegative("Collected amount cannot be negative")
    .optional(),
  // Required by the transition when amountCollected is below the expected COD.
  shortfallReason: z.string().trim().max(300).optional(),
})

export const orderFailedSchema = z.object({
  note: requiredString("A reason note"),
})

export const orderReturnSchema = z.object({
  reason: requiredString("A return reason"),
})

export const orderCancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(100, "Reason cannot exceed 100 characters")
    .optional(),
})

export const payoutCreateSchema = z.object({
  payoutMethod: requiredString("Payout method"),
  payoutDetails: requiredString("Account details"),
})

export const payoutRejectSchema = z.object({
  reason: requiredString("A rejection reason"),
})

export const balancePaymentSchema = z.object({
  amount: z
    .number({ error: "Amount must be a number" })
    .positive("Amount must be greater than zero"),
  paymentMethod: requiredString("Payment method"),
  paymentAccount: requiredString("Account / reference"),
  note: z.string().trim().optional(),
})

export const balancePaymentRejectSchema = z.object({
  reason: requiredString("A rejection reason"),
})

export const packageRequestSchema = z.object({
  note: z.string().trim().optional(),
})

export const packageRequestReviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    reason: requiredString("A rejection reason"),
  }),
])

export const packageUpsertSchema = z.object({
  name: requiredString("Package name"),
  description: z.string().trim().optional(),
  price: z
    .number({ error: "Price must be a number" })
    .min(0, "Price cannot be negative"),
  isActive: z.boolean().optional(),
})

export const packageTierUpsertSchema = z.object({
  orderCount: z
    .number({ error: "Order count must be a number" })
    .int("Order count must be a whole number")
    .min(1, "Order count must be at least 1"),
  ruleType: z.enum(PACKAGE_RULE_TYPES, {
    error: "Select a valid rule type",
  }),
  ruleValue: z
    .number({ error: "Rule value must be a number" })
    .min(0, "Rule value cannot be negative"),
  sortOrder: z.number().int().optional(),
})

/** PERCENT_OFF values are capped at 100; FLAT values are unbounded. */
export function validateTierRule(
  ruleType: (typeof PACKAGE_RULE_TYPES)[number],
  ruleValue: number,
): string | null {
  if (ruleType === "PERCENT_OFF" && ruleValue > 100) {
    return "A percentage discount cannot exceed 100."
  }
  return null
}

export const balanceAdjustSchema = z.object({
  amount: z
    .number({ error: "Amount must be a number" })
    .refine((v) => v !== 0, "Amount cannot be zero"),
  note: requiredString("A note explaining the adjustment"),
})

const riderTaskTypeSchema = z.enum(RIDER_TASK_TYPES, {
  error: "Select a valid task type",
})

const riderVehicleTypeSchema = z.enum(RIDER_VEHICLE_TYPES, {
  error: "Select a valid vehicle type",
})

/**
 * Registration number. Upper-cased and space-stripped so "dhaka 12-3456" and
 * "DHAKA-123456" are the same plate — the same value typed two ways is one
 * vehicle, and an admin comparing it against a photo should not have to guess.
 * A blank value clears the plate, which is a real state (a foot or bicycle
 * rider has no plate).
 *
 * The `undefined` passthrough in the transform is load-bearing, not defensive.
 * Zod's `.nullish()` alone would leave an absent key absent, but attaching a
 * plain `.transform()` makes the key materialise on EVERY parse — so
 * `parse({ name: "New" })` would come back carrying `vehiclePlate: null` and a
 * PATCH that only renames a rider would silently erase its vehicle. Returning
 * `undefined` for an absent input is what keeps "not mentioned" distinct from
 * "cleared", which is exactly the distinction the update route relies on.
 */
const riderVehiclePlateSchema = z
  .string()
  .trim()
  .max(20, "Vehicle plate cannot exceed 20 characters")
  .nullish()
  .transform((v) => {
    // `undefined` (key absent) stays absent; `null` (key present) is a clear and
    // stays null; a string is normalized, and a blank one becomes null.
    if (v === undefined || v === null) return v
    return v.toUpperCase().replace(/\s+/g, "") || null
  })

export const riderApplySchema = z.object({
  name: requiredString("Name"),
  email: z.email("A valid email is required"),
  phone: bdPhone("Phone"),
  zone: requiredString("Zone"),
  address: requiredString("Address"),
  nidNumber: requiredString("NID number"),
  nidFrontImage: z.string().trim().optional(),
  nidBackImage: z.string().trim().optional(),
  nidSelfieImage: z.string().trim().optional(),
  warehouseId: requiredString("Warehouse"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Both optional, and they have to be: the plate only applies to a subset of
  // vehicles (see `VEHICLE_TYPES_REQUIRING_PLATE`), so no applicant can satisfy
  // it universally, and someone without a motorbike yet is a legitimate
  // applicant. The approver sees whatever is submitted rather than a blank
  // field — see `rider-application-detail-dialog`.
  vehicleType: riderVehicleTypeSchema.nullish(),
  vehiclePlate: riderVehiclePlateSchema,
  termsAccepted: termsAcceptedField,
})

export const riderApproveSchema = z.object({
  taskType: riderTaskTypeSchema.default("DELIVERY"),
  warehouseId: z.string().trim().optional(),
  // Captured at approval rather than left for later. This is the one moment the
  // admin is guaranteed to be looking at the rider's details and thinking about
  // what they can carry — ask then or the field sits unset until someone
  // remembers, which for most fleets is never. Both stay optional so approving
  // is never blocked on a detail that does not apply (a bicycle has no plate).
  vehicleType: riderVehicleTypeSchema.nullish(),
  vehiclePlate: riderVehiclePlateSchema,
})

export const riderApplicationRejectSchema = z.object({
  reason: requiredString("A rejection reason"),
})

export const riderUpdateSchema = z
  .object({
    name: requiredString("Name").optional(),
    phone: bdPhone("Phone").optional(),
    zone: requiredString("Zone").optional(),
    warehouseId: requiredString("Warehouse").optional(),
    taskType: riderTaskTypeSchema.optional(),
    vehicleType: riderVehicleTypeSchema.nullish(),
    vehiclePlate: riderVehiclePlateSchema,
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.phone !== undefined ||
      d.zone !== undefined ||
      d.warehouseId !== undefined ||
      d.taskType !== undefined ||
      d.vehicleType !== undefined ||
      d.vehiclePlate !== undefined ||
      d.isActive !== undefined,
    { error: "Provide at least one field to update" },
  )

export const profileUpdateSchema = z
  .object({
    name: requiredString("Name").optional(),
    // `null` clears the avatar; a string sets it; omitted leaves it unchanged.
    image: imageUrl("Avatar").nullish(),
    phone: bdPhone("Phone").optional(),
    tableRowsPerPage: z
      .int("Rows per page must be a whole number")
      .min(1, "Rows per page must be at least 1")
      .max(
        MAX_TABLE_ROWS_PER_PAGE,
        `Rows per page cannot exceed ${MAX_TABLE_ROWS_PER_PAGE}`,
      )
      .optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.image !== undefined ||
      d.phone !== undefined ||
      d.tableRowsPerPage !== undefined,
    { error: "Provide at least one field to update" },
  )

export const pickupLocationSchema = z.object({
  label: requiredString("Pickup Location name"),
  address: requiredString("Address"),
  cityId: requiredString("City"),
  mapLink: z.url("Map link must be a valid URL").optional().or(z.literal("")),
})

export const merchantProfileSchema = z.object({
  businessName: requiredString("Business name"),
  email: z.email("A valid email is required"),
  phone: bdPhone("Phone"),
  address: requiredString("Address"),
})

export const nidSubmitSchema = z.object({
  nidFrontImage: requiredString("NID front image"),
  nidBackImage: requiredString("NID back image"),
  nidSelfieImage: requiredString("NID selfie image"),
  nidNumber: z.string().trim().optional(),
})

export const nidReviewSchema = z.object({
  action: z.enum(["approve", "reject"], {
    error: "action must be 'approve' or 'reject'",
  }),
  reason: z
    .string()
    .trim()
    .max(500, "Reason cannot exceed 500 characters")
    .optional(),
})

export const teamCreateSchema = z.object({
  name: requiredString("Name"),
  email: z.email("A valid email is required"),
  phone: bdPhone("Phone"),
  role: z.enum(["WAREHOUSE_ADMIN"], { error: "Invalid role" }),
  warehouseId: z.string().nullish(),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

// ─── Merchant moderators ─────────────────────────────────────

export const moderatorCreateSchema = z.object({
  name: requiredString("Name"),
  email: z.email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  permissions: z
    .array(z.string())
    .min(1, "Grant access to at least one section"),
})

export const moderatorUpdateSchema = z
  .object({
    permissions: z
      .array(z.string())
      .min(1, "Grant access to at least one section")
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.permissions !== undefined || v.isActive !== undefined, {
    error: "Nothing to update",
  })

export const activationSchema = z.object({
  token: requiredString("Activation token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

/** SUPER_ADMIN-managed moderator quota (0–20) on the merchant detail page. */
export const merchantModeratorQuotaSchema = z.object({
  maxModerators: z
    .number()
    .int("Quota must be a whole number")
    .min(0, "Quota cannot be negative")
    .max(20, "Quota cannot exceed 20"),
})

export const announcementRoles = PROFILE_ROLES

export const warehouseAssignSchema = z.object({
  warehouseId: z.string().min(1).nullable(),
})

export const announcementCreateSchema = z.object({
  title: requiredString("Title"),
  // Markdown body — capped so a single announcement can't bloat the row or
  // the active-list response (which ships up to 50 of them in one payload).
  content: requiredString("Content").max(
    20_000,
    "Content must be 20000 characters or fewer",
  ),
  publishedAt: z.string().datetime({ offset: true }).nullish(),
  expiresAt: z.string().datetime({ offset: true }).nullish(),
  isActive: z.boolean().optional(),
  targetRoles: z
    .array(z.enum(announcementRoles), {
      error: "At least one role is required",
    })
    .min(1, "At least one target role is required"),
})

export const announcementUpdateSchema = z
  .object({
    title: requiredString("Title").optional(),
    content: requiredString("Content")
      .max(20_000, "Content must be 20000 characters or fewer")
      .optional(),
    publishedAt: z.string().datetime({ offset: true }).nullish(),
    expiresAt: z.string().datetime({ offset: true }).nullish(),
    isActive: z.boolean().optional(),
    targetRoles: z
      .array(z.enum(announcementRoles))
      .min(1, "At least one target role is required")
      .optional(),
  })
  .refine(
    (d) =>
      d.title !== undefined ||
      d.content !== undefined ||
      d.publishedAt !== undefined ||
      d.expiresAt !== undefined ||
      d.isActive !== undefined ||
      d.targetRoles !== undefined,
    { error: "Provide at least one field to update" },
  )

// ---------------------------------------------------------------------------
// Delivery cities
// ---------------------------------------------------------------------------

export const deliveryCityCreateSchema = z.object({
  name: requiredString("City name"),
  warehouseId: requiredString("Warehouse"),
  zoneId: requiredString("Delivery zone"),
})

export const deliveryCityUpdateSchema = z.object({
  name: requiredString("City name").optional(),
  warehouseId: requiredString("Warehouse").optional(),
  zoneId: requiredString("Delivery zone").optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Delivery zones
// ---------------------------------------------------------------------------

export const deliveryZoneCreateSchema = z.object({
  name: requiredString("Zone name"),
})

export const deliveryZoneUpdateSchema = z.object({
  name: requiredString("Zone name").optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Zone-to-zone pricing
// ---------------------------------------------------------------------------

export const zonePricingCreateSchema = z.object({
  fromZoneId: requiredString("Origin zone"),
  toZoneId: requiredString("Destination zone"),
  baseRate: z.number().nonnegative("Base rate cannot be negative"),
  extraRatePerKg: z.number().nonnegative("Extra rate cannot be negative"),
  freeWeightKg: z.number().nonnegative("Free weight cannot be negative"),
  maxWeightKg: z.number().positive("Max weight must be greater than 0"),
  codFeePercentage: z.number().nonnegative("COD fee cannot be negative"),
  cancellationFee: z
    .number()
    .nonnegative("Cancellation fee cannot be negative")
    .optional(),
})

export const zonePricingUpdateSchema = z.object({
  baseRate: z.number().nonnegative().optional(),
  extraRatePerKg: z.number().nonnegative().optional(),
  freeWeightKg: z.number().nonnegative().optional(),
  maxWeightKg: z.number().positive().optional(),
  codFeePercentage: z.number().nonnegative().optional(),
  cancellationFee: z.number().nonnegative().optional(),
})

/**
 * A lane's delivery time, in days from order creation.
 *
 * `0` is allowed — same-day is a real answer for a hub and its own city — and
 * the ceiling exists only to catch a fat-fingered year rather than to encode a
 * business limit.
 */
export const zoneDeliveryTimeCreateSchema = z.object({
  fromZoneId: requiredString("Origin zone"),
  toZoneId: requiredString("Destination zone"),
  deliveryDays: z
    .number()
    .int("Delivery days must be a whole number")
    .min(0, "Delivery days cannot be negative")
    .max(365, "Delivery days must be 365 or fewer"),
})

/**
 * Editing a lane's delivery time in place.
 *
 * The zone pair is deliberately excluded: it is the row's identity (the unique
 * index on (fromZoneId, toZoneId)), so retargeting a row would mean deleting
 * one lane and creating another — a different operation with a different
 * conflict shape. Only the day count is editable here; `deliveryDays` stays
 * optional so a PATCH with no meaningful change still validates.
 */
export const zoneDeliveryTimeUpdateSchema = z.object({
  deliveryDays: z
    .number()
    .int("Delivery days must be a whole number")
    .min(0, "Delivery days cannot be negative")
    .max(365, "Delivery days must be 365 or fewer")
    .optional(),
})

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export const supportCreateSchema = z.object({
  subject: requiredString("Subject")
    .min(3, "Subject must be at least 3 characters")
    .max(150, "Subject cannot exceed 150 characters"),
  message: requiredString("Message")
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message cannot exceed 2000 characters"),
})

// Admin reply (optional) and/or a close (status must be CLOSED). At least one
// of the two is required so an empty PATCH can never reach the route.
export const supportReplySchema = z
  .object({
    adminReply: z
      .string({ error: "A reply is required" })
      .trim()
      .min(1, "Reply cannot be empty")
      .max(2000, "Reply cannot exceed 2000 characters")
      .optional(),
    status: z.enum(["CLOSED"], { error: "Only CLOSED can be set" }).optional(),
  })
  .refine((d) => d.adminReply !== undefined || d.status !== undefined, {
    error: "Provide a reply or close the ticket",
  })

export const userPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const userBanSchema = z.object({
  reason: requiredString("Reason")
    .min(3, "Reason must be at least 3 characters")
    .max(200, "Reason cannot exceed 200 characters"),
  expiresInDays: z
    .number()
    .int("Duration must be a whole number of days")
    .min(1, "Duration must be at least 1 day")
    .max(365, "Duration cannot exceed 365 days")
    .optional(),
})

// ---------------------------------------------------------------------------
// Mail configuration
// ---------------------------------------------------------------------------

export const createMailConfigSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  secure: z.boolean(),
  user: z.string().min(1, "User is required"),
  pass: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Invalid email"),
  fromName: z.string().min(1, "From name is required"),
})

/** Diagnostic send from the Add Config dialog, before the config is saved. */
export const testMailSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  secure: z.boolean(),
  user: z.string().min(1, "User is required"),
  pass: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Invalid email"),
  fromName: z.string().min(1, "From name is required"),
  // Defaults to fromEmail; lets a caller route the test to any address.
  to: z.string().email("Invalid email").optional(),
})

/** Public "resend my activation email" request. */
export const resendVerificationSchema = z.object({
  email: z.email("A valid email is required"),
})

/**
 * Bulk assign a rider to a set of orders. Shared by the dispatch and
 * assign-pickup-rider endpoints — the bodies are identical.
 */
export const bulkAssignRiderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  riderId: z.string().min(1, "Rider is required"),
})

/**
 * Ask the planner which rider each of these parcels should go to. A read, not
 * a write — the caller applies the returned plan through the ordinary bulk
 * dispatch endpoint, so the `dispatch` transition still has the last word.
 */
export const autoAssignPlanSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
})

/** Admin direct-assign of a package to a merchant (ops override / comp). */
export const packageAssignSchema = z.object({
  packageId: z.string().min(1, "Package is required"),
})
