"use client"

import { LogOut, Menu } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/features/account/hooks/use-auth"
import { BRAND_NAME } from "@/lib/constants"
import type { SidebarConfig } from "@/lib/nav-config"
import { cn, initials } from "@/lib/utils"

const navLinkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150"
const navLinkActive = "bg-sidebar-accent text-sidebar-accent-foreground"
const navLinkIdle =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
const footerActionClass =
  "mt-0.5 w-full justify-start gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"

export function MobileHeader({
  config,
  logoUrl,
  brandColor,
  hidePlatformBranding = false,
}: {
  config: SidebarConfig
  logoUrl?: string
  brandColor?: string
  hidePlatformBranding?: boolean
}) {
  const pathname = usePathname()
  const { currentUser, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const BrandIcon = config.brandIcon
  const navItems = config.items

  const headerStyle = brandColor
    ? ({ "--sidebar-primary": brandColor } as React.CSSProperties)
    : undefined

  return (
    <header
      className="border-border flex h-14 items-center justify-between border-b px-3 sm:px-4 md:hidden"
      style={headerStyle}
    >
      <Link href="/" className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-5 object-contain" />
          ) : (
            <BrandIcon className="size-5" />
          )}
        </div>
        {!hidePlatformBranding && (
          <span className="text-sm font-semibold sm:text-base">
            {BRAND_NAME}
          </span>
        )}
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="outline" size="icon-sm" aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
          }
        />
        <SheetContent side="left" className="p-0" style={headerStyle}>
          {/* Brand */}
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
              <SheetTitle className="text-[13px] font-semibold">
                {BRAND_NAME}
              </SheetTitle>
            )}
            <span className="bg-sidebar-primary text-sidebar-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
              {config.roleLabel}
            </span>
          </Link>
          <SheetDescription className="sr-only">
            Main navigation
          </SheetDescription>

          {/* Nav — closes the drawer on navigation */}
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
            {navItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    navLinkClass,
                    active ? navLinkActive : navLinkIdle,
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <SheetFooter>
            <div className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2">
              <Avatar className="size-7">
                {currentUser?.image ? (
                  <AvatarImage
                    src={currentUser.image || "/placeholder.svg"}
                    alt={currentUser.name}
                  />
                ) : null}
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-[11px] font-medium">
                  {currentUser ? initials(currentUser.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium">
                  {currentUser?.name}
                </p>
                <p className="text-sidebar-foreground/50 truncate text-[11px]">
                  {currentUser?.email}
                </p>
              </div>
            </div>
            <ThemeToggle className={footerActionClass} showLabel={true} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
                logout()
              }}
              className={footerActionClass}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </header>
  )
}
