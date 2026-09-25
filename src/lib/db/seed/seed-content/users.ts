import { SEED_USER_CREDENTIALS } from "./credentials"

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
    warehouseId: "WH-100001E",
  },
  {
    name: "WarehouseAdmin02",
    ...SEED_USER_CREDENTIALS.warehouseAdmin2,
    phone: "+8801711000021",
    isActive: false,
    warehouseId: "WH-100002E",
  },
]

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
