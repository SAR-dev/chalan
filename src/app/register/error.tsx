"use client"

import { ErrorFallback } from "@/components/error-fallback"

export default function RegisterError({
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
      description="An unexpected error occurred during registration. You can try again or come back later."
    />
  )
}
