"use client"

import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#0a0a0a",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            textAlign: "center",
            padding: "0 20px",
            maxWidth: 400,
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#fee2e2",
              color: "#dc2626",
            }}
          >
            <AlertTriangle width={28} height={28} />
          </span>
          <div>
            <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
              A critical error occurred. Please refresh the page or try again
              later.
            </p>
            {error.digest && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  fontFamily: "monospace",
                  color: "#9ca3af",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 500,
              background: "#0a0a0a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
