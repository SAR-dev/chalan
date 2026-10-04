import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Groups a form field as label + control + hint, the way every form in the
 * app lays one out (the pattern dialogs and pages used to hand-roll as
 * `flex flex-col gap-2` + `Label`).
 *
 * `subLabel` is a lighter trailing note inside the label — "(optional)",
 * "max 50 kg" — set apart by size/weight/colour instead of being baked into
 * the label string, so optional-ness reads at a glance. It stays *inside*
 * the `<Label>`, so the accessible name keeps the full text ("Publish date
 * (optional)") and clicking the note still focuses the control.
 *
 * `Input` renders its own message when given `error`, because that also wires
 * `aria-invalid`/`aria-describedby` — so `hint` is for explanatory text and
 * `error` here is only for controls that have no such prop (`Select`).
 */
export function Field({
  label,
  subLabel,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string
  /** Lighter trailing note inside the label, e.g. "(optional)". */
  subLabel?: string
  htmlFor: string
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {subLabel ? (
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            {subLabel}
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
      {error ? (
        <p className="text-destructive text-xs" data-slot="field-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
