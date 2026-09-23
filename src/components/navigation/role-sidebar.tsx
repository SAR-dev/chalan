"use client"

import { LogOut } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/account/hooks/use-auth"
import { BRAND_NAME } from "@/lib/constants"
import type { SidebarConfig } from "@/lib/nav-config"
import { cn, initials } from "@/lib/utils"

// Claude-style nav link: quiet by default, soft neutral fill on hover,
// and a gentle tonal fill (not a saturated brand color) when active.
const navLinkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150"
const navLinkActive = "bg-sidebar-accent text-sidebar-accent-foreground"
const navLinkIdle =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"

export function RoleSidebar({
  config,
  footerSubtitle,
  fallbackName,
  fallbackInitials = "?",
  logoUrl,
  brandColor,
  hidePlatformBranding = false,
}: {
  config: SidebarConfig
  footerSubtitle?: string | null
  fallbackName?: string
  fallbackInitials?: string
  logoUrl?: string
  brandColor?: string
  hidePlatformBranding?: boolean
}) {
  const pathname = usePathname()
  const { currentUser, logout } = useAuth()
  const BrandIcon = config.brandIcon

  const sidebarStyle = brandColor
    ? ({ "--sidebar-primary": brandColor } as React.CSSProperties)
    : undefined

  return (
    <aside
      className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden md:flex"
      style={sidebarStyle}
    >
      {/* Brand — logo sized with the text, role badge in accent color */}
      <Link href="/" className="flex h-16 items-center gap-2 px-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="size-4 shrink-0 object-contain"
          />
        ) : (
          <BrandIcon className="size-4 shrink-0" />
        )}
        {!hidePlatformBranding && (
          <p className="text-[13px] font-semibold">{BRAND_NAME}</p>
        )}
        <span className="bg-sidebar-primary text-sidebar-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
          {config.roleLabel}
        </span>
      </Link>

      {/* Nav — no rules, no boxes, just rhythm and spacing */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {config.items.map((item, i) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          const prevGroup = i > 0 ? config.items[i - 1].group : undefined
          const showGroupHeader = item.group && item.group !== prevGroup
          return (
            <div key={item.href}>
              {showGroupHeader && (
                <p className="text-sidebar-foreground/40 mt-3 mb-1 px-3 text-[10px] font-semibold tracking-widest uppercase">
                  {item.group}
                </p>
              )}
              <Link
                href={item.href}
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

      {/* Footer — separated by spacing/tone, not a hard border line */}
      <div className="px-3 pt-2 pb-3">
        <div className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2">
          <Avatar className="size-7">
            {currentUser?.image ? (
              <AvatarImage
                src={currentUser.image || "/placeholder.svg"}
                alt={currentUser.name}
              />
            ) : null}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-[11px] font-medium">
              {currentUser ? initials(currentUser.name) : fallbackInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">
              {currentUser?.name ?? fallbackName}
            </p>
            <p className="text-sidebar-foreground/50 truncate text-[11px]">
              {footerSubtitle ?? currentUser?.email}
            </p>
          </div>
        </div>
        <ThemeToggle
          className="mt-0.5 w-full justify-start gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          showLabel={true}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="mt-0.5 w-full justify-start gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
