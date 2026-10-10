"use client"

import { Menu, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/features/account/hooks/use-auth"
import { AnnouncementBell } from "@/features/announcements/components/announcement-bell"
import { NotificationBell } from "@/features/notifications/components/notification-bell"
import { BRAND_NAME } from "@/lib/constants"
import {
  isNavItemActive,
  type SidebarConfig,
  sidebarVisibleItems,
} from "@/lib/nav-config"
import { cn, initials } from "@/lib/utils"
import { CommandPalette } from "./command-palette"
import { RightNav } from "./right-nav"

const navLinkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150"
const navLinkActive = "bg-sidebar-accent text-sidebar-accent-foreground"
const navLinkIdle =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"

/**
 * The app header for all four role shells, at every breakpoint.
 *
 * It absorbs the old `mobile-header.tsx`: on small screens it owns the
 * hamburger + brand and the nav drawer, so a shell never stacks two headers;
 * on md+ the sidebar owns the brand and this bar carries the actions —
 * menu search, announcements, theme, avatar — over the content column.
 *
 * The sidebar footer and the mobile drawer footer no longer render identity,
 * theme, or sign out: those live in TopNav's avatar → RightNav panel.
 */
export function TopNav({
  config,
  subtitle,
  businessName,
}: {
  config: SidebarConfig
  subtitle?: string | null
  businessName?: string
}) {
  const pathname = usePathname()
  const { currentUser } = useAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [rightNavOpen, setRightNavOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const BrandIcon = config.brandIcon

  // ⌘K / Ctrl+K opens the palette from anywhere in the shell.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <header
      data-testid="topnav"
      className="border-border bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4"
    >
      {/* Mobile: hamburger + brand (the sidebar owns these on md+). */}
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Open menu"
                data-testid="mobile-menu"
              >
                <Menu className="size-4" />
              </Button>
            }
          />
          <SheetContent side="left" className="p-0">
            <Link href="/" className="flex h-16 items-center gap-2 px-4">
              {businessName ? (
                <SheetTitle className="truncate text-[13px] font-semibold">
                  {businessName}
                </SheetTitle>
              ) : (
                <>
                  <BrandIcon className="size-4 shrink-0" />
                  <SheetTitle className="text-[13px] font-semibold">
                    {BRAND_NAME}
                  </SheetTitle>
                </>
              )}
              <span className="bg-sidebar-primary text-sidebar-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                {config.roleLabel}
              </span>
            </Link>
            <SheetDescription className="sr-only">
              Main navigation
            </SheetDescription>

            {/* Nav — closes the drawer on navigation. Deliberately no footer:
                identity, theme and sign out live behind TopNav's avatar
                (RightNav panel), which is reachable at every breakpoint — one
                home for those actions instead of two that can drift apart.
                Utility items (placement: "rightnav") are filtered out here
                too; the panel carries them. */}
            <nav
              aria-label="Main"
              className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
            >
              {sidebarVisibleItems(config.items).map((item, i, visible) => {
                const active = isNavItemActive(item, pathname)
                const Icon = item.icon
                const prevGroup = i > 0 ? visible[i - 1]?.group : undefined
                const showGroupHeader = item.group && item.group !== prevGroup
                return (
                  <div key={item.href}>
                    {showGroupHeader ? (
                      <p className="text-sidebar-foreground/40 mt-3 mb-1 px-3 text-[10px] font-semibold tracking-widest uppercase">
                        {item.group}
                      </p>
                    ) : null}
                    <Link
                      href={item.href}
                      data-testid={`nav-${item.href}`}
                      onClick={() => setDrawerOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        navLinkClass,
                        active ? navLinkActive : navLinkIdle,
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </div>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/" className="flex min-w-0 items-center gap-2">
          {businessName ? (
            <span className="truncate text-sm font-semibold">
              {businessName}
            </span>
          ) : (
            <>
              <div className="flex size-8 items-center justify-center rounded-lg">
                <BrandIcon className="size-5" />
              </div>
              <span className="text-sm font-semibold">{BRAND_NAME}</span>
            </>
          )}
        </Link>
      </div>

      {/* Spacer: brand lives in the sidebar on md+, actions pin right. */}
      <div className="hidden flex-1 md:block" />

      <div className="ml-auto flex items-center gap-1">
        {/* Menu search */}
        <Button
          variant="ghost"
          size="sm"
          data-testid="topnav-search"
          aria-label="Search menu"
          onClick={() => setPaletteOpen(true)}
          className="text-muted-foreground hover:text-foreground gap-2"
        >
          <Search className="size-4" />
          {/* The shortcut hint is noise on a phone keyboard-less layout. */}
          <span className="hidden text-xs md:inline">Search</span>
          <kbd className="border-border text-muted-foreground hidden rounded border px-1.5 py-0.5 text-[10px] font-medium md:inline">
            ⌘K
          </kbd>
        </Button>

        <AnnouncementBell />

        {/* In-app notifications. Renders null for roles that have no inbox
            (see useHasNotifications), so the bar is unchanged for them. */}
        {currentUser?.role === "MERCHANT" ? <NotificationBell /> : null}

        {/* Icon-only on md+; the RightNav panel carries it on mobile so the
            bar stays uncrowded. */}
        <div className="hidden md:block">
          <ThemeToggle />
        </div>

        {/* Avatar → RightNav */}
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="user-menu"
          aria-label="Open account menu"
          aria-haspopup="dialog"
          onClick={() => setRightNavOpen(true)}
          className="rounded-full"
        >
          <Avatar className="size-7">
            {currentUser?.image ? (
              <AvatarImage src={currentUser.image} alt={currentUser.name} />
            ) : null}
            <AvatarFallback className="bg-accent text-accent-foreground text-[11px] font-medium">
              {currentUser ? initials(currentUser.name) : "?"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        config={config}
      />
      <RightNav
        open={rightNavOpen}
        onOpenChange={setRightNavOpen}
        config={config}
        subtitle={subtitle}
      />
    </header>
  )
}
