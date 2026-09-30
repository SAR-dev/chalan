"use client"

import { ErrorFallback } from "@/components/error-fallback"

export default function Error({
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
      description="An unexpected error occurred. You can try again or come back later."
    />
  )
}
