"use client"

import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { ApiError, jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { buildTableUrl, useTableFilters } from "@/lib/hooks/use-table-filters"
import type { PaginatedResponse } from "@/lib/pagination"
import type { CreateOrderInput, Order } from "@/lib/types"
import { formatError } from "@/lib/validation"

const KEY = "/api/orders"

/**
 * SWR keys that go stale when an order changes. Beyond the order lists
 * themselves (the `KEY` prefix also covers `/api/orders/counts` and
 * `/api/orders/payable`), an order moves money and consumes package quota, so
 * merchant balance and the package catalogue must be revalidated too — otherwise
 * the balance and "orders used" figures stay stale until a manual refresh.
 */
function isOrderRelatedKey(key: string): boolean {
  return (
    key.startsWith(KEY) ||
    key.startsWith("/api/merchants") ||
    key.startsWith("/api/packages")
  )
}

type Result = { ok: boolean; error?: string }

type BulkAction =
  | "approve"
  | "cancel"
  | "receive"
  | "settle-cod"
  | "assign-pickup-rider"
  | "dispatch"

// Orders resource: the order list, merchant order creation, every rider/
// warehouse status transition (applied optimistically with rollback), and the
// warehouse/merchant-scoped views derived from the shared warehouses/merchants
// caches.
export function useOrders({
  initialData,
  initialTotal,
  includeAllOrders = false,
  payablePage = 1,
  payableLimit = 20,
  payableDateFrom,
  payableDateTo,
  queue,
}: {
  initialData?: Order[]
  initialTotal?: number
  includeAllOrders?: boolean
  payablePage?: number
  payableLimit?: number
  payableDateFrom?: string
  payableDateTo?: string
  /**
   * Restrict a RIDER's results to one queue (`pickup` | `delivery`).
   *
   * The API used to return both queues and leave the page to filter, so the
   * Reported `total` counted rows the table never rendered.
   */
  queue?: "pickup" | "delivery"
} = {}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()
  const { currentMerchant } = useMerchants()
  const { mutate: _globalMutate } = useSWRConfig()
  const filters = useTableFilters()

  const url = buildTableUrl(KEY, {
    limit: filters.limit,
    offset: filters.offset,
    q: filters.debouncedQuery || undefined,
    statuses: filters.statuses,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    queue,
  })

  const isDefaultQuery =
    !filters.debouncedQuery &&
    !filters.statuses &&
    !filters.sortId &&
    !filters.dateFrom &&
    !filters.dateTo &&
    // A queue-filtered query is never the default one: `initialData` would be
    // The unfiltered list.
    !queue &&
    filters.page === 1

  const {
    data: response,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<PaginatedResponse<Order>>(currentUser ? url : null, jsonFetcher, {
    ...swrOptions,
    ...(isDefaultQuery && initialData
      ? {
          fallbackData: {
            data: initialData,
            total: initialTotal ?? initialData.length,
            limit: filters.limit,
            offset: 0,
          },
        }
      : {}),
  })

  const orders = response?.data ?? initialData ?? []
  const total = response?.total ?? initialTotal ?? 0

  // Optional workboard data for warehouse screens. Dashboard stat cards use
  // server-provided aggregates instead of fetching a broad unfiltered list.
  const allUrl = buildTableUrl(KEY, {
    limit: 100,
    offset: 0,
    q: filters.debouncedQuery || undefined,
    statuses: undefined,
    sortId: filters.sortId || undefined,
    sortDir: filters.sortId ? filters.sortDir : undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })

  const { data: allResponse } = useSWR<PaginatedResponse<Order>>(
    currentUser && includeAllOrders ? allUrl : null,
    jsonFetcher,
    swrOptions,
  )

  const allOrders = includeAllOrders ? (allResponse?.data ?? []) : []

  const warehouseId = currentWarehouse?.id
  const countsKey = warehouseId
    ? `${KEY}/counts?warehouseId=${warehouseId}`
    : null
  const { data: counts } = useSWR<{
    failedAttempt: number
    unsettled: number
    returned: number
  }>(currentUser ? countsKey : null, jsonFetcher, swrOptions)

  const warehouseFailedOrders = counts?.failedAttempt ?? 0
  const warehouseUnsettledOrders = currentWarehouse
    ? (counts?.unsettled ?? 0)
    : 0

  const merchantId = currentMerchant?.id
  const payableKey = merchantId
    ? buildTableUrl(`${KEY}/payable`, {
        merchantId,
        limit: payableLimit,
        offset: (payablePage - 1) * payableLimit,
        dateFrom: payableDateFrom,
        dateTo: payableDateTo,
      })
    : null
  const { data: payableResponse } = useSWR<
    PaginatedResponse<Order> & { totalEarnings?: number }
  >(currentUser ? payableKey : null, jsonFetcher, swrOptions)
  const merchantPayableOrders = payableResponse?.data ?? []
  const merchantPayableTotal = payableResponse?.total ?? 0
  const merchantPayableAmount = payableResponse?.totalEarnings ?? 0

  const patchOrder = useCallback(
    async (
      orderId: string,
      path: string,
      body?: Record<string, unknown>,
    ): Promise<Result> => {
      try {
        const res = await fetch(`/api/orders/${orderId}/${path}`, {
          method: "PATCH",
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        })
        const resData = await res
          .json()
          .catch(() => null)
          .catch(() => null)
        if (!res.ok) {
          throw new ApiError(resData?.error ?? "Action failed.")
        }
        const serverOrder = resData as Order
        mutate(
          (current?: PaginatedResponse<Order>) =>
            ({
              ...current,
              data: (current?.data ?? []).map((o) =>
                o.id === orderId ? serverOrder : o,
              ),
            }) as PaginatedResponse<Order>,
        )
        _globalMutate((key: string) => isOrderRelatedKey(key)).catch(() => {})
        return { ok: true }
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, error: err.message }
        return { ok: false, error: "Network error. Please try again." }
      }
    },
    [mutate, _globalMutate],
  )

  const patchOrders = useCallback(
    async (
      ids: string[],
      action: BulkAction,
      body?: Record<string, unknown>,
    ): Promise<Result> => {
      try {
        const res = await fetch(`/api/orders/bulk/${action}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, ...body }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          return { ok: false, error: data?.error ?? "Bulk action failed." }
        }
        _globalMutate((key: string) => isOrderRelatedKey(key)).catch(() => {})
        return { ok: true }
      } catch {
        return { ok: false, error: "Network error. Please try again." }
      }
    },
    [_globalMutate],
  )

  const createOrder = useCallback(
    async (
      input: CreateOrderInput,
    ): Promise<{ ok: boolean; order?: Order; error?: string }> => {
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const resData = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = formatError(resData)
        return { ok: false, error: msg }
      }
      await mutate()
      _globalMutate((key: string) => isOrderRelatedKey(key)).catch(() => {})
      return { ok: true, order: resData }
    },
    [mutate, _globalMutate],
  )

  const createOrders = useCallback(
    async (
      inputs: CreateOrderInput[],
    ): Promise<{
      ok: boolean
      orders?: Order[]
      error?: string
      issues?: Array<{ path: (string | number)[]; message: string }> | null
      rows?: number[] | null
    }> => {
      const res = await fetch("/api/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: inputs }),
      })
      const resData = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = formatError(resData)
        return {
          ok: false,
          error: msg,
          issues: resData?.issues ?? null,
          rows: resData?.rows ?? null,
        }
      }
      await mutate()
      _globalMutate((key: string) => isOrderRelatedKey(key)).catch(() => {})
      return { ok: true, orders: resData }
    },
    [mutate, _globalMutate],
  )

  // --- Bound transitions (same signatures the old context exposed) ---------
  const approveOrder = useCallback(
    (orderId: string) => patchOrder(orderId, "approve"),
    [patchOrder],
  )
  const assignPickupRider = useCallback(
    (orderId: string, riderId: string) =>
      patchOrder(orderId, "assign-pickup-rider", { riderId }),
    [patchOrder],
  )
  const markOrderPickedUp = useCallback(
    (orderId: string, proofRefs: string[], parcelWeightKg?: number) =>
      patchOrder(orderId, "picked-up", {
        proofRefs,
        ...(parcelWeightKg !== undefined ? { parcelWeightKg } : {}),
      }),
    [patchOrder],
  )
  const receiveOrderAtWarehouse = useCallback(
    (orderId: string) => patchOrder(orderId, "receive"),
    [patchOrder],
  )
  const assignDeliveryRider = useCallback(
    (orderId: string, riderId: string) =>
      patchOrder(orderId, "dispatch", { riderId }),
    [patchOrder],
  )
  const markOutForDelivery = useCallback(
    (orderId: string) => patchOrder(orderId, "out-for-delivery"),
    [patchOrder],
  )
  const markDelivered = useCallback(
    (orderId: string, proofRef?: string) =>
      patchOrder(orderId, "delivered", proofRef ? { proofRef } : undefined),
    [patchOrder],
  )
  const markDeliveryFailed = useCallback(
    (orderId: string, note: string) => patchOrder(orderId, "failed", { note }),
    [patchOrder],
  )
  const reattemptFailedOrder = useCallback(
    (orderId: string) => patchOrder(orderId, "reattempt"),
    [patchOrder],
  )
  const returnFailedOrder = useCallback(
    (orderId: string, reason: string) =>
      patchOrder(orderId, "return", { reason }),
    [patchOrder],
  )
  const settleOrderCod = useCallback(
    (orderId: string) => patchOrder(orderId, "settle-cod"),
    [patchOrder],
  )
  const cancelOrder = useCallback(
    (orderId: string, reason?: string) =>
      patchOrder(orderId, "cancel", reason ? { reason } : undefined),
    [patchOrder],
  )

  // --- Bulk order transitions ------------------------------------------------
  const bulkApproveOrders = useCallback(
    (ids: string[]) => patchOrders(ids, "approve"),
    [patchOrders],
  )
  const bulkCancelOrders = useCallback(
    (ids: string[], reason?: string) =>
      patchOrders(ids, "cancel", reason ? { reason } : undefined),
    [patchOrders],
  )
  const bulkReceiveOrders = useCallback(
    (ids: string[]) => patchOrders(ids, "receive"),
    [patchOrders],
  )
  const bulkSettleCod = useCallback(
    (ids: string[]) => patchOrders(ids, "settle-cod"),
    [patchOrders],
  )
  const bulkAssignPickupRider = useCallback(
    (ids: string[], riderId: string) =>
      patchOrders(ids, "assign-pickup-rider", { riderId }),
    [patchOrders],
  )
  const bulkDispatch = useCallback(
    (ids: string[], riderId: string) =>
      patchOrders(ids, "dispatch", { riderId }),
    [patchOrders],
  )

  // Merchant mutation — updates merchantNote optimistically and reconciles
  // with the server row. Only the owning merchant (or super admin) can use it.
  const updateMerchantNote = useCallback(
    async (orderId: string, merchantNote: string): Promise<Result> => {
      try {
        await mutate(
          async (current?: PaginatedResponse<Order>) => {
            const res = await fetch(`/api/orders/${orderId}/merchant-note`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ merchantNote }),
            })
            const resData = await res
              .json()
              .catch(() => null)
              .catch(() => null)
            if (!res.ok) {
              throw new ApiError(resData?.error ?? "Failed to save note.")
            }
            return {
              ...current,
              data: (current?.data ?? []).map((o) =>
                o.id === orderId ? resData : o,
              ),
            } as PaginatedResponse<Order>
          },
          {
            optimisticData: (resp: PaginatedResponse<Order> | undefined) =>
              ({
                ...resp,
                data: (resp?.data ?? []).map((o) =>
                  o.id === orderId ? { ...o, merchantNote } : o,
                ),
              }) as PaginatedResponse<Order>,
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          },
        )
        _globalMutate((key: string) => isOrderRelatedKey(key)).catch(() => {})
        return { ok: true }
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, error: err.message }
        return { ok: false, error: "Network error. Please try again." }
      }
    },
    [mutate, _globalMutate],
  )

  // Public mutation — used from the tracking page without a session. Updates
  // receiverNote optimistically and reconciles with the server row.
  const updateReceiverNote = useCallback(
    async (orderId: string, receiverNote: string): Promise<Result> => {
      try {
        await mutate(
          async (current?: PaginatedResponse<Order>) => {
            const res = await fetch(`/api/orders/${orderId}/receiver-note`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ receiverNote }),
            })
            const resData = await res
              .json()
              .catch(() => null)
              .catch(() => null)
            if (!res.ok) {
              throw new ApiError(resData?.error ?? "Failed to save note.")
            }
            return {
              ...current,
              data: (current?.data ?? []).map((o) =>
                o.id === orderId ? resData : o,
              ),
            } as PaginatedResponse<Order>
          },
          {
            optimisticData: (resp: PaginatedResponse<Order> | undefined) =>
              ({
                ...resp,
                data: (resp?.data ?? []).map((o) =>
                  o.id === orderId ? { ...o, receiverNote } : o,
                ),
              }) as PaginatedResponse<Order>,
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          },
        )
        _globalMutate((key: string) => isOrderRelatedKey(key)).catch(() => {})
        return { ok: true }
      } catch (err) {
        if (err instanceof ApiError) return { ok: false, error: err.message }
        return { ok: false, error: "Network error. Please try again." }
      }
    },
    [mutate, _globalMutate],
  )

  return {
    orders,
    allOrders,
    total,
    page: filters.page,
    setPage: filters.setPage,
    limit: filters.limit,
    setLimit: filters.setLimit,
    query: filters.query,
    setQuery: filters.setQuery,
    statuses: filters.statuses,
    setStatuses: filters.setStatuses,
    sortId: filters.sortId,
    sortDir: filters.sortDir,
    onSortChange: filters.onSortChange,
    dateFrom: filters.dateFrom,
    setDateFrom: filters.setDateFrom,
    dateTo: filters.dateTo,
    setDateTo: filters.setDateTo,
    warehouseFailedOrders,
    warehouseUnsettledOrders,
    merchantPayableOrders,
    merchantPayableTotal,
    merchantPayableAmount,
    isLoading,
    isRefreshing: isValidating,
    error,
    mutate,
    createOrder,
    createOrders,
    approveOrder,
    assignPickupRider,
    markOrderPickedUp,
    receiveOrderAtWarehouse,
    assignDeliveryRider,
    markOutForDelivery,
    markDelivered,
    markDeliveryFailed,
    reattemptFailedOrder,
    returnFailedOrder,
    settleOrderCod,
    cancelOrder,
    updateMerchantNote,
    updateReceiverNote,
    patchOrders,
    bulkApproveOrders,
    bulkCancelOrders,
    bulkReceiveOrders,
    bulkSettleCod,
    bulkAssignPickupRider,
    bulkDispatch,
  }
}
