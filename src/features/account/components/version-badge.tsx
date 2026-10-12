"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AppUpdateButton } from "@/features/account/components/app-update-button"
// Type-only: `src/lib/version.ts` reads `node:fs`, so a value import here would
// pull that into the browser bundle. The label is formatted below instead.
import type { AppVersion } from "@/lib/version"

/**
 * The running build's version, in the top bar.
 *
 * Just the version sits in the bar — it is there to be glanceable, not read. The
 * detail (commit, recovery) lives behind a click, because nothing in the app
 * changes per version and a permanent card on Account Settings was a place
 * nobody looked.
 */
export function VersionBadge({ version }: { version?: AppVersion }) {
  const [open, setOpen] = useState(false)

  // A layout that forgets to pass this must render nothing rather than an empty
  // chip.
  if (!version) return null

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="topnav-version"
        className="text-muted-foreground hover:text-foreground font-mono text-xs"
      >
        v{version.version}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="version-dialog">
          <DialogHeader>
            <DialogTitle>App version</DialogTitle>
            <DialogDescription>
              The version of Chalan you are currently running.
            </DialogDescription>
          </DialogHeader>

          <dl className="flex flex-col gap-2 text-sm pt-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-mono" data-testid="version-dialog-version">
                v{version.version}
              </dd>
            </div>
            {version.commit ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Commit</dt>
                <dd className="font-mono" data-testid="version-dialog-commit">
                  {version.commit}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="text-muted-foreground text-sm py-2">
            If the app looks stale or something will not load, update to clear
            the files cached by your last visit.
          </p>

          <DialogFooter className="justify-start">
            <AppUpdateButton />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
