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
import { SignOutConfirmDialog } from "@/features/account/dialogs/sign-out-confirm-dialog"
import { useAuth } from "@/features/account/hooks/use-auth"
import { BRAND_NAME } from "@/lib/constants"
import { isNavItemActive, type SidebarConfig } from "@/lib/nav-config"
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
  businessName,
}: {
  config: SidebarConfig
  businessName?: string
}) {
  const pathname = usePathname()
  const { currentUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const BrandIcon = config.brandIcon
  const navItems = config.items

  return (
    <header className="border-border flex h-14 items-center justify-between border-b px-3 sm:px-4 md:hidden">
      <Link href="/" className="flex min-w-0 items-center gap-2">
        {businessName ? (
          <span className="truncate text-sm font-semibold sm:text-base">
            {businessName}
          </span>
        ) : (
          <>
            <div className="flex size-8 items-center justify-center rounded-lg">
              <BrandIcon className="size-5" />
            </div>
            <span className="text-sm font-semibold sm:text-base">
              {BRAND_NAME}
            </span>
          </>
        )}
      </Link>

      <Sheet open={open} onOpenChange={setOpen}>
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
          {/* Brand */}
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

          {/* Nav — closes the drawer on navigation */}
          <nav
            aria-label="Main"
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
          >
            {navItems.map((item, i) => {
              const active = isNavItemActive(item, pathname)
              const Icon = item.icon
              // Mirrors RoleSidebar: a header appears when the group changes,
              // so the mobile drawer reads the same as the desktop sidebar
              // rather than flattening every section into one long list.
              const prevGroup = i > 0 ? navItems[i - 1]?.group : undefined
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
                    onClick={() => setOpen(false)}
                    // Same signal as the desktop sidebar — the drawer is the
                    // Only nav visible on a phone.
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
                // Close the menu first so the confirmation appears over the
                // page rather than over a sheet that is animating away.
                setOpen(false)
                setSignOutOpen(true)
              }}
              data-testid="mobile-logout"
              className={footerActionClass}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {/* Deliberately outside <Sheet>: closing the sheet unmounts anything
          inside it, and the confirmation has to outlive the menu it was
          opened from — otherwise the dialog would vanish the instant the
          mobile nav finished closing. Radix portals it to <body> anyway, so
          its position here is about React ownership, not layout. */}
      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </header>
  )
}
