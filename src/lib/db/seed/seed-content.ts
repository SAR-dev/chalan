// Seed configuration — all data is deterministic, edit entity arrays here.
// Every entity has a stable ID and predictable values.

import type { warehouse } from "@/lib/db/schema"

// ---------------------------------------------------------------------------
// Credentials — single source of truth for role/email/password.
// Every seeded "user" (admin, merchant, rider, e2e fixture) gets one entry
// here. Everything downstream (SEED_ADMIN_USERS, SEED_MERCHANTS,
// SEED_RIDERS, SEED_CREDENTIALS, E2E_CREDENTIALS, ...) reads from this
// object instead of re-typing the email/password.
// ---------------------------------------------------------------------------
export type SeedRole = "SUPER_ADMIN" | "WAREHOUSE_ADMIN" | "MERCHANT" | "RIDER"

export interface SeedUserCredential {
  email: string
  password: string
  role: SeedRole
}

export const SEED_USER_CREDENTIALS = {
  // Admins
  admin1: {
    email: "admin01@email.com",
    password: "admin123",
    role: "SUPER_ADMIN",
  },
  admin2: {
    email: "admin02@email.com",
    password: "admin123",
    role: "SUPER_ADMIN",
  },
  admin3: {
    email: "admin03@email.com",
    password: "admin123",
    role: "SUPER_ADMIN",
  },
  warehouseAdmin1: {
    email: "warehouse.admin01@email.com",
    password: "warehouse123",
    role: "WAREHOUSE_ADMIN",
  },
  warehouseAdmin2: {
    email: "warehouse.admin02@email.com",
    password: "warehouse123",
    role: "WAREHOUSE_ADMIN",
  },

  // Merchants
  merchant1: {
    email: "merchant1@app.com",
    password: "merchant123",
    role: "MERCHANT",
  },
  merchant2: {
    email: "merchant2@app.com",
    password: "merchant123",
    role: "MERCHANT",
  },
  merchant3: {
    email: "merchant3@app.com",
    password: "merchant123",
    role: "MERCHANT",
  },
  merchant4: {
    email: "merchant4@app.com",
    password: "merchant123",
    role: "MERCHANT",
  },
  merchant5: {
    email: "merchant5@app.com",
    password: "merchant123",
    role: "MERCHANT",
  },
} as const satisfies Record<string, SeedUserCredential>

// Riders are bulk-generated, so their credentials are generated the same
// way instead of being typed out by hand.
function buildRiderCredentials(
  count: number,
): Record<string, SeedUserCredential> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `rider${i + 1}`,
      {
        email: `rider${i + 1}@app.com`,
        password: "rider123",
        role: "RIDER" as const,
      },
    ]),
  )
}

const PENDING_RIDER_CREDENTIAL: SeedUserCredential = {
  email: "pending.rider@app.com",
  password: "rider123",
  role: "RIDER",
}

// ---------------------------------------------------------------------------
// Explicit: Warehouses (logistics hubs)
// ---------------------------------------------------------------------------
export const SEED_WAREHOUSES: (typeof warehouse.$inferInsert)[] = [
  {
    id: "b5mujkfyyq6qqw5t1unbm8b7",
    name: "Dhaka Central Hub",
    address: "Plot 22, Tejgaon Industrial Area",
    city: "Dhaka",
    managedBy: null,
    isActive: true,
  },
  {
    id: "op3s6e6t0q4oaerl6boqng1r",
    name: "Chattogram Port Hub",
    address: "Agrabad Commercial Area, Block C",
    city: "Chattogram",
    managedBy: null,
    isActive: true,
  },
  {
    id: "u9kbfapo43wkoj65972psioh",
    name: "Sylhet Regional Depot",
    address: "Zindabazar Main Road",
    city: "Sylhet",
    managedBy: null,
    isActive: false,
  },
]

// ---------------------------------------------------------------------------
// Explicit: Admin / Super Admin / Warehouse Admin users
// (known credentials for the login page credential picker)
// ---------------------------------------------------------------------------
export interface AdminUserConfig {
  name: string
  email: string
  password: string
  phone: string
  role: "SUPER_ADMIN" | "WAREHOUSE_ADMIN"
  isActive: boolean
  warehouseId?: string | null
}

export const SEED_ADMIN_USERS: AdminUserConfig[] = [
  {
    name: "Admin01",
    ...SEED_USER_CREDENTIALS.admin1,
    phone: "+8801711000001",
    isActive: true,
  },
  {
    name: "Admin02",
    ...SEED_USER_CREDENTIALS.admin2,
    phone: "+8801711000010",
    isActive: true,
  },
  {
    name: "Admin03",
    ...SEED_USER_CREDENTIALS.admin3,
    phone: "+8801711000011",
    isActive: true,
  },
  {
    name: "WarehouseAdmin01",
    ...SEED_USER_CREDENTIALS.warehouseAdmin1,
    phone: "+8801711000020",
    isActive: true,
    warehouseId: "b5mujkfyyq6qqw5t1unbm8b7",
  },
  {
    name: "WarehouseAdmin02",
    ...SEED_USER_CREDENTIALS.warehouseAdmin2,
    phone: "+8801711000021",
    isActive: false,
    warehouseId: "op3s6e6t0q4oaerl6boqng1r",
  },
]

// ---------------------------------------------------------------------------
// Counts for bulk-generated entities
// ---------------------------------------------------------------------------
export const SEED_COUNTS = {
  merchants: 5,
  riders: 10,
  orders: 100,
  payoutRequests: 2,
  payoutLinkedOrders: 2,
  announcements: 6,
  auditLogs: 5,
  emailLogs: 3,
}

const RIDER_CREDENTIALS = buildRiderCredentials(SEED_COUNTS.riders)

// ---------------------------------------------------------------------------
// Stable warehouse IDs — referenced by riders, orders, etc.
// ---------------------------------------------------------------------------
export const WAREHOUSE_IDS = {
  dhakaCentralHub: "b5mujkfyyq6qqw5t1unbm8b7",
  chattogramPortHub: "op3s6e6t0q4oaerl6boqng1r",
  sylhetRegionalDepot: "u9kbfapo43wkoj65972psioh",
} as const

// ---------------------------------------------------------------------------
// Admin names (visible in UI, used in order.approvedBy etc.)
// ---------------------------------------------------------------------------
export const ADMIN_USER_NAMES = {
  nadia: "Admin01",
  tanvir: "Admin02",
  sadia: "Admin03",
  rifat: "WarehouseAdmin01",
  maliha: "WarehouseAdmin02",
} as const

// ---------------------------------------------------------------------------
// Deterministic: Merchants (5)
// Each entry carries the user password so the seed module can create accounts.
// ---------------------------------------------------------------------------
export interface MerchantSeedEntry {
  id: string
  businessName: string
  ownerName: string
  email: string
  password: string
  phone: string
  address: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED"
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
  baseRate: number
  extraRatePerKg: number
  maxWeightKg: number
  freeWeightKg: number
  approvedBy: string | null
  approvedAt: string | null
  nidFrontImage: string | null
  nidBackImage: string | null
  nidSelfieImage: string | null
  nidSubmittedAt: string | null
  nidVerifiedAt: string | null
  nidVerifiedBy: string | null
}

export const MERCHANT_IDS = {
  merchant1: "seed_merchant_1",
  merchant2: "seed_merchant_2",
  merchant3: "seed_merchant_3",
  merchant4: "seed_merchant_4",
  merchant5: "seed_merchant_5",
} as const

export const SEED_MERCHANTS: MerchantSeedEntry[] = [
  {
    id: MERCHANT_IDS.merchant1,
    businessName: "Merchant 1 Business",
    ownerName: "Owner 1",
    email: SEED_USER_CREDENTIALS.merchant1.email,
    password: SEED_USER_CREDENTIALS.merchant1.password,
    phone: "+8801711000101",
    address: "100 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-01T00:00:00.000Z",
    phoneVerifiedAt: "2026-07-01T00:00:00.000Z",
    baseRate: 50,
    extraRatePerKg: 10,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-02T00:00:00.000Z",
    nidFrontImage: "data:image/png;base64,seed_nid_front",
    nidBackImage: "data:image/png;base64,seed_nid_back",
    nidSelfieImage: "data:image/png;base64,seed_nid_selfie",
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant2,
    businessName: "Merchant 2 Business",
    ownerName: "Owner 2",
    email: SEED_USER_CREDENTIALS.merchant2.email,
    password: SEED_USER_CREDENTIALS.merchant2.password,
    phone: "+8801711000102",
    address: "200 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-02T00:00:00.000Z",
    phoneVerifiedAt: "2026-07-02T00:00:00.000Z",
    baseRate: 60,
    extraRatePerKg: 15,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-03T00:00:00.000Z",
    nidFrontImage: "data:image/png;base64,seed_nid_front",
    nidBackImage: "data:image/png;base64,seed_nid_back",
    nidSelfieImage: "data:image/png;base64,seed_nid_selfie",
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant3,
    businessName: "Merchant 3 Business",
    ownerName: "Owner 3",
    email: SEED_USER_CREDENTIALS.merchant3.email,
    password: SEED_USER_CREDENTIALS.merchant3.password,
    phone: "+8801711000103",
    address: "300 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-03T00:00:00.000Z",
    phoneVerifiedAt: "2026-07-03T00:00:00.000Z",
    baseRate: 70,
    extraRatePerKg: 20,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-04T00:00:00.000Z",
    nidFrontImage: "data:image/png;base64,seed_nid_front",
    nidBackImage: "data:image/png;base64,seed_nid_back",
    nidSelfieImage: "data:image/png;base64,seed_nid_selfie",
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant4,
    businessName: "Merchant 4 Business",
    ownerName: "Owner 4",
    email: SEED_USER_CREDENTIALS.merchant4.email,
    password: SEED_USER_CREDENTIALS.merchant4.password,
    phone: "+8801711000104",
    address: "400 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-04T00:00:00.000Z",
    phoneVerifiedAt: null,
    baseRate: 80,
    extraRatePerKg: 25,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: "System",
    approvedAt: "2026-07-04T00:00:00.000Z",
    nidFrontImage: "data:image/png;base64,seed_nid_front",
    nidBackImage: "data:image/png;base64,seed_nid_back",
    nidSelfieImage: "data:image/png;base64,seed_nid_selfie",
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant5,
    businessName: "Merchant 5 Business",
    ownerName: "Owner 5",
    email: SEED_USER_CREDENTIALS.merchant5.email,
    password: SEED_USER_CREDENTIALS.merchant5.password,
    phone: "+8801711000105",
    address: "500 Business Street, Dhaka",
    status: "SUSPENDED",
    emailVerifiedAt: "2026-07-04T00:00:00.000Z",
    phoneVerifiedAt: null,
    baseRate: 50,
    extraRatePerKg: 10,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-05T00:00:00.000Z",
    nidFrontImage: "data:image/png;base64,seed_nid_front",
    nidBackImage: "data:image/png;base64,seed_nid_back",
    nidSelfieImage: "data:image/png;base64,seed_nid_selfie",
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
]

// ---------------------------------------------------------------------------
// Deterministic: Riders (30)
// ---------------------------------------------------------------------------
export interface RiderSeedEntry {
  id: string
  name: string
  email: string
  phone: string
  password: string
  zone: string
  address: string
  nidNumber: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "ACTIVE" | "SUSPENDED"
  isActive: boolean
  taskType: "PICKUP" | "DELIVERY" | "BOTH"
  warehouseId: string
}

export const RIDER_IDS: Record<string, string> = Object.fromEntries(
  Array.from({ length: SEED_COUNTS.riders }, (_, i) => [
    `rider${i + 1}`,
    `seed_rider_${i + 1}`,
  ]),
)

const RIDER_TASK_TYPES: ("PICKUP" | "DELIVERY" | "BOTH")[] = [
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
  "PICKUP",
  "DELIVERY",
  "BOTH",
]

export const SEED_RIDERS: RiderSeedEntry[] = Array.from(
  { length: SEED_COUNTS.riders },
  (_, i) => ({
    id: `seed_rider_${i + 1}`,
    name: `Rider ${i + 1}`,
    email: RIDER_CREDENTIALS[`rider${i + 1}`].email,
    phone: `+8801711000${String(100 + i + 1).slice(1)}`,
    password: RIDER_CREDENTIALS[`rider${i + 1}`].password,
    zone: `Zone ${(i % 5) + 1} / Area ${(i % 3) + 1}`,
    address: `${100 + i} Rider Street, Dhaka`,
    nidNumber: `123456789${String(i + 1).padStart(2, "0")}`,
    status: "ACTIVE",
    isActive: i % 5 !== 4,
    taskType: RIDER_TASK_TYPES[i],
    warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
  }),
)

// Add one PENDING rider application for testing the review flow.
SEED_RIDERS.push({
  id: "seed_rider_pending_1",
  name: "Pending Rider",
  email: PENDING_RIDER_CREDENTIAL.email,
  phone: "+8801719999999",
  password: PENDING_RIDER_CREDENTIAL.password,
  zone: "Dhaka South",
  address: "45 Application Road, Dhaka",
  nidNumber: "9999999999",
  status: "PENDING",
  isActive: false,
  taskType: "DELIVERY",
  warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
})

// ---------------------------------------------------------------------------
// Credentials for login (used by e2e tests and credential picker).
// Derived from the seed arrays above — single source of truth.
// ---------------------------------------------------------------------------
function deriveCredentials() {
  const admins = SEED_ADMIN_USERS.filter((u) => u.role === "SUPER_ADMIN")
  const warehouses = SEED_ADMIN_USERS.filter(
    (u) => u.role === "WAREHOUSE_ADMIN",
  )
  const [superAdmin, ...otherAdmins] = admins
  const [warehouseAdmin, ...otherWarehouses] = warehouses
  const [m1, m2] = SEED_MERCHANTS
  const [r1] = SEED_RIDERS.filter((r) => r.status === "ACTIVE")

  const result: Record<string, { email: string; password: string }> = {
    superAdmin: { email: superAdmin.email, password: superAdmin.password },
  }

  otherAdmins.forEach((a, i) => {
    result[i === 0 ? "admin" : `admin${i + 1}`] = {
      email: a.email,
      password: a.password,
    }
  })

  result.warehouseAdmin = {
    email: warehouseAdmin.email,
    password: warehouseAdmin.password,
  }

  otherWarehouses.forEach((w, i) => {
    result[`warehouseAdmin${i === 0 ? "2" : String(i + 2)}`] = {
      email: w.email,
      password: w.password,
    }
  })

  result.merchant1 = { email: m1.email, password: m1.password }
  result.merchant2 = { email: m2.email, password: m2.password }
  result.rider1 = { email: r1.email, password: r1.password }

  return result
}

export const SEED_CREDENTIALS = deriveCredentials()

// ---------------------------------------------------------------------------
// Deterministic: Pickup locations (1 per merchant)
// ---------------------------------------------------------------------------
export interface PickupLocationSeedEntry {
  id: string
  merchantId: string
  label: string
  address: string
  cityId: string
}

export const SEED_PICKUP_LOCATIONS: PickupLocationSeedEntry[] = [
  {
    id: "seed_pickup_1",
    merchantId: MERCHANT_IDS.merchant1,
    label: "Merchant 1 Pickup — 100 Business Street",
    address: "100 Business Street, Dhaka",
    cityId: "seed_city_dhaka",
  },
  {
    id: "seed_pickup_2",
    merchantId: MERCHANT_IDS.merchant2,
    label: "Merchant 2 Pickup — 200 Business Street",
    address: "200 Business Street, Dhaka",
    cityId: "seed_city_dhaka",
  },
  {
    id: "seed_pickup_3",
    merchantId: MERCHANT_IDS.merchant3,
    label: "Merchant 3 Pickup — 300 Business Street",
    address: "300 Business Street, Dhaka",
    cityId: "seed_city_dhaka",
  },
  {
    id: "seed_pickup_4",
    merchantId: MERCHANT_IDS.merchant4,
    label: "Merchant 4 Pickup — 400 Business Street",
    address: "400 Business Street, Dhaka",
    cityId: "seed_city_dhaka",
  },
  {
    id: "seed_pickup_5",
    merchantId: MERCHANT_IDS.merchant5,
    label: "Merchant 5 Pickup — 500 Business Street",
    address: "500 Business Street, Dhaka",
    cityId: "seed_city_dhaka",
  },
]

// ---------------------------------------------------------------------------
// Deterministic: Announcements (6)
// ---------------------------------------------------------------------------
export interface AnnouncementSeedEntry {
  id: string
  title: string
  content: string
  publishedAt: string
  expiresAt: string | null
  isActive: boolean
  targetRoles: string[]
  createdBy: string
}

const ANNOUNCEMENT_TITLES = [
  "System maintenance scheduled",
  "New pickup zones active",
  "Updated delivery rates",
  "Holiday schedule announcement",
  "Platform feature update",
  "Q3 performance bonus",
] as const

const ANNOUNCEMENT_CONTENTS = [
  "The platform will be undergoing scheduled maintenance on July 20th from 2:00 AM to 4:00 AM. During this time, some services may be temporarily unavailable.",
  "We have expanded our pickup zone coverage to include all major districts. Riders can now collect parcels from any active pickup location in their assigned zone.",
  "Delivery rates have been updated effective August 1st. Please review the new rate card on the pricing page for details.",
  "Our offices will remain closed on August 15th for national holiday. Please plan your dispatch and delivery schedules accordingly.",
  "We've added bulk rider assignment, date range filtering, and CSV export to the dispatch page. Check the changelog for the full list.",
  "Top-performing riders and warehouses this quarter will receive a performance bonus. Details will be shared via email.",
]

const ANNOUNCEMENT_TARGET_ROLES: string[][] = [
  ["SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"],
  ["MERCHANT", "RIDER"],
  ["MERCHANT"],
  ["SUPER_ADMIN", "WAREHOUSE_ADMIN", "MERCHANT", "RIDER"],
  ["SUPER_ADMIN", "WAREHOUSE_ADMIN"],
  ["WAREHOUSE_ADMIN", "RIDER"],
]

export const SEED_ANNOUNCEMENTS: AnnouncementSeedEntry[] = Array.from(
  { length: 6 },
  (_, i) => ({
    id: `seed_announcement_${i + 1}`,
    title: ANNOUNCEMENT_TITLES[i],
    content: ANNOUNCEMENT_CONTENTS[i],
    publishedAt: new Date(Date.now() - (i + 1) * 5 * 86400000).toISOString(),
    expiresAt:
      i === 0 ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
    isActive: i < 5,
    targetRoles: ANNOUNCEMENT_TARGET_ROLES[i],
    createdBy: i < 2 ? ADMIN_USER_NAMES.nadia : ADMIN_USER_NAMES.tanvir,
  }),
)

// ---------------------------------------------------------------------------
// Deterministic: Audit logs (5)
// ---------------------------------------------------------------------------
export interface AuditLogSeedEntry {
  id: string
  actorName: string
  actorRole: "SUPER_ADMIN"
  action: string
  entityType: string
  entityId: string
  description: string
  createdAt: string
}

export const SEED_AUDIT_LOGS: AuditLogSeedEntry[] = [
  {
    id: "seed_audit_1",
    actorName: ADMIN_USER_NAMES.nadia,
    actorRole: "SUPER_ADMIN",
    action: "MERCHANT_APPROVED",
    entityType: "merchant",
    entityId: "merchant_1",
    description: "Approved merchant Acme Corp",
    createdAt: "2026-07-10T09:00:00.000Z",
  },
  {
    id: "seed_audit_2",
    actorName: ADMIN_USER_NAMES.tanvir,
    actorRole: "SUPER_ADMIN",
    action: "MERCHANT_APPROVED",
    entityType: "merchant",
    entityId: MERCHANT_IDS.merchant1,
    description: `Approved merchant Merchant 1 Business`,
    createdAt: "2026-07-02T10:00:00.000Z",
  },
  {
    id: "seed_audit_3",
    actorName: ADMIN_USER_NAMES.tanvir,
    actorRole: "SUPER_ADMIN",
    action: "ORDER_APPROVED",
    entityType: "order",
    entityId: "E2E-APPROVED-001",
    description: "Approved order E2E-APPROVED-001",
    createdAt: "2026-07-13T10:00:00.000Z",
  },
  {
    id: "seed_audit_4",
    actorName: ADMIN_USER_NAMES.nadia,
    actorRole: "SUPER_ADMIN",
    action: "PAYOUT_APPROVED",
    entityType: "payout_request",
    entityId: "PR-SEED-001",
    description: "Approved payout request PR-SEED-001",
    createdAt: "2026-07-14T09:00:00.000Z",
  },
  {
    id: "seed_audit_5",
    actorName: ADMIN_USER_NAMES.nadia,
    actorRole: "SUPER_ADMIN",
    action: "TEAM_MEMBER_CREATED",
    entityType: "user",
    entityId: "seed_user_staff_1",
    description: "Created staff account for Staff Member One",
    createdAt: "2026-07-12T14:00:00.000Z",
  },
]

// ---------------------------------------------------------------------------
// Deterministic: Email logs (3)
// ---------------------------------------------------------------------------
export interface EmailLogSeedEntry {
  id: string
  to: string
  subject: string
  body: string
  status: "SENT" | "FAILED"
  attempts: number
  error: string | null
  createdAt: string
}

export const SEED_EMAIL_LOGS: EmailLogSeedEntry[] = [
  {
    id: "seed_email_1",
    to: "merchant1@app.com",
    subject: "[Delivery Management] Your merchant account has been approved",
    body: "Dear Owner 1, your merchant account has been approved. You can now start accepting orders.",
    status: "SENT",
    attempts: 1,
    error: null,
    createdAt: "2026-07-02T10:05:00.000Z",
  },
  {
    id: "seed_email_2",
    to: "merchant2@app.com",
    subject: "[Delivery Management] Your merchant account has been approved",
    body: "Dear Owner 2, your merchant account has been approved. You can now start accepting orders.",
    status: "FAILED",
    attempts: 3,
    error: "Connection timeout after 30s",
    createdAt: "2026-07-03T10:05:00.000Z",
  },
  {
    id: "seed_email_3",
    to: "merchant3@app.com",
    subject: "[Delivery Management] New order notification",
    body: "You have received a new order. Please log in to view details and arrange pickup.",
    status: "SENT",
    attempts: 1,
    error: null,
    createdAt: "2026-07-05T12:00:00.000Z",
  },
]

// =============================================================================
// SEED DATA: Orders, Payout Requests, Merchant Balances
// Used by db:seed:full (index-full.ts)
// =============================================================================

// ---------------------------------------------------------------------------
// Order status distribution for 100 orders
// ---------------------------------------------------------------------------
const ORDER_SEED_STATUSES: (
  | "PENDING"
  | "APPROVED"
  | "PICKED_UP"
  | "IN_WAREHOUSE"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED_ATTEMPT"
  | "RETURNED"
  | "CANCELLED"
)[] = [
  ...Array.from({ length: 8 }, () => "PENDING" as const),
  ...Array.from({ length: 8 }, () => "APPROVED" as const),
  ...Array.from({ length: 8 }, () => "PICKED_UP" as const),
  ...Array.from({ length: 10 }, () => "IN_WAREHOUSE" as const),
  ...Array.from({ length: 10 }, () => "IN_TRANSIT" as const),
  ...Array.from({ length: 10 }, () => "OUT_FOR_DELIVERY" as const),
  ...Array.from({ length: 25 }, () => "DELIVERED" as const),
  ...Array.from({ length: 7 }, () => "FAILED_ATTEMPT" as const),
  ...Array.from({ length: 4 }, () => "RETURNED" as const),
  ...Array.from({ length: 10 }, () => "CANCELLED" as const),
]

const ORDER_SEED_CITIES = [
  "Dhaka",
  "Chattogram",
  "Sylhet",
  "Khulna",
  "Rajshahi",
  "Gazipur",
  "Narayanganj",
  "Comilla",
  "Bogra",
  "Rangpur",
]

const RECIPIENT_NAMES = [
  "Rahim Uddin",
  "Karim Ahmed",
  "Fatima Begum",
  "Nusrat Jahan",
  "Abdul Hamid",
  "Saleha Khatun",
  "Mohammad Ali",
  "Jamal Hossain",
  "Roksana Akter",
  "Sharmin Sultana",
  "Tanvirul Islam",
  "Sumaiya Rahman",
  "Habib Rahman",
  "Nasima Khatun",
  "Fazlul Haque",
  "Monira Begum",
  "Aminul Islam",
  "Shirin Akter",
  "Kamal Hossain",
  "Ruma Ahmed",
]

const PRODUCT_COSTS = [
  500, 800, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7500, 8000,
  9500, 10000, 12000, 15000, 18000, 20000, 25000,
]

const PARCEL_WEIGHTS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]

// ---------------------------------------------------------------------------
// Deterministic: 100 Orders
// ---------------------------------------------------------------------------
export interface OrderSeedEntry {
  id: string
  merchantId: string
  pickupLocationId: string
  recipientName: string
  recipientPhone: string
  deliveryAddress: string
  deliveryCity?: string
  parcelWeightKg: number
  deliveryType: "STANDARD" | "FRAGILE"
  productCost: number
  deliveryFee: number
  codFee: number
  merchantEarnings: number
  status: (typeof ORDER_SEED_STATUSES)[number]
  warehouseId: string
  approvedBy: string | null
  approvedAt: string | null
  pickupRiderId: string | null
  assignedAt: string | null
  pickedUpAt: string | null
  receivedAtWarehouseAt: string | null
  receivedByWarehouse: string | null
  deliveryRiderId: string | null
  dispatchedAt: string | null
  dispatchedBy: string | null
  outForDeliveryAt: string | null
  deliveredAt: string | null
  deliveryProofRef: string | null
  amountCollected: number | null
  failedAttemptAt: string | null
  failureNote: string | null
  returnedAt: string | null
  returnReason: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelReason: string | null
  deliveryAttempts: number
  createdAt: string
}

function buildSeedOrders(): OrderSeedEntry[] {
  const activeMerchants = [
    {
      id: MERCHANT_IDS.merchant1,
      pickupId: "seed_pickup_1",
      baseRate: 50,
      extraRatePerKg: 10,
      freeWeightKg: 1,
    },
    {
      id: MERCHANT_IDS.merchant2,
      pickupId: "seed_pickup_2",
      baseRate: 60,
      extraRatePerKg: 15,
      freeWeightKg: 1,
    },
    {
      id: MERCHANT_IDS.merchant3,
      pickupId: "seed_pickup_3",
      baseRate: 70,
      extraRatePerKg: 20,
      freeWeightKg: 1,
    },
  ]

  const usableRiders = SEED_RIDERS.filter((r) => r.isActive)
  const pickupRiders = usableRiders.filter(
    (r) => r.taskType === "PICKUP" || r.taskType === "BOTH",
  )
  const deliveryRiders = usableRiders.filter(
    (r) => r.taskType === "DELIVERY" || r.taskType === "BOTH",
  )

  // Deterministic shuffle using index-based picks
  const now = Date.now()
  const DAY = 86_400_000

  return Array.from({ length: SEED_COUNTS.orders }, (_, i) => {
    const merchant = activeMerchants[i % activeMerchants.length]
    const status = ORDER_SEED_STATUSES[i]
    const city = ORDER_SEED_CITIES[i % ORDER_SEED_CITIES.length]
    const recipientName = RECIPIENT_NAMES[i % RECIPIENT_NAMES.length]
    const weight = PARCEL_WEIGHTS[i % PARCEL_WEIGHTS.length]
    const productCost = PRODUCT_COSTS[i % PRODUCT_COSTS.length]
    const deliveryType = i % 5 === 0 ? "FRAGILE" : "STANDARD"

    // Delivery charge: base + ceil(max(0, weight - freeWeight)) * extraRate
    const billableExtraKg = Math.ceil(
      Math.max(0, weight - merchant.freeWeightKg),
    )
    const deliveryFee =
      merchant.baseRate + billableExtraKg * merchant.extraRatePerKg

    // COD fee: 1% of productCost
    const codFee = Math.round(productCost * 0.01 * 100) / 100
    const merchantEarnings = Math.max(0, productCost - deliveryFee - codFee)

    // Stagger creation dates over the last 30 days
    const createdAt = new Date(
      now - (SEED_COUNTS.orders - i) * (DAY / 4),
    ).toISOString()

    const base: OrderSeedEntry = {
      id: `seed_order_${String(i + 1).padStart(3, "0")}`,
      merchantId: merchant.id,
      pickupLocationId: merchant.pickupId,
      recipientName,
      recipientPhone: `+8801712${String(10000 + i).slice(0, 5)}`,
      deliveryAddress: `${100 + i} Seed Road, ${city}`,
      deliveryCity: city,
      parcelWeightKg: weight,
      deliveryType,
      productCost,
      deliveryFee,
      codFee,
      merchantEarnings,
      status,
      warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
      approvedBy: null,
      approvedAt: null,
      pickupRiderId: null,
      assignedAt: null,
      pickedUpAt: null,
      receivedAtWarehouseAt: null,
      receivedByWarehouse: null,
      deliveryRiderId: null,
      dispatchedAt: null,
      dispatchedBy: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      deliveryProofRef: null,
      amountCollected: null,
      failedAttemptAt: null,
      failureNote: null,
      returnedAt: null,
      returnReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      deliveryAttempts: 0,
      createdAt,
    }

    if (status !== "PENDING" && status !== "CANCELLED") {
      base.approvedBy = ADMIN_USER_NAMES.tanvir
      base.approvedAt = new Date(
        new Date(createdAt).getTime() + 0.5 * DAY,
      ).toISOString()
    }

    if (
      status === "PICKED_UP" ||
      status === "IN_WAREHOUSE" ||
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      const rider = pickupRiders[i % pickupRiders.length]
      base.pickupRiderId = rider.id
      base.assignedAt = base.approvedAt
      base.pickedUpAt = new Date(
        new Date(base.approvedAt!).getTime() + DAY,
      ).toISOString()
    }

    if (
      status === "IN_WAREHOUSE" ||
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      base.receivedAtWarehouseAt = new Date(
        new Date(base.pickedUpAt!).getTime() + DAY,
      ).toISOString()
      base.receivedByWarehouse = ADMIN_USER_NAMES.rifat
    }

    if (
      status === "IN_TRANSIT" ||
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      const rider = deliveryRiders[i % deliveryRiders.length]
      base.deliveryRiderId = rider.id
      base.dispatchedAt = new Date(
        new Date(base.receivedAtWarehouseAt!).getTime() + 0.5 * DAY,
      ).toISOString()
      base.dispatchedBy = ADMIN_USER_NAMES.rifat
    }

    if (
      status === "OUT_FOR_DELIVERY" ||
      status === "DELIVERED" ||
      status === "FAILED_ATTEMPT" ||
      status === "RETURNED"
    ) {
      base.outForDeliveryAt = new Date(
        new Date(base.dispatchedAt!).getTime() + 0.5 * DAY,
      ).toISOString()
    }

    if (status === "DELIVERED") {
      base.deliveredAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + DAY,
      ).toISOString()
      base.deliveryProofRef = `proof_seed_${i + 1}.jpg`
      base.amountCollected = productCost
      base.deliveryAttempts = 1
    }

    if (status === "FAILED_ATTEMPT") {
      base.failedAttemptAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + DAY,
      ).toISOString()
      base.failureNote = "Recipient not available at delivery address"
      base.deliveryAttempts = 1
    }

    if (status === "RETURNED") {
      base.failedAttemptAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + DAY,
      ).toISOString()
      base.failureNote = "Recipient refused delivery"
      base.deliveryAttempts = 2
      base.returnedAt = new Date(
        new Date(base.outForDeliveryAt!).getTime() + 3 * DAY,
      ).toISOString()
      base.returnReason = "Recipient refused to accept"
    }

    if (status === "CANCELLED") {
      base.cancelledAt = new Date(
        new Date(createdAt).getTime() + 2 * DAY,
      ).toISOString()
      base.cancelledBy = ADMIN_USER_NAMES.tanvir
      base.cancelReason = "Customer requested cancellation"
    }

    return base
  })
}

export const SEED_ORDERS: OrderSeedEntry[] = buildSeedOrders()

// ---------------------------------------------------------------------------
// Deterministic: Payout Requests (2)
// ---------------------------------------------------------------------------
export interface PayoutRequestSeedEntry {
  id: string
  merchantId: string
  orderIds: string[]
  amount: number
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED"
  payoutMethod: string
  payoutDetails: string
  requestedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectReason: string | null
  paidAt: string | null
}

function buildSeedPayoutRequests(): PayoutRequestSeedEntry[] {
  // Pick 2 delivered orders from merchant1 for payout
  const merchant1Delivered = SEED_ORDERS.filter(
    (o) => o.merchantId === MERCHANT_IDS.merchant1 && o.status === "DELIVERED",
  )
  const payoutOrder1 = merchant1Delivered[0]
  const payoutOrder2 = merchant1Delivered[1]

  const now = Date.now()
  const DAY = 86_400_000

  return [
    {
      id: "PR-SEED-001",
      merchantId: MERCHANT_IDS.merchant1,
      orderIds: payoutOrder1 ? [payoutOrder1.id] : [],
      amount: payoutOrder1 ? payoutOrder1.merchantEarnings : 60,
      status: "PENDING",
      payoutMethod: "bKash",
      payoutDetails: "01712345678",
      requestedAt: new Date(now - 2 * DAY).toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null,
      paidAt: null,
    },
    {
      id: "PR-SEED-002",
      merchantId: MERCHANT_IDS.merchant1,
      orderIds: payoutOrder2 ? [payoutOrder2.id] : [],
      amount: payoutOrder2 ? payoutOrder2.merchantEarnings : 70,
      status: "APPROVED",
      payoutMethod: "Nagad",
      payoutDetails: "01812345678",
      requestedAt: new Date(now - 5 * DAY).toISOString(),
      reviewedBy: ADMIN_USER_NAMES.nadia,
      reviewedAt: new Date(now - 3 * DAY).toISOString(),
      rejectReason: null,
      paidAt: null,
    },
  ]
}

export const SEED_PAYOUT_REQUESTS: PayoutRequestSeedEntry[] =
  buildSeedPayoutRequests()
