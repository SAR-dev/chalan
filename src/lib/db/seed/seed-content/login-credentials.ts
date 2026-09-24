import { SEED_MERCHANTS } from "./merchants"
import { SEED_RIDERS } from "./riders"
import { SEED_ADMIN_USERS } from "./users"

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
