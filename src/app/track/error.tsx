"use client"

import { ErrorFallback } from "@/components/error-fallback"

export default function TrackError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      description="There was a problem fetching your parcel status. Please try again."
    />
  )
}
