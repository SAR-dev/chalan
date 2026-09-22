"use client"

import {
  ArrowLeft,
  Ban,
  Check,
  Loader2,
  Package,
  Pencil,
  X,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { OrderDetailsContent } from "@/features/orders/components/order-details-content"
import { TrackingTimeline } from "@/features/orders/components/tracking-timeline"
import { CancelOrderDialog } from "@/features/orders/dialogs/cancel-order-dialog"
import { useRiders } from "@/features/riders/hooks/use-riders"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { Order, Rider, Warehouse } from "@/lib/types"
import { cn } from "@/lib/utils"

export function OrderDetailView({
  backHref,
  initialOrder,
  initialRiders,
  initialWarehouses,
  onUpdateMerchantNote,
}: {
  backHref: string
  initialOrder?: Order
  initialRiders?: Rider[]
  initialWarehouses?: Warehouse[]
  onUpdateMerchantNote?: (
    orderId: string,
    note: string,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const params = useParams<{ code: string }>()
  const { isReady } = useAuth()
  const { data: orderData, isLoading } = useSWR<Order>(
    isReady && params.code ? `/api/orders/${params.code}` : null,
    jsonFetcher,
    swrOptions,
  )
  const { merchants: swrMerchants } = useMerchants()
  const { riders: swrRiders } = useRiders()
  const { warehouses: swrWarehouses } = useWarehouses()

  const order = orderData ?? initialOrder
  const riders = initialRiders ?? swrRiders
  const warehouses = initialWarehouses ?? swrWarehouses

  const [cancelOpen, setCancelOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteValue, setNoteValue] = useState("")
  const [noteSaving, setNoteSaving] = useState(false)

  if (!isReady || isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Package className="text-muted-foreground size-10" />
        <div>
          <p className="text-lg font-medium">Order not found</p>
          <p className="text-muted-foreground text-sm">
            This order may have been removed or the link is incorrect.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href={backHref} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to orders
        </Button>
      </div>
    )
  }

  const pickupRider = riders.find((r) => r.id === order.pickupRiderId)
  const deliveryRider = riders.find((r) => r.id === order.deliveryRiderId)
  const warehouse = warehouses.find((w) => w.id === order.warehouseId)
  const merchant = swrMerchants.find((m) => m.id === order.merchantId)

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-5">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Orders
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: order details content */}
        <div className="lg:col-span-2">
          <OrderDetailsContent order={order} />
        </div>

        {/* Right: tracking + merchant note */}
        <div className="flex flex-col gap-6">
          <div className="bg-card border-border h-fit rounded-xl border p-6">
            <p className="text-muted-foreground mb-5 text-[11px] font-semibold tracking-widest uppercase">
              Tracking
            </p>
            <TrackingTimeline
              order={order}
              pickupRider={pickupRider}
              warehouse={warehouse}
              deliveryRider={deliveryRider}
              merchant={merchant}
            />
          </div>

          {/* Merchant note (editable for merchants) */}
          {onUpdateMerchantNote && (
            <div className="bg-card border-border rounded-xl border p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                  Merchant note
                </p>
                {!editingNote && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => {
                      setNoteValue(order.merchantNote ?? "")
                      setEditingNote(true)
                    }}
                  >
                    <Pencil className="size-3" />
                    {order.merchantNote ? "Edit" : "Add"}
                  </Button>
                )}
              </div>
              {editingNote ? (
                <div className="space-y-2">
                  <Textarea
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    placeholder="Add a note about this order..."
                    maxLength={100}
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={noteSaving || !noteValue.trim()}
                      onClick={async () => {
                        setNoteSaving(true)
                        const res = await onUpdateMerchantNote(
                          order.id,
                          noteValue.trim(),
                        )
                        setNoteSaving(false)
                        if (!res.ok) return
                        setEditingNote(false)
                      }}
                    >
                      {noteSaving ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      disabled={noteSaving}
                      onClick={() => setEditingNote(false)}
                    >
                      <X className="size-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    !order.merchantNote && "text-muted-foreground",
                  )}
                >
                  {order.merchantNote || "No note added."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {[
        "PENDING",
        "APPROVED",
        "PICKED_UP",
        "IN_WAREHOUSE",
        "IN_TRANSIT",
      ].includes(order.status) && (
        <div className="border-destructive/20 bg-destructive/5 flex items-center justify-between gap-4 rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">
            Cancelling this order is permanent and cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0"
            onClick={() => setCancelOpen(true)}
          >
            <Ban className="size-3.5" />
            Cancel order
          </Button>
        </div>
      )}

      <CancelOrderDialog
        order={order}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  )
}
