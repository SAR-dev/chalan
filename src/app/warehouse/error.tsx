"use client"

import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function WarehouseError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-5">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
          <AlertTriangle className="size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            An unexpected error occurred in the warehouse portal. You can try
            again or come back later.
          </p>
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
