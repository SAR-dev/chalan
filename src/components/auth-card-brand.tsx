import Link from "next/link"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

/**
 * Brand lockup that lives **inside** the bordered card (the "box") on mobile.
 *
 * By default it is `lg:hidden`. On the split-layout screens, from `lg` up the
 * page has its own brand furniture — the panel on `/login`, `/register`,
 * `/forgot-password`, `/reset-password`, or the page header on `/apply/rider`
 * — so a second logo inside the card would duplicate it. Below `lg` that
 * furniture is hidden, so the logo has to reappear; putting it in the card
 * rather than floating above it means a phone renders exactly one framed box
 * instead of a detached logo hovering over a second frame.
 *
 * A screen with **no** large-screen brand at all (`/activate`, `/activated`)
 * passes `hideOnLarge={false}`, because there this is the only brand the page
 * has at any width.
 *
 * Drop it as the **first child of `CardHeader`** so it inherits that header's
 * stack gap. `className` is for extra spacing the caller's gap doesn't provide
 * (e.g. `mb-3` under a `gap-1` header).
 *
 * `center` matches the single-column screens (`/activate`, `/activated`), which
 * centre their logo rather than left-aligning it.
 */
export function AuthCardBrand({
  className,
  href = "/",
  center = false,
  hideOnLarge = true,
}: {
  className?: string
  href?: string
  center?: boolean
  /**
   * Whether the lockup disappears from `lg` up. `true` (the default) is for
   * screens whose large layout has its own brand furniture - the split panels
   * on `/login`, `/register`, `/forgot-password`, `/reset-password`, and the
   * page header on `/apply/rider`.
   *
   * Pass `false` on a single-column screen with no such panel
   * (`/activate`, `/activated`): there the lockup is the *only* brand the page
   * has, so hiding it above `lg` would leave large viewports with none.
   */
  hideOnLarge?: boolean
}) {
  const BrandIcon = siteConfig.icon

  return (
    <Link
      href={href}
      data-testid="auth-card-brand"
      aria-label={`${siteConfig.name} home`}
      className={cn(
        "flex items-center gap-2",
        hideOnLarge && "lg:hidden",
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
