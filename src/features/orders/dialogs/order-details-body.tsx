"use client"

import { ExternalLink, Loader2 } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { OrderDetailsContent } from "@/features/orders/components/order-details-content"
import { TrackingTimeline } from "@/features/orders/components/tracking-timeline"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import type { Order } from "@/lib/types"

export function OrderDetailsBody({
  orderCode,
  open,
  detailsHref,
}: {
  orderCode: string
  open: boolean
  detailsHref?: string
}) {
  const { data: order, isLoading } = useSWR<Order>(
    open && orderCode ? `/api/orders/${orderCode}` : null,
    jsonFetcher,
    swrOptions,
  )

  if (isLoading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <p className="text-muted-foreground py-8 text-center text-xs">
        Order not found.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <OrderDetailsContent order={order} />

      {/* The dialog's own description promises "delivery history" — before this
          it was the one details surface without a timeline, so the promise was
          only kept on the full page. Riders/warehouse are not loaded here (the
          fetch returns the order alone), so steps still show their timestamps
          and proofs, just without the name attached. */}
      <div className="bg-card border-border rounded-xl border p-6">
        <p className="text-muted-foreground mb-5 text-[11px] font-semibold tracking-widest uppercase">
          Tracking
        </p>
        <TrackingTimeline order={order} />
      </div>

      {/* Open full page */}
      <div className="border-border mt-2 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          render={
            <Link href={detailsHref ?? `/dashboard/orders/${order.id}`} />
          }
          nativeButton={false}
        >
          <ExternalLink className="size-3.5" />
          Open full order page
        </Button>
      </div>
    </div>
  )
}
