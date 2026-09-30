"use client"

import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"

/**
 * Shared body for every route-level error boundary.
 *
 * Each `error.tsx` is a thin wrapper that supplies only its own description, so
 * the markup, the digest line and the logging live in one place.
 */
export function ErrorFallback({
  error,
  reset,
  description,
}: {
  error: Error & { digest?: string }
  reset: () => void
  description: string
}) {
  useEffect(() => {
    logger.error("Route error boundary", { err: error, digest: error.digest })
  }, [error])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-5">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
          <AlertTriangle className="size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
          {error.digest && (
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <Button onClick={reset} size="sm">
          Try again
        </Button>
      </div>
    </div>
  )
}
