"use client"

import { AlertCircle } from "lucide-react"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface FormErrorsProps {
  errors: Record<string, string> | null
  className?: string
}

/**
 * Form-level error banner that displays all validation error messages.
 * Pass the output of `validateFormData()` from `@/lib/validation`.
 *
 * It is also the focus target on a failed submit (ROADMAP R2.4). The field
 * messages are already labelled ("Business name: Required"), so landing here
 * tells a keyboard or screen-reader user both *that* validation failed and
 * *which* fields — and it does so for every form that renders this component,
 * including the 12 dialogs where it sits outside any `<form>` element, which
 * is exactly why walking up to the enclosing form was not an option.
 *
 * This is the "error summary" pattern: focus the summary rather than the first
 * invalid control, so a user hears every failure at once instead of one field
 * at a time.
 */
export function FormErrors({ errors, className }: FormErrorsProps) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const count = errors ? Object.keys(errors).length : 0

  useEffect(() => {
    if (count > 0) summaryRef.current?.focus()
  }, [count])

  if (!errors || count === 0) return null

  const messages = Object.values(errors)

  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      data-testid="form-errors"
      className={cn(
        "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm",
        // Remove the focus ring's offset so taking focus here reads as
        // "you are now on the error summary", not as a hovered control.
        "focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="sr-only">
            {count === 1
              ? "There is 1 problem with this form. "
              : `There are ${count} problems with this form. `}
          </span>
          {messages.map((msg) => (
            <span key={msg}>{msg}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
