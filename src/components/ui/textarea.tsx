import * as React from "react"

import { cn } from "@/lib/utils"

interface TextareaProps extends React.ComponentProps<"textarea"> {
  /**
   * Message for this field, when the caller has one. Same contract as
   * `Input.error` — nothing extra renders when it is absent, so existing call
   * sites are untouched (ROADMAP R2.4).
   */
  error?: string
}

function Textarea({
  className,
  error,
  id,
  "aria-describedby": describedBy,
  ...props
}: TextareaProps) {
  const errorId = React.useId()

  const control = (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm",
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
        data-slot="textarea-error"
        className="text-destructive text-xs"
      >
        {error}
      </p>
    </>
  )
}

export type { TextareaProps }
export { Textarea }
