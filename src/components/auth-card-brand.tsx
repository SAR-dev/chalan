import Link from "next/link"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

/**
 * Brand lockup that lives **inside** the bordered card (the "box") on mobile.
 *
 * Why it is `lg:hidden`: from `lg` up, every auth screen keeps its logo in the
 * page's own brand furniture — the split brand panel on `/login`,
 * `/register`, `/forgot-password`, `/reset-password`, or the page header on
 * `/apply/rider`. Below `lg` that furniture is hidden, so the logo has to
 * reappear; putting it in the card rather than floating above it means a phone
 * renders exactly one framed box instead of a detached logo hovering over a
 * second frame.
 *
 * Drop it as the **first child of `CardHeader`** so it inherits that header's
 * stack gap. `className` is for extra spacing the caller's gap doesn't provide
 * (e.g. `mb-3` under a `gap-1` header).
 *
 * `center` matches the single-column screens (`/activate`, `/activated`) that
 * centre their card content rather than left-aligning it.
 */
export function AuthCardBrand({
  className,
  href = "/",
  center = false,
}: {
  className?: string
  href?: string
  center?: boolean
}) {
  const BrandIcon = siteConfig.icon

  return (
    <Link
      href={href}
      data-testid="auth-card-brand"
      aria-label={`${siteConfig.name} home`}
      className={cn(
        "flex items-center gap-2 lg:hidden",
        center && "justify-center",
        className,
      )}
    >
      <span className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">
        <BrandIcon className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight">
        {siteConfig.name}
      </span>
    </Link>
  )
}
