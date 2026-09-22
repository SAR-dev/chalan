"use client"

import { CheckCircle2 } from "lucide-react"
import { JSX } from "react"
import {
  CellContent,
  CellTwoRow,
  type DataTableColumn,
} from "@/components/data-table"
import { columnLabels } from "@/config/table-column-labels"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { formatTk } from "@/lib/pricing"
import type { Order } from "@/lib/types"
import { OrderStatusBadge } from "./order-status-badge"

// ---------------------------------------------------------------------------
// Column factory functions — each owns one visual design
// ---------------------------------------------------------------------------

export interface OrderCodeColumnOptions {
  subtitle?: "merchant" | "none"
  merchantName?: (id: string) => string
  onOrderClick?: (order: Order) => void
}

export function orderCodeColumn(
  options: OrderCodeColumnOptions = {},
): DataTableColumn<Order> {
  const { subtitle = "none", merchantName, onOrderClick } = options

  return {
    id: "order",
    header: columnLabels.order.order,
    sortable: true,
    sortValue: (o) => o.id,
    cell: (o) => (
      <CellTwoRow
        primary={
          onOrderClick ? (
            <button
              type="button"
              onClick={() => onOrderClick(o)}
              className="font-mono text-xs font-medium text-left text-primary underline-offset-2 hover:underline focus:outline-none"
            >
              {o.id}
            </button>
          ) : (
            <span className="font-mono text-xs font-medium">{o.id}</span>
          )
        }
        secondary={
          subtitle === "merchant" && merchantName
            ? merchantName(o.merchantId)
            : undefined
        }
      />
    ),
  }
}

/** Merchant business name. */
export function merchantColumn(
  merchantName: (id: string) => string,
): DataTableColumn<Order> {
  return {
    id: "merchant",
    header: columnLabels.order.merchant,
    cell: (o) => <CellContent>{merchantName(o.merchantId)}</CellContent>,
  }
}

/** Merchant phone number. */
export function merchantPhoneColumn(
  merchantPhone: (id: string) => string,
): DataTableColumn<Order> {
  return {
    id: "merchantPhone",
    header: columnLabels.order.merchantPhone,
    cell: (o) => (
      <CellContent className="text-muted-foreground">
        {merchantPhone(o.merchantId)}
      </CellContent>
    ),
  }
}

/** Recipient name only. */
export function recipientNameColumn(): DataTableColumn<Order> {
  return {
    id: "receiver",
    header: columnLabels.order.receiver,
    cell: (o) => (
      <CellContent>
        <CellTwoRow
          primary={<span className="font-medium">{o.recipientName}</span>}
          secondary={o.recipientPhone}
        />
      </CellContent>
    ),
  }
}

/** Recipient phone only. */
export function recipientPhoneColumn(): DataTableColumn<Order> {
  return {
    id: "recipientPhone",
    header: columnLabels.order.recipientPhone,
    cell: (o) => (
      <CellContent className="text-muted-foreground">
        {o.recipientPhone}
      </CellContent>
    ),
  }
}

/** Pickup rider name only (no icon). */
export function pickupRiderColumn(
  riderName: (id?: string | null) => string | JSX.Element,
): DataTableColumn<Order> {
  return {
    id: "pickupRider",
    header: columnLabels.order.pickupRider,
    cell: (o) => <CellContent>{riderName(o.pickupRiderId)}</CellContent>,
  }
}

/** Delivery rider name only (no icon). */
export function deliveryRiderColumn(
  riderName: (id?: string | null) => string | JSX.Element,
): DataTableColumn<Order> {
  return {
    id: "deliveryRider",
    header: columnLabels.order.deliveryRider,
    cell: (o) => <CellContent>{riderName(o.deliveryRiderId)}</CellContent>,
  }
}

/** Pickup rider name + phone number. */
export function pickupRiderWithPhoneColumn(
  riderName: (id?: string | null) => string,
  riderPhone: (id?: string | null) => string,
): DataTableColumn<Order> {
  return {
    id: "pickupRider",
    header: columnLabels.order.pickupRider,
    cell: (o) => (
      <CellTwoRow
        primary={riderName(o.pickupRiderId)}
        secondary={riderPhone(o.pickupRiderId)}
      />
    ),
  }
}

/** Delivery rider name + phone number. */
export function deliveryRiderWithPhoneColumn(
  riderName: (id?: string | null) => string,
  riderPhone: (id?: string | null) => string,
): DataTableColumn<Order> {
  return {
    id: "deliveryRider",
    header: columnLabels.order.deliveryRider,
    cell: (o) => (
      <CellTwoRow
        primary={riderName(o.deliveryRiderId)}
        secondary={riderPhone(o.deliveryRiderId)}
      />
    ),
  }
}

/** Parcel weight in KG. */
export function parcelWeightColumn(): DataTableColumn<Order> {
  return {
    id: "parcelWeight",
    header: columnLabels.order.parcelWeight,
    align: "right",
    sortable: true,
    sortValue: (o) => o.parcelWeightKg,
    cell: (o) => (
      <CellContent className="tabular-nums">{o.parcelWeightKg} KG</CellContent>
    ),
  }
}

/** Delivery type. */
export function deliveryTypeColumn(): DataTableColumn<Order> {
  return {
    id: "deliveryType",
    header: columnLabels.order.deliveryType,
    cell: (o) => (
      <CellContent className="text-muted-foreground">
        {o.deliveryType}
      </CellContent>
    ),
  }
}

/** Warehouse name. */
export function warehouseColumn(
  warehouseName: (id?: string | null) => string,
): DataTableColumn<Order> {
  return {
    id: "warehouse",
    header: columnLabels.order.warehouse,
    cell: (o) => {
      const name = warehouseName(o.warehouseId)
      return name === "—" ? (
        <CellContent className="text-muted-foreground">—</CellContent>
      ) : (
        <CellContent>{name}</CellContent>
      )
    },
  }
}

/** Warehouse city. */
export function warehouseCityColumn(
  warehouseCity: (id?: string | null) => string,
): DataTableColumn<Order> {
  return {
    id: "warehouseCity",
    header: columnLabels.order.warehouseCity,
    cell: (o) => {
      const city = warehouseCity(o.warehouseId)
      return city === "—" ? (
        <CellContent className="text-muted-foreground">—</CellContent>
      ) : (
        <CellContent className="text-muted-foreground">{city}</CellContent>
      )
    },
  }
}

/** Delivery city + address combined. */
export function deliveryCityColumn(): DataTableColumn<Order> {
  return {
    id: "deliveryCity",
    header: columnLabels.order.deliveryCity,
    cell: (o) => (
      <CellTwoRow
        primary={o.deliveryCity || "—"}
        secondary={o.deliveryAddress}
      />
    ),
  }
}

/** Delivery address with city above it. */
export function deliveryAddressColumn(): DataTableColumn<Order> {
  return {
    id: "deliveryAddressOnly",
    header: columnLabels.order.deliveryAddressOnly,
    cell: (o) => (
      <CellTwoRow
        primary={o.deliveryCity || "—"}
        secondary={o.deliveryAddress}
      />
    ),
  }
}

/** Product cost (amount receiver pays on delivery). */
export function collectibleColumn(): DataTableColumn<Order> {
  return {
    id: "collectible",
    header: columnLabels.order.productCost,
    align: "right",
    sortable: true,
    sortValue: (o) => o.productCost,
    cell: (o) => (
      <CellContent className="tabular-nums">
        {formatTk(o.productCost)}
      </CellContent>
    ),
  }
}

/** Created at timestamp. */
export function createdAtColumn(): DataTableColumn<Order> {
  return {
    id: "createdAt",
    header: "Created",
    sortable: true,
    sortValue: (o) => o.createdAt ?? "",
    cellClassName: "text-sm text-muted-foreground",
    cell: (o) =>
      o.createdAt
        ? new Date(o.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "—",
  }
}

/** Delivery fee charged to the merchant. */
export function deliveryFeeColumn(): DataTableColumn<Order> {
  return {
    id: "deliveryFee",
    header: columnLabels.order.deliveryFee,
    align: "right",
    sortable: true,
    sortValue: (o) => o.deliveryFee,
    cell: (o) => (
      <CellContent className="tabular-nums">
        {formatTk(o.deliveryFee)}
      </CellContent>
    ),
  }
}

/** COD fee charged to the merchant. */
export function codFeeColumn(): DataTableColumn<Order> {
  return {
    id: "codFee",
    header: "COD fee",
    align: "right",
    sortable: true,
    sortValue: (o) => o.codFee,
    cell: (o) => (
      <CellContent className="tabular-nums">{formatTk(o.codFee)}</CellContent>
    ),
  }
}

/** Merchant note (M badge only). */
export function merchantNoteColumn(): DataTableColumn<Order> {
  return {
    id: "merchantNote",
    header: columnLabels.order.merchantNote,
    cell: (o) =>
      o.merchantNote ? (
        <span
          title={o.merchantNote}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-400"
        >
          M
        </span>
      ) : (
        <span className="text-muted-foreground/50 text-xs">—</span>
      ),
  }
}

/** Receiver note (R badge only). */
export function receiverNoteColumn(): DataTableColumn<Order> {
  return {
    id: "receiverNote",
    header: columnLabels.order.receiverNote,
    cell: (o) =>
      o.receiverNote ? (
        <span
          title={o.receiverNote}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-[11px] font-semibold text-red-600 dark:bg-red-950 dark:text-red-400"
        >
          R
        </span>
      ) : (
        <span className="text-muted-foreground/50 text-xs">—</span>
      ),
  }
}

/** Pickup location label. */
export function pickupLabelColumn(
  pickupLocation: (id: string) => { label: string; address: string } | null,
): DataTableColumn<Order> {
  return {
    id: "pickupLabel",
    header: columnLabels.order.pickupLabel,
    cell: (o) => {
      const p = pickupLocation(o.pickupLocationId)
      if (!p)
        return <CellContent className="text-muted-foreground">—</CellContent>
      return <CellContent>{p.label}</CellContent>
    },
  }
}

/** Pickup location address — plain text. */
export function pickupAddressColumn(
  pickupLocation: (id: string) => { label: string; address: string } | null,
): DataTableColumn<Order> {
  return {
    id: "pickupAddress",
    header: columnLabels.order.pickupAddress,
    cell: (o) => {
      const p = pickupLocation(o.pickupLocationId)
      return <CellContent>{p?.address ?? "—"}</CellContent>
    },
  }
}

export interface StatusColumnOptions {
  settledOverride?: boolean
}

/** Order status badge, with an optional "Settled by …" override. */
export function statusColumn(
  options: StatusColumnOptions = {},
): DataTableColumn<Order> {
  const { settledOverride = false } = options

  return {
    id: "status",
    header: columnLabels.order.status,
    sortable: true,
    sortValue: (o) =>
      settledOverride && o.codSettledAt ? "settled" : o.status,
    cell: (o) => {
      if (settledOverride && o.codSettledAt) {
        return (
          <span className="text-chart-2 flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="size-4" />
            Settled by {o.codSettledBy ?? "Admin"}
          </span>
        )
      }
      return <OrderStatusBadge status={o.status} />
    },
  }
}

/** Delivery attempts count. */
export function deliveryAttemptsColumn(): DataTableColumn<Order> {
  return {
    id: "attempts",
    header: columnLabels.order.deliveryAttempts,
    align: "center",
    sortable: true,
    sortValue: (o) => o.deliveryAttempts ?? 1,
    cell: (o) => (
      <span className="tabular-nums">{o.deliveryAttempts ?? 1}</span>
    ),
  }
}

/** Returns resolved-by info. */
export function returnReasonColumn(): DataTableColumn<Order> {
  return {
    id: "returnReason",
    header: columnLabels.order.returnReason,
    cell: (o) =>
      o.status === "RETURNED" ? (
        <CellContent className="text-muted-foreground">
          Returned by {o.failedResolvedBy ?? "Warehouse Admin"}
          {o.returnReason ? ` — ${o.returnReason}` : ""}
        </CellContent>
      ) : (
        <CellContent className="text-muted-foreground">
          See order details for attempt history
        </CellContent>
      ),
  }
}

/** Settled by (who confirmed the COD settlement). */
export function settledByColumn(): DataTableColumn<Order> {
  return {
    id: "settledBy",
    header: columnLabels.order.settledBy,
    cell: (o) =>
      o.codSettledAt ? (
        <CellContent>{o.codSettledBy ?? "Admin"}</CellContent>
      ) : (
        <CellContent className="text-muted-foreground">—</CellContent>
      ),
  }
}

// ---------------------------------------------------------------------------
// useOrderColumns — convenience hook for dashboard/orders/page.tsx
// ---------------------------------------------------------------------------

export function useOrderColumns(): DataTableColumn<Order>[] {
  const { merchants } = useMerchants()
  const { riders } = useRiders()
  const { pickupLocations } = usePickupLocations()
  const { warehouses } = useWarehouses()

  const merchantNameFn = (id: string) =>
    merchants.find((m) => m.id === id)?.businessName ?? "Unknown"

  const riderNameFn = (id?: string | null) => {
    const r = id ? riders.find((rider) => rider.id === id) : undefined

    if (!r) return "—"

    return (
      <CellTwoRow
        primary={<span className="font-medium">{r.name}</span>}
        secondary={r.phone}
      />
    )
  }

  const pickupLocationFn = (id: string) =>
    pickupLocations.find((p) => p.id === id) ?? null

  const warehouseFn = (id?: string | null) =>
    id ? (warehouses.find((w) => w.id === id) ?? null) : null

  const warehouseNameFn = (id?: string | null) => {
    const w = warehouseFn(id)
    return w ? w.name : "—"
  }

  const warehouseCityFn = (id?: string | null) => {
    const w = warehouseFn(id)
    return w ? w.city : "—"
  }

  const weightColumn: DataTableColumn<Order> = {
    id: "weight",
    header: columnLabels.order.weight,
    align: "right",
    sortable: true,
    sortValue: (o) => o.parcelWeightKg,
    cell: (o) => {
      const merchant = merchants.find((m) => m.id === o.merchantId)
      const exceeds = merchant ? o.parcelWeightKg > merchant.maxWeightKg : false
      return (
        <CellContent
          className={
            exceeds
              ? "text-destructive font-medium tabular-nums"
              : "tabular-nums"
          }
        >
          {o.parcelWeightKg} KG
        </CellContent>
      )
    },
  }

  const orderCell: DataTableColumn<Order> = {
    id: "order",
    header: columnLabels.order.order,
    sortable: true,
    sortValue: (o) => o.id,
    cell: (o) => <CellContent className="font-medium">{o.id}</CellContent>,
  }

  return [
    orderCell,
    merchantColumn(merchantNameFn),
    warehouseColumn(warehouseNameFn),
    warehouseCityColumn(warehouseCityFn),
    deliveryAddressColumn(),
    pickupLabelColumn(pickupLocationFn),
    pickupAddressColumn(pickupLocationFn),
    weightColumn,
    collectibleColumn(),
    deliveryFeeColumn(),
    codFeeColumn(),
    statusColumn(),
    pickupRiderColumn(riderNameFn),
    deliveryRiderColumn(riderNameFn),
  ]
}
