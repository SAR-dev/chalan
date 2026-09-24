import { MapPin, Search, StickyNote, Store, User } from "lucide-react"
import Link from "next/link"
import { ReceiverNoteWidget } from "@/features/orders/components/receiver-note-widget"
import { cn } from "@/lib/utils"
import {
  type fetchOrderData,
  generalArea,
  maskPhone,
  STATUS_COPY,
} from "../lib"
import { Timeline } from "./timeline"

// ─── order detail ─────────────────────────────────────────────────────────────

export function OrderDetail({
  order: o,
  merchant: merchantData,
  pickupRider,
  deliveryRider,
  warehouse: warehouseData,
}: NonNullable<Awaited<ReturnType<typeof fetchOrderData>>>) {
  const statusInfo = STATUS_COPY[o.status]

  return (
    <div className="space-y-4">
      {/* Status hero card */}
      <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="p-5 pb-4">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div>
              <p
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  statusInfo.color,
                )}
              >
                {statusInfo.headline}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {statusInfo.sub}
              </p>
            </div>
            <span className="text-muted-foreground bg-muted mt-0.5 shrink-0 rounded-md px-2.5 py-1 font-mono text-xs">
              {o.id}
            </span>
          </div>
        </div>

        {/* Meta strip */}
        <div className="border-border/60 flex flex-wrap gap-x-6 gap-y-2.5 border-t px-5 py-3.5">
          {merchantData && (
            <div className="flex min-w-0 items-center gap-1.5">
              <Store className="text-muted-foreground size-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  From
                </p>
                <p className="truncate text-xs font-medium">
                  {merchantData.businessName}
                </p>
              </div>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-1.5">
            <MapPin className="text-muted-foreground size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                To
              </p>
              <p className="truncate text-xs font-medium">{generalArea(o)}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <User className="text-muted-foreground size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Customer
              </p>
              <p className="truncate text-xs font-medium">
                {o.recipientName.split(" ")[0]} · {maskPhone(o.recipientPhone)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline card */}
      <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
        <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-widest uppercase">
          Delivery progress
        </p>
        <Timeline
          order={o}
          pickupRider={pickupRider}
          warehouse={warehouseData}
          deliveryRider={deliveryRider}
        />
      </div>

      {/* Merchant note (read-only) */}
      {o.merchantNote && (
        <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <StickyNote className="text-muted-foreground size-4" />
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
              Note from merchant
            </p>
          </div>
          <p className="text-sm leading-relaxed">{o.merchantNote}</p>
        </div>
      )}

      {/* Receiver note widget — lets the recipient leave a delivery instruction */}
      <ReceiverNoteWidget
        orderId={o.id}
        initialNote={o.receiverNote}
        isTerminal={
          o.status === "DELIVERED" ||
          o.status === "RETURNED" ||
          o.status === "CANCELLED"
        }
      />

      {/* Search again button */}
      <div className="pt-2 text-center">
        <Link
          href="/track"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <Search className="size-4" />
          Track another parcel
        </Link>
      </div>
    </div>
  )
}
