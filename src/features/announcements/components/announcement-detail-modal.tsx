"use client"

import { CheckCheck } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Announcement } from "@/lib/types"

interface Props {
  announcement: Announcement | null
  readIds?: Set<string>
  onMarkRead?: (id: string) => void
  onClose: () => void
}

export function AnnouncementDetailModal({
  announcement,
  readIds,
  onMarkRead,
  onClose,
}: Props) {
  const [displayed, setDisplayed] = useState<Announcement | null>(announcement)
  const [fading, setFading] = useState(false)

  // When the announcement changes, trigger a fade-out then swap content.
  useEffect(() => {
    if (!announcement) {
      setDisplayed(null)
      return
    }
    if (announcement.id === displayed?.id) return

    // Fade out old content, then swap in the new announcement.
    setFading(true)
    const timer = setTimeout(() => {
      setDisplayed(announcement)
      setFading(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [announcement, displayed?.id])

  if (!displayed) return null

  const isRead = readIds?.has(displayed.id) ?? false

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">
            {displayed.title}
          </DialogTitle>
          <DialogDescription>
            The full announcement, with when it was published and whether it has
            been read.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`space-y-4 transition-all duration-150 ${
            fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          {/* Body */}
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {displayed.content}
          </p>

          {/* Footer meta */}
          <p className="text-muted-foreground/70 text-xs">
            Posted by {displayed.createdBy}
          </p>
        </div>

        <DialogFooter>
          {!isRead && onMarkRead && (
            <Button
              variant="default"
              onClick={() => {
                onMarkRead(displayed.id)
              }}
            >
              <CheckCheck className="size-4" />
              Mark as read
            </Button>
          )}
          <DialogClose render={<Button variant="outline" onClick={onClose} />}>
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
