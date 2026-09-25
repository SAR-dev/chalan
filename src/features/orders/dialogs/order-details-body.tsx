"use client"

import { ExternalLink, Loader2 } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { OrderDetailsContent } from "@/features/orders/components/order-details-content"
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
