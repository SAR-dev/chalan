"use client"

import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Copy,
  Inbox,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { Fragment, type ReactNode, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { NotificationEventIcon } from "@/features/notifications/components/notification-event-icon"
import type { NotificationGroup } from "@/lib/notification-group"
import { notificationStatus } from "@/lib/notification-status"
import {
  bucketLabel,
  formatNotificationTime,
  formatNotificationTimeAbsolute,
  type TimeBucket,
  timeBucket,
} from "@/lib/notification-time"
import { cn } from "@/lib/utils"

// =============================================================================
// The notification list — one component, three surfaces.
//
// The tray, the inbox page and the mobile page render *this*. They differ only
// in the container around it: a 300px sheet, a page with a header, a full-screen
// sheet. Rows, grouping, unread treatment, expansion and timestamps are decided
// once, here.
//
// That constraint is the whole point. The previous arrangement had a tray row and
// an inbox row written separately, which is how they drifted: the tray showed a
// timestamp the inbox did not, and the inbox's archive button was unreachable on
// a phone for two releases. One renderer means a fix lands in all three places
// or in none.
// =============================================================================

/**
 * A collapsed event, kept so an expanded group can show what it swallowed.
 *
 * The group carries only ids and a count, which is enough to mark the whole thing
 * read but not enough to tell the reader *what* `×3` covers. Without the members,
 * expanding a group would show three grey lines saying nothing — technically
 * responsive, useless in practice.
 */
export interface GroupedEvent {
  id: string
  event: string
  title: string
  createdAt: string
  actorName: string | null
  readAt: string | null
}

export interface NotificationListProps {
  groups: NotificationGroup[]
  /** Members of each group, newest first. Optional: expansion is hidden without. */
  members?: Map<string, GroupedEvent[]>
  /**
   * `tray` is the 300px sheet: tighter rows, no day headers, archive hidden.
   * `page` is a full-width list: sticky headers, room for actions.
   */
  variant: "tray" | "page"
  /** Keys whose collapsed events are on screen. */
  expanded: Set<string>
  onToggleExpand?: (key: string) => void
  /** Fires when a row is activated — marks the group read, then navigates. */
  onOpen?: (group: NotificationGroup) => void
  onArchive?: (group: NotificationGroup) => void
  onRestore?: (group: NotificationGroup) => void
  /** Archived view: rows get a Restore control instead of Archive. */
  archived?: boolean
  /** Group keys to show sticky day headers. Off in the tray — too short for them. */
  stickyHeaders?: boolean
  emptyState?: ReactNode
}

/**
 * What the second line says.
 *
 * Rows written before `subject` existed have no "Recipient → City" to show. The
 * old fallback was the bare order code, which is the one string in the app that
 * identifies nothing to a human — twenty of them read as twenty identical rows,
 * which is the exact complaint `subject` was added to fix.
 *
 * So a row with no subject says *that it has none*: `Order ORD-1 · details
 * unavailable`. It is longer than the code it replaces and slightly uglier, and
 * that is the trade — it tells the reader the information is missing rather than
 * leaving them to wonder why this row is unlike its neighbours.
 */
export function describeSubject(
  group: Pick<NotificationGroup, "subject" | "orderId" | "event">,
): { text: string; degraded: boolean } {
  if (group.subject) return { text: group.subject, degraded: false }
  if (group.orderId)
    return {
      text: `Order ${group.orderId} · details unavailable`,
      degraded: true,
    }
  // Money events carry no order and no subject by design — there is nothing to
  // snapshot. Calling that "unavailable" would be wrong, so say what it is.
  return { text: "No order reference", degraded: false }
}

function StatusChip({ event }: { event: string }) {
  const status = notificationStatus(event)
  if (!status) return null

  return (
    <span
      data-testid="notification-status-chip"
      data-event={event}
      data-kind={status.kind}
      // The label is the message and the tone is reinforcement. A reader who
      // cannot separate the hues still reads "Delivered" or "Payout requested".
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
        status.kind === "money"
          ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
          : "bg-muted text-muted-foreground",
      )}
    >
      {status.label}
    </span>
  )
}

function CopyOrderId({ orderId }: { orderId: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy order reference ${orderId}`}
      data-testid="notification-copy-order"
      onClick={(e) => {
        // A copy button inside a link row would otherwise navigate. The row is
        // the link; this is a button that happens to sit inside it.
        e.preventDefault()
        e.stopPropagation()
        void navigator.clipboard?.writeText(orderId)
      }}
      // Pointer-only. On a 390px row the copy control — plus the status chip,
      // the unread dot and the timestamp — squeezed the subject down to a single
      // character, and there is no hover tooltip to compensate on touch. The
      // order id stays reachable from the linked order page and the row's
      // `title` on desktop.
      className="text-muted-foreground hover:text-foreground hidden size-6 shrink-0 sm:inline-flex"
    >
      <Copy className="size-3" aria-hidden />
    </Button>
  )
}

export function NotificationList({
  groups,
  members,
  variant,
  expanded,
  onToggleExpand,
  onOpen,
  onArchive,
  onRestore,
  archived = false,
  stickyHeaders = false,
  emptyState,
}: NotificationListProps) {
  if (groups.length === 0) {
    return (
      <div
        data-testid="notification-list-empty"
        className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-center"
      >
        {emptyState ?? <CaughtUpEmpty />}
      </div>
    )
  }

  const isTray = variant === "tray"

  // Day headers are a projection of the already-sorted list, not a second sort:
  // `groups` is newest-first by construction, so a bucket only ever runs forward.
  const rows = groups.map((group) => ({
    group,
    bucket: timeBucket(group.createdAt),
  }))
  const showHeader = stickyHeaders && !isTray

  return (
    <ul
      data-testid="notification-list"
      className={cn(
        "flex flex-col",
        isTray ? "divide-sidebar-border divide-y" : "gap-2",
      )}
      aria-label="Notifications"
    >
      {rows.map(({ group, bucket }, i) => {
        const prev = rows[i - 1]
        const headerBucket: TimeBucket | null =
          showHeader && (!prev || prev.bucket !== bucket) ? bucket : null
        const isExpanded = expanded.has(group.key)

        return (
          <Fragment key={group.key}>
            {headerBucket && (
              <li
                data-testid="notification-day-header"
                data-bucket={headerBucket}
                // Sticky, with a background, because a transparent one would let
                // rows show through the header as they scroll underneath.
                role="presentation"
                className={cn(
                  "bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky z-10 flex items-center gap-2 py-1.5 text-xs font-medium backdrop-blur-sm",
                  isTray ? "px-4" : "mt-1 first:mt-0 px-1",
                )}
              >
                <span className="text-muted-foreground">
                  {bucketLabel(headerBucket)}
                </span>
                <span className="bg-border h-px flex-1" aria-hidden />
              </li>
            )}

            <li
              data-testid={`notification-row-${group.key}`}
              data-unread={group.unread || undefined}
              data-expanded={isExpanded || undefined}
              aria-label={`${group.title}${group.unread ? ", unread" : ""}`}
              className={cn(
                "group relative flex items-start rounded-lg border transition-colors",
                // Unread carries three independent signals: a left rule, a tint,
                // and a heavier title weight. Any one of them can be lost —
                // colour to a colourblind reader, the tint to a low-contrast
                // display, the weight to a screen reader's flattening — so the
                // state survives losing all three individually.
                group.unread && !archived
                  ? "bg-primary/5 border-primary/40 border-l-4"
                  : "bg-card",
                archived && "bg-muted/40 border-dashed",
                isTray
                  ? "gap-3 border-0 border-b-0 px-4 py-3"
                  : "gap-4 px-4 py-4 sm:px-5",
                !archived && "hover:bg-muted/50",
              )}
            >
              <NotificationEventIcon event={group.event} />

              <Link
                href={group.href}
                onClick={() => onOpen?.(group)}
                data-testid={`notification-open-${group.key}`}
                data-notification-row-link
                className="flex min-w-0 flex-1 flex-col gap-0.5 focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {/* Weight, not opacity, marks a read row back. The earlier
                      `text-foreground/70` measured below 4.5:1 on the card
                      background, which fails WCAG AA for body text — the dimming
                      was costing legibility to signal something the dot and the
                      rule already say. */}
                  <span
                    data-testid="notification-row-title"
                    className={cn(
                      "truncate text-sm",
                      group.unread && !archived
                        ? "text-foreground font-semibold"
                        : "text-foreground font-normal",
                    )}
                  >
                    {group.title}
                  </span>
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <SubjectLine group={group} />
                  {/* The chip lives on the meta line, not beside the title, on
                      every surface. Beside the title it squeezed "Rider picked up
                      the parcel" down to "Rider picked up the pa…" at both 300px
                      and 390px — the one string that says what happened,
                      truncated to say less than the icon beside it already does.
                      Here it reads as part of the fact: "E2E Contents → Barisal ·
                      Admin01 [Approved]". */}
                  <StatusChip event={group.event} />
                  <UnreadDot unread={group.unread && !archived} />
                  <CountBadge
                    group={group}
                    isTray={isTray}
                    isExpanded={isExpanded}
                    hasMembers={(members?.get(group.key)?.length ?? 0) > 0}
                    onToggle={onToggleExpand}
                  />
                  <TimeStamp iso={group.createdAt} />
                  {group.orderId && !isTray && (
                    <CopyOrderId orderId={group.orderId} />
                  )}
                </span>
              </Link>

              {!isTray && !archived && onArchive && (
                <RowAction
                  label={`Archive notification about ${group.title}`}
                  testId={`notification-archive-${group.key}`}
                  // Always visible below `sm`. `group-hover` alone pinned this at
                  // opacity 0 on a phone, where there is no hover — the control
                  // existed and could not be operated.
                  //
                  // 44px on touch: measured at 28px tall with `size-8`, which is
                  // under the platform minimum for a tap target and is why the
                  // dismissal control kept missing people on phones. Pointer
                  // devices get the tighter size back, where it is precise to use.
                  className="text-muted-foreground hover:text-foreground size-11 shrink-0 opacity-100 transition-opacity focus-visible:opacity-100 sm:size-8 sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => onArchive(group)}
                >
                  <Archive className="size-4" aria-hidden />
                </RowAction>
              )}

              {!isTray && archived && onRestore && (
                <RowAction
                  label={`Restore notification about ${group.title}`}
                  testId={`notification-restore-${group.key}`}
                  className="text-muted-foreground hover:text-foreground size-11 shrink-0 sm:size-8"
                  onClick={() => onRestore(group)}
                >
                  <ArchiveRestore className="size-4" aria-hidden />
                </RowAction>
              )}

              {isExpanded && members && (
                <CollapsedEvents events={members.get(group.key) ?? []} />
              )}
            </li>
          </Fragment>
        )
      })}
    </ul>
  )
}

function RowAction({
  label,
  testId,
  className,
  onClick,
  children,
}: {
  label: string
  testId: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={cn("rounded-md", className)}
    >
      {children}
    </Button>
  )
}

function CaughtUpEmpty() {
  return (
    <>
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Check className="size-5" aria-hidden />
      </div>
      <p className="text-foreground text-sm font-medium">
        You&apos;re all caught up
      </p>
      <p className="max-w-56 text-xs">
        Nothing needs your attention. New order updates will appear here.
      </p>
    </>
  )
}

function SubjectLine({
  group,
}: {
  group: Pick<NotificationGroup, "subject" | "orderId" | "event" | "actorName">
}) {
  const { text, degraded } = describeSubject(group)
  const withActor = group.actorName ? `${text} · ${group.actorName}` : text

  return (
    <span
      data-testid="notification-row-subject"
      data-degraded={degraded || undefined}
      // The order code is deliberately absent from the row: the row links to the
      // order, and beside a "Recipient → City" snapshot the code is noise. It
      // lives in the tooltip and behind the copy button instead.
      title={group.orderId ? `Order ${group.orderId}` : undefined}
      className={cn(
        "min-w-0 flex-1 truncate text-xs",
        degraded ? "text-muted-foreground italic" : "text-muted-foreground",
      )}
    >
      {withActor}
    </span>
  )
}

/**
 * The unread dot.
 *
 * Present on every surface, including the tray, because it is the one signal that
 * survives greyscale, low contrast and a screen reader's flat rendering.
 */
function UnreadDot({ unread }: { unread: boolean }) {
  if (!unread) return null
  return (
    <>
      <span
        data-testid="notification-unread-dot"
        aria-hidden
        className="bg-primary size-2 shrink-0 rounded-full"
      />
      <span className="sr-only">Unread</span>
    </>
  )
}

function CountBadge({
  group,
  isTray,
  isExpanded,
  hasMembers,
  onToggle,
}: {
  group: NotificationGroup
  isTray: boolean
  isExpanded: boolean
  hasMembers: boolean
  onToggle?: (key: string) => void
}) {
  if (group.count <= 1) return null

  const body = (
    <>
      {isExpanded ? (
        <ChevronDown className="size-3" aria-hidden />
      ) : (
        <span aria-hidden>×{group.count}</span>
      )}
      <span className="sr-only">
        {isExpanded ? "Hide" : "Show"} {group.count} collapsed updates
      </span>
    </>
  )

  // Expandable only where the members were actually sent; a `×3` that expands to
  // nothing is worse than one that does not pretend to.
  if (!hasMembers || !onToggle) {
    return (
      <span
        data-testid="notification-count"
        className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
      >
        <span aria-hidden>×{group.count}</span>
        <span className="sr-only">{group.count} updates</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle(group.key)
      }}
      data-testid={`notification-expand-${group.key}`}
      data-expanded={isExpanded || undefined}
      aria-expanded={isExpanded}
      className={cn(
        "bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums focus-visible:ring-2 focus-visible:outline-none",
        isTray && "max-w-6 justify-center",
      )}
    >
      {body}
    </button>
  )
}

function TimeStamp({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      // The exact moment is in the tooltip; the visible label stays short
      // because "6:43 PM · Oct 13" is 120px of a 390px phone row, and on a
      // narrow screen that cost the title its own text.
      title={formatNotificationTimeAbsolute(iso)}
      data-testid="notification-time"
      className="text-muted-foreground shrink-0 text-xs tabular-nums"
    >
      {formatNotificationTime(iso)}
    </time>
  )
}

function CollapsedEvents({ events }: { events: GroupedEvent[] }) {
  if (events.length <= 1) return null

  return (
    <ul
      data-testid="notification-collapsed"
      aria-label="Collapsed updates"
      // A child list inside a listitem: the collapsed events are part of *this*
      // row, not siblings of it.
      className="border-border ml-4 mt-2 flex w-full flex-col gap-1.5 border-l pl-3"
    >
      {events.slice(1).map((e) => {
        const status = notificationStatus(e.event)
        return (
          <li key={e.id} className="flex min-w-0 items-center gap-2">
            <EventGlyph event={e.event} />
            <span className="min-w-0 flex-1 truncate text-xs">
              <span className="text-muted-foreground">
                {status?.label ?? e.title}
              </span>
              {e.actorName && (
                <span className="text-muted-foreground/70">
                  {" · "}
                  {e.actorName}
                </span>
              )}
            </span>
            {!e.readAt && (
              <span
                data-testid="notification-collapsed-unread"
                className="bg-primary size-1.5 shrink-0 rounded-full"
                aria-hidden
              />
            )}
            <time
              dateTime={e.createdAt}
              title={formatNotificationTimeAbsolute(e.createdAt)}
              className="text-muted-foreground shrink-0 text-[11px] tabular-nums"
            >
              {formatNotificationTime(e.createdAt)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}

function EventGlyph({ event }: { event: string }) {
  const Icon: LucideIcon =
    notificationStatus(event)?.kind === "money" ? Inbox : ChevronDown
  return <Icon className="text-muted-foreground size-3 shrink-0" aria-hidden />
}
/**
 * Arrow keys / `e` / `u` over the rows, scoped to the container.
 *
 * Scoped rather than global on purpose: `e` and `u` are ordinary typing keys, and
 * a document-level listener would archive a notification while the reader typed
 * a recipient's name into a search box. A container listener with a guard for
 * text entry gets the shortcut where it is wanted and nowhere else.
 *
 * Focus moves to the row *link*, not the `<li>`, because the link is what Enter
 * activates — roving focus onto a non-interactive element would make the arrows
 * work and silently do nothing on Enter.
 */
export function useNotificationKeyboard({
  containerRef,
  onArchive,
  onToggleRead,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  /** Row keys of the focused row, resolved from its nearest list item. */
  onArchive?: (key: string) => void
  onToggleRead?: (key: string) => void
}) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const links = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-notification-row-link]"),
      )
    const keyOf = (link: HTMLElement) =>
      link
        .closest<HTMLElement>("[data-testid^='notification-row-']")
        ?.dataset.testid?.replace("notification-row-", "") ?? null

    const focusAt = (index: number) => {
      const all = links()
      if (all.length === 0) return
      all[Math.max(0, Math.min(index, all.length - 1))]?.focus()
    }

    const currentIndex = () => {
      const all = links()
      const active = document.activeElement
      return all.findIndex((l) => l === active || l.contains(active))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return

      const index = currentIndex()
      if (index < 0 && !["ArrowDown", "ArrowUp"].includes(e.key)) return

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          focusAt(index + 1)
          return
        case "ArrowUp":
          e.preventDefault()
          focusAt(index - 1)
          return
        case "Home":
          e.preventDefault()
          focusAt(0)
          return
        case "End":
          e.preventDefault()
          focusAt(links().length - 1)
          return
        case "e":
        case "E": {
          const key = index < 0 ? null : keyOf(links()[index])
          if (!key || !onArchive) return
          e.preventDefault()
          onArchive(key)
          return
        }
        case "u":
        case "U": {
          const key = index < 0 ? null : keyOf(links()[index])
          if (!key || !onToggleRead) return
          e.preventDefault()
          onToggleRead(key)
          return
        }
      }
    }

    container.addEventListener("keydown", onKeyDown)
    return () => container.removeEventListener("keydown", onKeyDown)
  }, [containerRef, onArchive, onToggleRead])
}
