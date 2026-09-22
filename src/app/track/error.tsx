"use client"

import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function TrackError({
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
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-5">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
          <AlertTriangle className="size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold">
            Couldn&apos;t load tracking info
          </h1>
          <p className="text-muted-foreground text-sm">
            There was a problem fetching your parcel status. Please try again.
          </p>
        </div>
        <Button onClick={reset} size="sm">
          Try again
        </Button>
      </div>
    </div>
  )
}
