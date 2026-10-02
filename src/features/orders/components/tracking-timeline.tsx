"use client"

import { Ban, ImageOff, Undo2, XCircle } from "lucide-react"
import { Fragment } from "react"
import { ImageZoom } from "@/components/image-zoom"
import {
  formatStamp,
  STATUS_RANK,
  STEPS,
  type StepKey,
  stepDescription,
} from "@/lib/order-timeline"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"

type RiderInfo = { name: string; phone: string; zone: string }
type WarehouseInfo = { name: string; city: string }
type MerchantInfo = { businessName: string; ownerName: string }

export function TrackingTimeline({
  order,
  pickupRider,
  warehouse,
  deliveryRider,
  merchant,
}: {
  order: Order
  pickupRider?: RiderInfo | null
  warehouse?: WarehouseInfo | null
  deliveryRider?: RiderInfo | null
  merchant?: MerchantInfo | null
}) {
  const currentRank = STATUS_RANK[order.status]
  const isReturned = order.status === "RETURNED"
  const isFailed = order.status === "FAILED_ATTEMPT"
  const isCancelled = order.status === "CANCELLED"

  const stepDetails: Partial<
    Record<StepKey, { role: string; name: string; sub: string }>
  > = {}

  if (merchant) {
    stepDetails.PLACED = {
      role: "Merchant",
      name: merchant.businessName,
      sub: merchant.ownerName,
    }
  }

  if (pickupRider) {
    stepDetails.PICKED_UP = {
      role: "Pickup rider",
      name: pickupRider.name,
      sub: [pickupRider.phone, pickupRider.zone].filter(Boolean).join(" · "),
    }
  }
  if (warehouse) {
    stepDetails.IN_WAREHOUSE = {
      role: "Sorting hub",
      name: warehouse.name,
      sub: [
        warehouse.city,
        order.receivedByWarehouse
          ? `Logged by ${order.receivedByWarehouse}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }
  }
  if (deliveryRider) {
    const riderDetail = {
      role: "Delivery rider",
      name: deliveryRider.name,
      sub: [deliveryRider.phone, deliveryRider.zone]
        .filter(Boolean)
        .join(" · "),
    }
    stepDetails.OUT_FOR_DELIVERY = riderDetail
    stepDetails.DELIVERED = riderDetail
  }

  return (
    <ol className="space-y-0">
      {STEPS.map((step, index) => {
        const isLast = index === STEPS.length - 1
        const reached = currentRank >= step.rank
        const isCurrent =
          currentRank === step.rank &&
          !isReturned &&
          !isCancelled &&
          !(isFailed && step.key === "DELIVERED")
        const isCompleted = reached && !isCurrent
        const Icon = step.icon
        const stamp = formatStamp(step.timestamp(order))
        const detail = reached ? (stepDetails[step.key] ?? null) : null

        const showFailedAfter = step.key === "OUT_FOR_DELIVERY" && isFailed
        const showReturnedAfter = step.key === "OUT_FOR_DELIVERY" && isReturned
        const showCancelledAfter =
          isCancelled && step.rank === currentRank && !isLast
        const hasExceptionAfter =
          showFailedAfter || showReturnedAfter || showCancelledAfter

        return (
          <Fragment key={step.key}>
            <li className="flex gap-3">
              {/* Rail */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border transition-all",
                    isCompleted
                      ? "border-chart-2/30 bg-chart-2/15 text-chart-2"
                      : isCurrent
                        ? "border-primary/30 bg-primary/15 text-primary"
                        : "border-border bg-muted text-muted-foreground/40",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                {(!isLast || hasExceptionAfter) && (
                  <span
                    className={cn(
                      "mt-1 w-px flex-1",
                      isCompleted ? "bg-chart-2/40" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  "min-w-0 flex-1 pt-0.5 pb-5",
                  isLast && !hasExceptionAfter && "pb-0",
                )}
              >
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "text-sm leading-none font-medium",
                      reached ? "text-foreground" : "text-muted-foreground/50",
                    )}
                  >
                    {step.label}
                  </p>
                  {isCurrent && (
                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      <span className="bg-primary inline-block size-1.5 animate-pulse rounded-full" />
                      Live
                    </span>
                  )}
                </div>
                {stamp ? (
                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {stamp}
                  </p>
                ) : (
                  <p className="text-muted-foreground/50 mt-1 text-xs">
                    {stepDescription(step, "ops")}
                  </p>
                )}
                {detail && (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      {detail.role}
                    </p>
                    <p className="text-foreground text-xs font-medium">
                      {detail.name}
                    </p>
                    {detail.sub && (
                      <p className="text-muted-foreground text-xs">
                        {detail.sub}
                      </p>
                    )}
                  </div>
                )}
                {step.key === "PICKED_UP" && reached && (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Pickup proof
                    </p>
                    {order.pickupProofRefs &&
                    order.pickupProofRefs.length > 0 ? (
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        {order.pickupProofRefs.map((link, i) => (
                          <ImageZoom
                            key={i}
                            src={link}
                            alt={`Pickup proof ${i + 1}`}
                            className="size-full object-cover transition-transform hover:scale-105"
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60 mt-1 inline-flex items-center gap-1.5 text-xs italic">
                        <ImageOff className="size-3.5" />
                        No proof photo uploaded.
                      </span>
                    )}
                  </div>
                )}
                {step.key === "DELIVERED" && reached && (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Proof of delivery
                    </p>
                    {order.deliveryProofRef ? (
                      <ImageZoom
                        src={order.deliveryProofRef}
                        alt="Proof of delivery"
                        className="border-border bg-muted mt-1.5 block size-20 overflow-hidden rounded-md border object-cover transition-transform hover:scale-105"
                      />
                    ) : (
                      <span className="text-muted-foreground/60 mt-1 inline-flex items-center gap-1.5 text-xs italic">
                        <ImageOff className="size-3.5" />
                        No proof photo uploaded.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>

            {showFailedAfter && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-8 shrink-0 items-center justify-center rounded-full border">
                    <XCircle className="size-3.5" />
                  </span>
                  <span
                    className="bg-border mt-1 w-px flex-1"
                    aria-hidden="true"
                  />
                </div>
                <div className="pt-0.5 pb-5">
                  <p className="text-destructive text-sm leading-none font-medium">
                    Delivery attempt failed
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(order.failedAttemptAt) ??
                      "A new attempt will be scheduled."}
                  </p>
                </div>
              </li>
            )}

            {showReturnedAfter && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="border-border bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full border">
                    <Undo2 className="size-3.5" />
                  </span>
                  <span
                    className="bg-border mt-1 w-px flex-1"
                    aria-hidden="true"
                  />
                </div>
                <div className="pt-0.5 pb-5">
                  <p className="text-foreground text-sm leading-none font-medium">
                    Returned to merchant
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(order.returnedAt) ??
                      "This parcel was returned and will not be delivered."}
                  </p>
                </div>
              </li>
            )}

            {showCancelledAfter && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-8 shrink-0 items-center justify-center rounded-full border">
                    <Ban className="size-3.5" />
                  </span>
                </div>
                <div className="pt-0.5 pb-0">
                  <p className="text-destructive text-sm leading-none font-medium">
                    Cancelled
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(order.cancelledAt) ??
                      "This order was cancelled."}
                  </p>
                  {order.cancelledBy && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      By {order.cancelledBy}
                      {order.cancelReason ? ` · ${order.cancelReason}` : ""}
                    </p>
                  )}
                </div>
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}
