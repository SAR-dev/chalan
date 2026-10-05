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

// Shared password for every seeded account (local dev / e2e only).
//
// There is deliberately no env override. The seed is a development/e2e fixture,
// and a configurable value meant a production run could quietly come up on
// either the published password below or an ad-hoc one only the operator knew.
// Since the value can no longer differ, the seed entrypoints refuse to run in
// production at all (see assertSeedAllowedInDev).
export const SEED_PASSWORD = "12qwaszx"

/**
 * Guard for the seed entrypoints: every seeded account lands on the published
 * development password, so seeding a production database is never acceptable.
 */
export function assertSeedAllowedInDev(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed in production — every seeded account is created with " +
        "the well-known development password. Seed a development database instead.",
    )
  }
}

export const SEED_USER_CREDENTIALS = {
  // Admins
  admin1: {
    email: "admin1@email.com",
    password: SEED_PASSWORD,
    role: "SUPER_ADMIN",
  },
  admin2: {
    email: "admin2@email.com",
    password: SEED_PASSWORD,
    role: "SUPER_ADMIN",
  },
  admin3: {
    email: "admin3@email.com",
    password: SEED_PASSWORD,
    role: "SUPER_ADMIN",
  },
  warehouseAdmin1: {
    email: "warehouse.admin1@email.com",
    password: SEED_PASSWORD,
    role: "WAREHOUSE_ADMIN",
  },
  warehouseAdmin2: {
    email: "warehouse.admin2@email.com",
    password: SEED_PASSWORD,
    role: "WAREHOUSE_ADMIN",
  },

  // Merchants
  merchant1: {
    email: "merchant1@email.com",
    password: SEED_PASSWORD,
    role: "MERCHANT",
  },
  merchant2: {
    email: "merchant2@email.com",
    password: SEED_PASSWORD,
    role: "MERCHANT",
  },
  merchant3: {
    email: "merchant3@email.com",
    password: SEED_PASSWORD,
    role: "MERCHANT",
  },
  merchant4: {
    email: "merchant4@email.com",
    password: SEED_PASSWORD,
    role: "MERCHANT",
  },
  merchant5: {
    email: "merchant5@email.com",
    password: SEED_PASSWORD,
    role: "MERCHANT",
  },
} as const satisfies Record<string, SeedUserCredential>

// Riders are bulk-generated, so their credentials are generated the same
// way instead of being typed out by hand.
export function buildRiderCredentials(
  count: number,
): Record<string, SeedUserCredential> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `rider${i + 1}`,
      {
        email: `rider${i + 1}@email.com`,
        password: SEED_PASSWORD,
        role: "RIDER" as const,
      },
    ]),
  )
}

export const PENDING_RIDER_CREDENTIAL: SeedUserCredential = {
  email: "pending.rider@email.com",
  password: SEED_PASSWORD,
  role: "RIDER",
}

export const SEED_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgMjAwIDE1MCI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxNTAiIGZpbG9yPSIjZGRkZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5OTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+MjAweDE1MDwvdGV4dD48L3N2Zz4="

// ---------------------------------------------------------------------------
// Counts for bulk-generated entities
// ---------------------------------------------------------------------------
export const SEED_COUNTS = {
  merchants: 6,
  riders: 10,
  orders: 100,
  payoutRequests: 2,
  payoutLinkedOrders: 2,
  announcements: 6,
}

export const RIDER_CREDENTIALS = buildRiderCredentials(SEED_COUNTS.riders)
