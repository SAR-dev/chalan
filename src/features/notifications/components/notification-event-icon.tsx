import {
  Ban,
  Banknote,
  Bike,
  CircleCheck,
  CircleX,
  type LucideIcon,
  PackageCheck,
  PackagePlus,
  Truck,
  Undo2,
  Wallet,
  Warehouse,
} from "lucide-react"
import { BADGE_TONES, type BadgeTone } from "@/lib/constants"
import { isOrderEvent, type OrderEvent } from "@/lib/order-event"

/**
 * The glyph and tone a notification wears for its event.
 *
 * Tones are reused from `BADGE_TONES` rather than invented, so a delivered
 * notification carries the exact green an order badge shows as Delivered. If the
 * two palettes were separate they would drift, and "delivered" would quietly
 * stop meaning the same colour in two places.
 *
 * One map, used by both the tray and the inbox: a second copy is how the tray
 * starts showing a red cross for delivered parcels while the inbox still shows
 * the check.
 */
const EVENT_ICON_TONE: Record<
  OrderEvent,
  { Icon: LucideIcon; tone: BadgeTone }
> = {
  "order.created": { Icon: PackagePlus, tone: "pending" },
  "order.approved": { Icon: CircleCheck, tone: "info" },
  "order.picked-up": { Icon: Warehouse, tone: "violet" },
  "order.dispatched": { Icon: Truck, tone: "brand" },
  "order.out-for-delivery": { Icon: Bike, tone: "transit" },
  "order.delivered": { Icon: PackageCheck, tone: "success" },
  "order.failed": { Icon: CircleX, tone: "danger" },
  "order.returned": { Icon: Undo2, tone: "neutral" },
  "order.cancelled": { Icon: Ban, tone: "slate" },
  // Money events sit outside the order vocabulary, so they borrow the tones the
  // payout screens already use rather than an order status.
  "cash.submitted": { Icon: Banknote, tone: "success" },
  "payout.approved": { Icon: Wallet, tone: "violet" },
}

/**
 * Status icon for a notification.
 *
 * `event` arrives as a plain string from the database, so an unrecognised value
 * renders a neutral dot rather than nothing — a row with no icon reads as a
 * rendering bug, whereas a neutral one reads as "no status to show".
 */
export function NotificationEventIcon({
  event,
  className,
}: {
  event: string
  /** Overrides the wrapper size; the glyph itself is always 4x4. */
  className?: string
}) {
  const entry = isOrderEvent(event) ? EVENT_ICON_TONE[event] : null

  if (!entry) {
    return (
      <span
        aria-hidden
        data-testid="notification-status-icon-unknown"
        className={`bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full ${className ?? ""}`}
      >
        <span className="bg-muted-foreground/40 size-1.5 rounded-full" />
      </span>
    )
  }

  const { Icon, tone } = entry
  // BADGE_TONES is written for badges, which have a border; a circle does not.
  // Everything except the border halves is kept — including the `dark:`
  // overrides, which is the reason this filters rather than taking a fixed slice.
  // Dropping them would leave, say, a delivered parcel reading `text-green-600`
  // on a dark background.
  const tint = BADGE_TONES[tone]
    .split(" ")
    .filter((c) => !c.includes("border"))
    .join(" ")

  return (
    <span
      aria-hidden
      data-testid="notification-status-icon"
      data-event={event}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tint} ${className ?? ""}`}
    >
      <Icon className="size-4" />
    </span>
  )
}
