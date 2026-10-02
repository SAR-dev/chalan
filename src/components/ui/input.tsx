import { Input as InputPrimitive } from "@base-ui/react/input"
import * as React from "react"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  /**
   * Message for this field, when the caller has one.
   *
   * Renders nothing extra when absent, so every existing call site is
   * unaffected. When present it marks the control invalid, links the message
   * to it via `aria-describedby`, and prints the message beneath — which is
   * what `aria-invalid:border-destructive` in the className below has been
   * Drawing attention to all along.
   */
  error?: string
}

function Input({
  className,
  type,
  error,
  id,
  "aria-describedby": describedBy,
  ...props
}: InputProps) {
  const errorId = React.useId()

  const control = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
        className,
      )}
      {...props}
      id={id}
      aria-invalid={error ? true : (props["aria-invalid"] ?? undefined)}
      aria-describedby={
        error
          ? describedBy
            ? `${errorId} ${describedBy}`
            : errorId
          : describedBy
      }
    />
  )

  if (!error) return control

  return (
    <>
      {control}
      <p
        id={errorId}
        data-slot="input-error"
        className="text-destructive text-xs"
      >
        {error}
      </p>
    </>
  )
}

export type { InputProps }
export { Input }
