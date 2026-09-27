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
// ROADMAP P0.7: this literal used to be the *only* way to get a password, so a
// production database seeded with `pnpm db:seed:full` came up with four
// super-admins all on a password published in the README. Set SEED_PASSWORD to
// override it, and note that both seed entrypoints refuse to run in production
// while the default is in use.
const DEFAULT_SEED_PASSWORD = "12qwaszx"

export const SEED_PASSWORD = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD

/** True while the well-known dev/e2e password is still in use. */
export const USING_DEFAULT_SEED_PASSWORD = !process.env.SEED_PASSWORD

/**
 * Guard for the seed entrypoints: seeding a production database with the
 * published dev password is never acceptable.
 */
export function assertSeedPasswordAllowed(): void {
  if (process.env.NODE_ENV === "production" && USING_DEFAULT_SEED_PASSWORD) {
    throw new Error(
      "Refusing to seed with the default password in production. " +
        "Set SEED_PASSWORD to a strong, unique value before seeding.",
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
  auditLogs: 5,
  emailLogs: 3,
}

export const RIDER_CREDENTIALS = buildRiderCredentials(SEED_COUNTS.riders)
