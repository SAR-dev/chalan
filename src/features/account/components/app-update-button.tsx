"use client"

import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/notify"

/**
 * Forces the tab onto the current build.
 *
 * The service worker already calls `skipWaiting()`, so a redeploy activates the
 * new worker on its own — what it cannot do is rewrite a page the user already
 * has open. That page can be rendering from caches belonging to a build that no
 * longer exists, and the usual symptom is a half-broken screen that survives
 * every ordinary reload.
 *
 * So this deliberately does not try to detect an available update. The user
 * pressing the button *is* the signal: purge the caches, re-check the worker,
 * reload. Anything cleverer would leave the actual broken case untreated.
 */

/** How long to wait for the new worker to take control before reloading anyway. */
const CLAIM_TIMEOUT_MS = 1500

export function AppUpdateButton() {
  const [busy, setBusy] = useState(false)

  async function purgeCachesDirectly() {
    if (!("caches" in window)) return
    const keys = await window.caches.keys()
    await Promise.all(keys.map((key) => window.caches.delete(key)))
  }

  /** Resolves when a worker takes control, or on timeout if none ever does. */
  function waitForClaim(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      navigator.serviceWorker.addEventListener("controllerchange", done, {
        once: true,
      })
      setTimeout(done, CLAIM_TIMEOUT_MS)
    })
  }

  async function handleUpdate() {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker?.getRegistration()

      if (registration) {
        // Purge through the worker so it prunes its own caches, then ask it to
        // re-fetch itself in case a newer build is already deployed.
        const worker = registration.waiting ?? registration.active
        worker?.postMessage({ type: "PURGE_CACHES" })
        await registration.update()
        await waitForClaim()
      } else {
        // First visit, or storage cleared: no worker to ask, so drop the
        // caches directly rather than making the button a no-op.
        await purgeCachesDirectly()
      }

      window.location.reload()
    } catch {
      // A reload is still the best fallback — never leave the user stuck on a
      // button that did nothing.
      setBusy(false)
      toast.error("Could not refresh. Reloading anyway.")
      window.location.reload()
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleUpdate}
      disabled={busy}
      data-testid="account-build-update"
    >
      <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
      {busy ? "Refreshing…" : "Update"}
    </Button>
  )
}
