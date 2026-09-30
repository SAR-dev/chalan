"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Gutter between a mobile toast and each screen edge, in pixels.
 *
 * 16px keeps the toast off both edges without stealing meaningful width from
 * the message — at 320px the toast is still 288px wide, which is the smallest
 * size the requirement cares about.
 */
const TOAST_GUTTER = 16

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      /**
       * Horizontal margin between the toast and each screen edge on mobile.
       *
       * Sonner's `@media (max-width: 600px)` rule already stretches the toast
       * to `calc(100% - gutter * 2)`, so passing the value here is not what
       * makes it responsive — it is what makes the gutter *ours*. Without it
       * the margin is whatever sonner happens to ship: an upgrade that changed
       * its default would silently move every toast, and the requirement to
       * keep a gutter off both edges would no longer be guaranteed by anything
       * in this repo.
       *
       * Measured at the phone widths the requirement targets (see
       * `e2e/specs/26-toast-responsive.spec.ts`): 90% of a 320px viewport,
       * 91.5% of 375px, 94.7% of 600px, each with a 16px gutter and no edge
       * contact.
       */
      mobileOffset={TOAST_GUTTER}
      // Distinct colors per toast type (green success, red error, amber
      // warning, blue info) plus a dismiss button for clarity.
      richColors
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
