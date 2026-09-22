"use client"

import { ExternalLink, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Order } from "@/lib/types"

interface AddressModalProps {
  order: Pick<
    Order,
    | "deliveryAddress"
    | "deliveryCity"
    | "deliveryMapLink"
    | "recipientName"
    | "id"
  >
  /**
   * The address content rendered inline in the table/detail/tracking surface.
   * The whole node becomes the clickable trigger that opens the detail modal.
   */
  children: React.ReactNode
  className?: string
}

/**
 * Wraps an inline address display and, on click, opens a modal showing the
 * full address along with any merchant-supplied map link and image links.
 */
export function AddressModal({
  order,
  children,
  className,
}: AddressModalProps) {
  const mapLink = order.deliveryMapLink?.trim() || null

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className={
              "hover:text-foreground cursor-pointer text-left transition-colors outline-none " +
              (className ?? "")
            }
            title="View location details"
          />
        }
      >
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delivery location</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {order.recipientName || (
                <span className="text-muted-foreground/60 font-normal italic">
                  No recipient name
                </span>
              )}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {order.id || (
                <span className="text-muted-foreground/60 italic">
                  No order code
                </span>
              )}
            </span>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {order.deliveryCity || (
                  <span className="text-muted-foreground/60 font-normal italic">
                    No city provided
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-sm leading-relaxed">
                {order.deliveryAddress || (
                  <span className="text-muted-foreground/60 italic">
                    No address provided
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Map link
            </span>
            {mapLink ? (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex w-fit items-center gap-1.5 text-sm break-all hover:underline"
              >
                <ExternalLink className="size-3.5 shrink-0" />
                Open in maps
              </a>
            ) : (
              <span className="text-muted-foreground/60 text-sm italic">
                No map link provided.
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
