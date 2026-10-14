"use client"

import { ChevronLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { pageContent } from "@/config/content"
import { NotificationInbox } from "@/features/notifications/components/notification-inbox"
import { useNotificationCount } from "@/features/notifications/hooks/use-notifications"

/**
 * `/merchant/notifications` — a page on desktop, the full-screen list on mobile.
 *
 * One route, both layouts. A separate `/notifications` was considered and
 * rejected: the sidebar already links here, so a second URL would mean two
 * addresses for one list and one of them would go stale.
 *
 * The inbox is mounted **once** and simply re-flows. Rendering it twice behind a
 * breakpoint — the obvious way to get two layouts — means two SWR subscriptions,
 * two identical fetches, and duplicate `data-testid`s that make every selector
 * ambiguous. Only the furniture around it is responsive, so resizing across `sm`
 * swaps chrome and leaves open groups, the active tab and scroll alone.
 */
export default function MerchantNotificationsPage() {
  const router = useRouter()
  const { newCount } = useNotificationCount()
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Where to go back to.
   *
   * `router.back()` is right in principle but wrong in practice here: the mobile
   * entry point is a link from wherever the reader happened to be, so there may
   * be no history entry at all — a notification opened from a cold deep link
   * would send the reader backwards out of the app. The dashboard fallback covers
   * that case and is always somewhere to go.
   */
  const goBack = useCallback(() => {
    if (window.history.length > 1) router.back()
    else router.push("/merchant/orders")
  }, [router])

  // Scroll is remembered on unmount rather than on every scroll event: this page
  // is navigated away from by tapping a row, and the position that matters is the
  // one held at that moment. Writing to sessionStorage on each frame would be a
  // write per scroll tick to save a value read once.
  useEffect(() => {
    return () => {
      if (window.scrollY > 0)
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
    }
  }, [])

  // Put the scroll position back on the way in. Without it, tapping the fourth
  // row and coming back drops the reader at the top of a list they had already
  // scrolled through.
  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY)
    if (!saved) return
    sessionStorage.removeItem(SCROLL_KEY)
    const y = Number(saved)
    if (!Number.isFinite(y) || y <= 0) return
    // After paint: the rows have to exist before an offset means anything.
    const id = requestAnimationFrame(() => window.scrollTo({ top: y }))
    return () => cancelAnimationFrame(id)
  }, [])

  /**
   * Pull to refresh.
   *
   * `touchstart` → `touchmove` → `touchend` rather than a library: this is the
   * one gesture on the page, and the constraint against new dependencies is
   * worth more here than the generality a library would buy. The pull is ignored
   * unless the page is already at the top — mid-scroll, a downward drag is a
   * scroll, not a request for anything.
   */
  const pullStart = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY > 0) return
    pullStart.current = e.touches[0]?.clientY ?? null
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const start = pullStart.current
    if (start === null) return
    if ((e.touches[0]?.clientY ?? 0) - start > 80) setRefreshing(true)
  }, [])

  const onTouchEnd = useCallback(() => {
    pullStart.current = null
    if (!refreshing) return
    setRefreshing(false)
    // A real reload, not a pretend: the feed polls every 30s and this is an
    // explicit request for the current state.
    window.location.reload()
  }, [refreshing])

  return (
    <div
      // `env(safe-area-inset-*)` rather than a fixed guess: on a notched phone
      // the status bar and the home indicator both overlap whatever sits at the
      // edge, and hardcoded padding is wrong on every device but the one it was
      // measured on.
      className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-0 sm:pb-0"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Mobile-only chrome: the back affordance and a live unread count. */}
      <header
        data-testid="notification-mobile-header"
        className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 border-b backdrop-blur-sm sm:hidden"
      >
        <div className="flex items-center gap-2 px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            aria-label="Back"
            data-testid="notification-mobile-back"
            // 44px: the platform minimum for a comfortable tap target. The 32px
            // icon button is fine with a mouse and not fine under a thumb.
            className="size-11"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Button>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            Notifications
            {newCount > 0 && (
              <span
                data-testid="notification-mobile-unread-count"
                className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums"
              >
                {newCount}
              </span>
            )}
          </h1>
        </div>
      </header>

      {refreshing && (
        <p
          role="status"
          data-testid="notification-refreshing"
          className="text-muted-foreground px-4 py-2 text-center text-xs sm:hidden"
        >
          Refreshing…
        </p>
      )}

      <NotificationInbox
        title={pageContent.merchant.notifications.title}
        description={pageContent.merchant.notifications.description}
      />
    </div>
  )
}

const SCROLL_KEY = "notifications:scrollY"
