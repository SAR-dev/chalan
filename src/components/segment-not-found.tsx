import { Package } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

/**
 * In-shell 404 for one of the four role portals.
 *
 * The root `not-found.tsx` renders a full-viewport page with no way back to the
 * portal the user was in, so a bad id under `/dashboard/orders/[code]` threw
 * them out of the shell entirely. This one renders *inside* the segment's
 * layout - which still runs first, so its auth gate applies and an
 * unauthenticated visitor is redirected to sign-in rather than shown a 404
 */
export function SegmentNotFound({
  home,
  label,
}: {
  /** The segment's own root, e.g. `/dashboard`. */
  home: string
  /** What to call it, for the button: "Dashboard", "Merchant", … */
  label: string
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <span className="bg-muted flex size-14 items-center justify-center rounded-full">
          <Package className="text-muted-foreground size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground font-mono text-sm font-medium">
            404
          </p>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground text-sm">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
        </div>
        <Button
          render={<Link href={home} data-testid="segment-not-found-home" />}
          nativeButton={false}
          size="sm"
        >
          Back to {label}
        </Button>
      </div>
    </div>
  )
}
