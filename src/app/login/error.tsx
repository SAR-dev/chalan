"use client"

import { ErrorFallback } from "@/components/error-fallback"

export default function LoginError({
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
      description="An unexpected error occurred during login. You can try again or come back later."
    />
  )
}
