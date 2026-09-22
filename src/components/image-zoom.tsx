"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { ReactNode, useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTrigger,
} from "@/components/ui/dialog"

// Click any image to open it full-size in a modal. Used everywhere a small
// thumbnail (pickup-proof photos, delivery-proof photos, location reference
// photos, etc.) should be inspectable without leaving the page.
export function ImageZoom({
  src,
  alt = "",
  className,
  children,
  asChild = false,
}: {
  src: string
  alt?: string
  className?: string
  children?: ReactNode
  asChild?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ERROR_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" rx="8" fill="#f1f5f9"/><text x="100" y="52" font-family="monospace" font-size="36" font-weight="700" fill="#94a3b8" text-anchor="middle">404</text><text x="100" y="76" font-family="sans-serif" font-size="11" fill="#cbd5e1" text-anchor="middle">Image not found</text></svg>')}`

  const [imgSrc, setImgSrc] = useState(src || ERROR_SVG)

  function handleError() {
    if (imgSrc !== ERROR_SVG) setImgSrc(ERROR_SVG)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          asChild ? (
            (children as React.ReactElement)
          ) : (
            <button
              type="button"
              className="h-[-webkit-fill-available] w-[-webkit-fill-available] hover:cursor-zoom-in"
              title={alt || "View image"}
            />
          )
        }
      >
        {asChild ? undefined : (
          <img
            src={imgSrc}
            alt={alt}
            className={className}
            onError={handleError}
          />
        )}
      </DialogTrigger>

      {/* Compose the portal manually so we get a clean fullscreen popup
          without any of DialogContent's default grid/padding/ring classes. */}
      <DialogPortal>
        <DialogOverlay className="bg-black/80 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 flex items-center justify-center outline-none"
          aria-label={alt || "Image viewer"}
        >
          {/* Close on backdrop click */}
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            onClick={() => setOpen(false)}
            aria-label="Close"
            tabIndex={-1}
          />

          {/* Image — sits above the backdrop button */}
          <img
            src={imgSrc}
            alt={alt}
            onError={handleError}
            className="relative max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />

          {/* Explicit close button */}
          <DialogClose
            className="absolute top-4 right-4 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
            aria-label="Close image viewer"
          >
            <X className="size-4" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}
