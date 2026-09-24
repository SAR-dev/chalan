import { Ban, ImageOff, Undo2, XCircle } from "lucide-react"
import { Fragment } from "react"
import { ImageZoom } from "@/components/image-zoom"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  formatStamp,
  maskPhone,
  STATUS_RANK,
  STEPS,
  type StepKey,
} from "../lib"

// ─── timeline (server component, no client hooks) ─────────────────────────────

type RiderRow = { name: string; phone: string; zone: string }
type WarehouseRow = { name: string; city: string }

export function Timeline({
  order: o,
  pickupRider,
  warehouse: warehouseData,
  deliveryRider,
}: {
  order: Order
  pickupRider: RiderRow | null
  warehouse: WarehouseRow | null
  deliveryRider: RiderRow | null
}) {
  const currentRank = STATUS_RANK[o.status]
  const isReturned = o.status === "RETURNED"
  const isFailed = o.status === "FAILED_ATTEMPT"
  const isCancelled = o.status === "CANCELLED"

  type HandlerInfo = { role: string; name: string; detail?: string } | null
  const stepHandlers: Partial<Record<StepKey, HandlerInfo>> = {
    PICKED_UP: pickupRider
      ? {
          role: "Pickup rider",
          name: pickupRider.name,
          detail: [maskPhone(pickupRider.phone), pickupRider.zone]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    IN_WAREHOUSE: warehouseData
      ? {
          role: "Sorting hub",
          name: warehouseData.name,
          detail: [
            warehouseData.city,
            o.receivedByWarehouse ? `Logged by ${o.receivedByWarehouse}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    OUT_FOR_DELIVERY: deliveryRider
      ? {
          role: "Delivery rider",
          name: deliveryRider.name,
          detail: [maskPhone(deliveryRider.phone), deliveryRider.zone]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    DELIVERED: deliveryRider
      ? {
          role: "Delivery rider",
          name: deliveryRider.name,
          detail: [maskPhone(deliveryRider.phone), deliveryRider.zone]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
  }

  return (
    <ol className="relative space-y-0">
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
        const stamp = formatStamp(step.timestamp(o))
        const handler = stepHandlers[step.key] ?? null

        const showFailedAfter = step.key === "OUT_FOR_DELIVERY" && isFailed
        const showReturnedAfter = step.key === "OUT_FOR_DELIVERY" && isReturned
        const showCancelledAfter =
          isCancelled && step.rank === currentRank && !isLast
        const hasExceptionAfter =
          showFailedAfter || showReturnedAfter || showCancelledAfter

        return (
          <Fragment key={step.key}>
            <li className="flex gap-3.5">
              {/* Rail */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border transition-all",
                    isCompleted
                      ? "border-chart-2/30 bg-chart-2/15 text-chart-2"
                      : isCurrent
                        ? "border-primary/30 bg-primary/15 text-primary"
                        : "border-border bg-muted text-muted-foreground/50",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                {(!isLast || hasExceptionAfter) && (
                  <span
                    className={cn(
                      "mt-1 mb-0 w-0.5 flex-1 rounded-full",
                      isCompleted || (isCurrent && currentRank > step.rank)
                        ? "bg-chart-2/50"
                        : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  "pb-6",
                  isLast && !hasExceptionAfter && "pb-1",
                  "min-w-0 flex-1 pt-0.5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      "text-sm leading-none font-medium",
                      reached ? "text-foreground" : "text-muted-foreground/60",
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
                    {step.description}
                  </p>
                )}
                {handler && reached && (
                  <div className="mt-2">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      {handler.role}
                    </p>
                    <p className="text-foreground text-xs font-medium">
                      {handler.name}
                    </p>
                    {handler.detail && (
                      <p className="text-muted-foreground text-xs">
                        {handler.detail}
                      </p>
                    )}
                  </div>
                )}
                {step.key === "PICKED_UP" && reached && (
                  <div className="mt-2.5">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Pickup proof
                    </p>
                    {o.pickupProofRefs && o.pickupProofRefs.length > 0 ? (
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        {o.pickupProofRefs.map((link, i) => (
                          <ImageZoom
                            key={i}
                            src={link}
                            alt={`Pickup proof ${i + 1}`}
                            className="size-full rounded-md object-cover transition-transform hover:scale-105"
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
                  <div className="mt-2.5">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                      Proof of delivery
                    </p>
                    {o.deliveryProofRef ? (
                      <ImageZoom
                        src={o.deliveryProofRef}
                        alt="Proof of delivery"
                        className="border-border bg-muted mt-1.5 block size-24 overflow-hidden rounded-md border object-cover"
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
              <li key="FAILED_ATTEMPT" className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <XCircle className="size-4" />
                  </span>
                  <span
                    className="bg-border my-1 min-h-7 w-0.5 flex-1 rounded-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="pt-0.5 pb-7">
                  <p className="text-destructive text-sm font-medium">
                    Delivery attempt failed
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(o.failedAttemptAt) ??
                      "A new attempt will be scheduled."}
                  </p>
                  {o.failureNote ? (
                    <p className="bg-destructive/10 text-destructive mt-2 rounded-md px-2.5 py-1.5 text-xs leading-snug">
                      {o.failureNote}
                    </p>
                  ) : null}
                </div>
              </li>
            )}

            {showReturnedAfter && (
              <li key="RETURNED" className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="border-border bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <Undo2 className="size-4" />
                  </span>
                  <span
                    className="bg-border my-1 min-h-7 w-0.5 flex-1 rounded-full"
                    aria-hidden="true"
                  />
                </div>
                <div className="pt-0.5 pb-7">
                  <p className="text-sm font-medium">Returned to merchant</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(o.returnedAt) ??
                      "This parcel was returned and will not be delivered."}
                  </p>
                </div>
              </li>
            )}

            {showCancelledAfter && (
              <li key="CANCELLED" className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full border">
                    <Ban className="size-4" />
                  </span>
                </div>
                <div className="pt-0.5 pb-0">
                  <p className="text-destructive text-sm font-medium">
                    Order cancelled
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatStamp(o.cancelledAt) ??
                      "This order was cancelled and will not be delivered."}
                  </p>
                  {o.cancelReason ? (
                    <p className="text-muted-foreground mt-0.5 text-xs italic">
                      {o.cancelReason}
                    </p>
                  ) : null}
                </div>
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}
