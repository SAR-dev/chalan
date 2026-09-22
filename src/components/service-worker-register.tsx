"use client"

import { useEffect } from "react"

/**
 * Registers the PWA service worker once the app has hydrated. Runs in the
 * background so it never blocks first paint. Only register when the browser
 * supports service workers and the page is served over a secure context.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("[pwa] Service worker registration failed:", error)
    })
  }, [])

  return null
}
