"use client"

import { Check, Copy, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

/**
 * Renders a parcel tracking code alongside quick actions to copy the public
 * tracking link and open the public tracking page in a new tab. Shared across
 * merchant and rider tables so the tracking affordance is consistent.
 *
 * The shareable link uses the order's high-entropy `token` when available
 * (ROADMAP P0.1) so the copied URL can authorize the recipient note; it falls
 * back to the human code for legacy rows.
 */
export function TrackingCell({
  code,
  token,
}: {
  code: string
  token?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const path = `/track/${encodeURIComponent(token ?? code)}`

  async function copyLink() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable; silently ignore.
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs">{code}</span>
      <button
        type="button"
        onClick={copyLink}
        aria-label={
          copied ? "Tracking link copied" : "Copy public tracking link"
        }
        title="Copy public tracking link"
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
      >
        {copied ? (
          <Check className="text-chart-2 size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <Link
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open public tracking page"
        title="Open public tracking page"
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
      >
        <ExternalLink className="size-3.5" />
      </Link>
    </div>
  )
}
