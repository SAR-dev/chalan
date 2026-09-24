import { render } from "@testing-library/react"
import { type ReactNode } from "react"
import type { Order, Rider, User, Warehouse } from "@/lib/types"

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

let nextId = 1
let userIdSeq = 0
export function resetIds() {
  nextId = 1
  userIdSeq = 0
}
function seq() {
  return `ORD-${String(nextId++).padStart(4, "0")}`
}
function userSeq() {
  return `user_${++userIdSeq}`
}

export function makeUser(overrides?: Partial<User>): User {
  return {
    id: userSeq(),
    name: "Test Rider",
    email: "rider@test.com",
    role: "RIDER",
    riderId: "rider_1",
    warehouseId: null,
    merchantId: null,
    phone: "",
    isActive: true,
    image: null,
    emailVerified: false,
    tableRowsPerPage: 20,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    password: null,
    ...overrides,
  } as User
}

export function makeRider(overrides?: Partial<Rider>): Rider {
  return {
    id: "rider_1",
    name: "Test Rider",
    phone: "01700000000",
    email: "rider@test.com",
    zone: "Dhaka",
    warehouseId: "wh_1",
    taskType: "BOTH",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...overrides,
  } as Rider
}

export function makeWarehouse(overrides?: Partial<Warehouse>): Warehouse {
  return {
    id: "wh_1",
    name: "Test Warehouse",
    city: "Dhaka",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...overrides,
  } as Warehouse
}

export function makeOrder(overrides?: Partial<Order>): Order {
  return {
    id: seq(),
    merchantId: "m_1",
    warehouseId: "wh_1",
    pickupRiderId: null,
    deliveryRiderId: null,
    pickupProofRefs: [],
    recipientName: "Recipient",
    recipientPhone: "01800000000",
    deliveryAddress: "123 Test St",
    deliveryCity: "Dhaka",
    deliveryMapLink: null,
    deliveryType: "EXPRESS",
    parcelWeightKg: 1,
    productCost: 500,
    deliveryFee: 60,
    codFee: 0,
    merchantEarnings: 0,
    merchantNote: null,
    receiverNote: null,
    status: "APPROVED",
    statusHistory: [],
    outForDeliveryAt: null,
    deliveredAt: null,
    failedAt: null,
    failedResolvedBy: null,
    failedReason: null,
    returnReason: null,
    deliveryAttempts: 0,
    dispatchedAt: null,
    dispatchedBy: null,
    receivedAtWarehouseAt: null,
    receivedByWarehouse: null,
    pickedUpAt: null,
    approvedAt: null,
    cancelledAt: null,
    codSettledAt: null,
    codSettledBy: null,
    settlementNote: null,
    pickupLocationId: "pl_1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...overrides,
  } as Order
}

// ---------------------------------------------------------------------------
// Mock hook return types
// ---------------------------------------------------------------------------

export interface MockOrdersState {
  orders?: Order[]
  allOrders?: Order[]
  total?: number
  isLoading?: boolean
  statuses?: string[]
  page?: number
  limit?: number
  query?: string
  sortId?: string
  sortDir?: "asc" | "desc"
  dateFrom?: string
  dateTo?: string
  warehouseFailedOrders?: number
  merchantPayableOrders?: Order[]
  merchantPayableTotal?: number
  merchantPayableAmount?: number
}

export function createMockOrders(
  overrides?: MockOrdersState & Record<string, unknown>,
) {
  const orders = overrides?.orders ?? []
  return {
    orders,
    allOrders: overrides?.allOrders ?? orders,
    total: overrides?.total ?? orders.length,
    isLoading: overrides?.isLoading ?? false,
    statuses: overrides?.statuses,
    setStatuses: () => {},
    page: overrides?.page ?? 1,
    setPage: () => {},
    limit: overrides?.limit ?? 20,
    setLimit: () => {},
    query: overrides?.query ?? "",
    setQuery: () => {},
    sortId: overrides?.sortId ?? "",
    sortDir: overrides?.sortDir ?? "asc",
    onSortChange: () => {},
    dateFrom: overrides?.dateFrom,
    setDateFrom: () => {},
    dateTo: overrides?.dateTo,
    setDateTo: () => {},
    merchantPayableOrders: overrides?.merchantPayableOrders ?? [],
    merchantPayableTotal:
      overrides?.merchantPayableTotal ??
      (overrides?.merchantPayableOrders ?? []).length,
    merchantPayableAmount:
      overrides?.merchantPayableAmount ??
      (overrides?.merchantPayableOrders ?? []).reduce(
        (sum, o) => sum + o.merchantEarnings,
        0,
      ),
    warehouseFailedOrders: overrides?.warehouseFailedOrders ?? 0,
    markOrderPickedUp: () => Promise.resolve({ ok: true }),
    markOutForDelivery: () => Promise.resolve({ ok: true }),
    markDelivered: () => Promise.resolve({ ok: true }),
    markFailed: () => Promise.resolve({ ok: true }),
    markReattempt: () => Promise.resolve({ ok: true }),
    markReturned: () => Promise.resolve({ ok: true }),
    bulkReceiveOrders: () => Promise.resolve({ ok: true }),
    bulkApproveOrders: () => Promise.resolve({ ok: true }),
    bulkCancelOrders: () => Promise.resolve({ ok: true }),
    bulkSettleCod: () => Promise.resolve({ ok: true }),
    cancelOrder: () => Promise.resolve({ ok: true }),
    approveMerchant: () => Promise.resolve({ ok: true }),
    settleOrderCod: () => Promise.resolve({ ok: true }),
    approveOrder: () => Promise.resolve({ ok: true }),
    receiveOrderAtWarehouse: () => Promise.resolve({ ok: true }),
    assignPickupRider: () => Promise.resolve({ ok: true }),
    assignDeliveryRider: () => Promise.resolve({ ok: true }),
    dispatchOrder: () => Promise.resolve({ ok: true }),
    suspendMerchant: () => Promise.resolve({ ok: true }),
    reactivateMerchant: () => Promise.resolve({ ok: true }),
    reattemptFailedOrder: () => Promise.resolve({ ok: true }),
    returnFailedOrder: () => Promise.resolve({ ok: true }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Render helper — wraps the page with minimal providers
// ---------------------------------------------------------------------------

export function renderPage(ui: ReactNode) {
  return render(ui)
}
