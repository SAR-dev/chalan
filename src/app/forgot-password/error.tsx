"use client"

import { ErrorFallback } from "@/components/error-fallback"

export default function ForgotPasswordError({
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
      description="An unexpected error occurred on this page. You can try again or come back later."
    />
  )
}
