"use client"

// This component uses raw fetch() + useState instead of the useOrders() SWR
// hook because it's rendered on the public tracking page (app/track/[id]/page.tsx)
// which has no session — useOrders() is gated on currentUser and unavailable.
// If this widget is ever needed on an authenticated page, prefer calling
// updateReceiverNote() from useOrders() instead.

import { AlertCircle, Check, Send, StickyNote } from "lucide-react"
import { useState } from "react"

interface Props {
  orderId: string
  initialNote: string | null | undefined
  // Whether the order is in a terminal status (DELIVERED / RETURNED / CANCELLED)
  isTerminal: boolean
  /**
   * The order's tracking token — present only when the page was opened via the
   * Token link. It authorizes the public write; when absent the
   * widget renders a read-only hint instead of the form.
   */
  trackingToken?: string | null
}

export function ReceiverNoteWidget({
  orderId,
  initialNote,
  isTerminal,
  trackingToken,
}: Props) {
  const [note, setNote] = useState(initialNote ?? "")
  const [saved, setSaved] = useState(!!initialNote)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const MAX = 100
  const dirty = note.trim() !== (initialNote?.trim() ?? "")

  async function handleSave() {
    const trimmed = note.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/receiver-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverNote: trimmed, token: trackingToken }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Failed to save note. Please try again.")
      } else {
        setSaved(true)
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (isTerminal && !initialNote) return null

  // Opened via the human order code (parcel label / search) — no token, so the
  // public write is not authorized. Explain instead of showing a dead form.
  if (!trackingToken && !isTerminal) {
    return (
      <div
        className="border-border bg-card rounded-xl border p-5 shadow-sm"
        data-testid="receiver-note-locked"
      >
        <div className="mb-2 flex items-center gap-2">
          <StickyNote className="text-muted-foreground size-4" />
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Note from recipient
          </p>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Open the tracking link shared with you to leave a delivery note.
        </p>
      </div>
    )
  }

  return (
    <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <StickyNote className="text-muted-foreground size-4" />
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Note from recipient
        </p>
      </div>

      {isTerminal ? (
        <p className="text-sm leading-relaxed">{initialNote}</p>
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
            Leave a note for the delivery rider — delivery instructions, a safe
            drop spot, or anything helpful. Max 100 characters.
          </p>

          <div className="space-y-2">
            <textarea
              value={note}
              data-testid="receiver-note-input"
              onChange={(e) => {
                setNote(e.target.value.slice(0, MAX))
                setSaved(false)
                setError(null)
              }}
              placeholder="e.g. Ring the bell twice, leave at door if no answer…"
              rows={3}
              maxLength={MAX}
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full resize-none rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs tabular-nums">
                {note.length}/{MAX}
              </p>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty || !note.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="border-primary-foreground/30 border-primary-foreground size-3 animate-spin rounded-full border-2 border-t-transparent" />
                    Saving…
                  </>
                ) : saved && !dirty ? (
                  <>
                    <Check className="size-3" />
                    Saved
                  </>
                ) : (
                  <>
                    <Send className="size-3" />
                    Save note
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive flex items-center gap-1.5 rounded-md px-3 py-2 text-xs">
                <AlertCircle className="size-3.5 shrink-0" />
                {error}
              </div>
            )}

            {saved && !dirty && !error && (
              <p className="text-muted-foreground text-xs">
                ✓ Your note has been saved and will be visible to the rider.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
