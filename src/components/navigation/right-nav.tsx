"use client"

import { LogOut, Settings } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SignOutConfirmDialog } from "@/features/account/dialogs/sign-out-confirm-dialog"
import { useAuth } from "@/features/account/hooks/use-auth"
import type { SidebarConfig } from "@/lib/nav-config"
import { rightNavItems } from "@/lib/nav-config"
import { initials } from "@/lib/utils"

/**
 * The account panel opened from the TopNav avatar — the home of everything
 * that used to sit in the sidebar footer (identity, theme, sign out), so the
 * desktop sidebar and the mobile drawer can stay pure navigation.
 *
 * One instance in TopNav serves every breakpoint: the same right-side Sheet
 * on a phone and on a desktop, rather than a dropdown here and a drawer
 * there. `subtitle` carries the context the sidebar footer used to show
 * (warehouse name, rider zone, or business name).
 *
 * It also hosts the utility nav items flagged `placement: "rightnav"` in
 * nav-config (Help, Inbox, and Support for the self-service roles) in a
 * "Help & resources" section above Account — fed by the same config the
 * sidebar gets, so a merchant moderator only sees links they were granted.
 */
export function RightNav({
  open,
  onOpenChange,
  config,
  subtitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: SidebarConfig
  subtitle?: string | null
}) {
  const { currentUser } = useAuth()
  const [signOutOpen, setSignOutOpen] = useState(false)

  // The account entry of the current role's nav (e.g. /dashboard/account) —
  // derived rather than hardcoded so each role lands on its own page.
  const accountItem = config.items.find((item) =>
    item.href.endsWith("/account"),
  )
  // Utility links the sidebar skipped (placement: "rightnav").
  const resources = rightNavItems(config.items)

  const roleLabel = config.roleLabel
  const displayName = currentUser?.name ?? ""
  const secondary = subtitle ?? currentUser?.email ?? null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-80 gap-0 p-0"
          data-testid="rightnav"
        >
          <SheetHeader className="border-border border-b px-4 py-4">
            <SheetTitle className="text-sm font-semibold">Account</SheetTitle>
            <SheetDescription className="text-muted-foreground text-xs">
              Profile, appearance, and session
            </SheetDescription>
          </SheetHeader>

          {/* Identity — the block the sidebar footer used to render */}
          <div className="flex items-center gap-3 px-4 py-4">
            <Avatar className="size-10">
              {currentUser?.image ? (
                <AvatarImage src={currentUser.image} alt={currentUser.name} />
              ) : null}
              <AvatarFallback className="bg-accent text-accent-foreground text-sm font-medium">
                {currentUser ? initials(currentUser.name) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p
                data-testid="rightnav-name"
                className="truncate text-sm font-medium"
              >
                {displayName}
              </p>
              {secondary && (
                <p className="text-muted-foreground truncate text-xs">
                  {secondary}
                </p>
              )}
              <span className="bg-sidebar-primary text-sidebar-primary-foreground mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium">
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Help & resources — the utility items the sidebar skipped.
              Clicking closes the panel: navigation happens on the page
              behind it, not "inside" it. */}
          {resources.length > 0 && (
            <nav
              className="border-border flex flex-col gap-1 border-t px-2 pt-3 pb-2"
              aria-label="Help and resources"
            >
              <p className="text-muted-foreground/70 px-3 pb-1 text-[10px] font-semibold tracking-widest uppercase">
                Help &amp; resources
              </p>
              {resources.map((item) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.href}
                    variant="ghost"
                    render={<Link href={item.href} />}
                    nativeButton={false}
                    data-testid={`rightnav-${item.href}`}
                    className="justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium"
                    onClick={() => onOpenChange(false)}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Button>
                )
              })}
            </nav>
          )}

          <nav className="flex flex-col gap-1 px-2" aria-label="Account">
            {accountItem && (
              <Button
                variant="ghost"
                render={<Link href={accountItem.href} />}
                nativeButton={false}
                data-testid="rightnav-account"
                className="justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium"
                onClick={() => onOpenChange(false)}
              >
                <Settings className="size-4" />
                {accountItem.label}
              </Button>
            )}

            {/* Theme lives here too: the TopNav toggle is hidden below md to
                keep the mobile bar uncrowded, so this is the phone's only
                route to it. */}
            <ThemeToggle
              showLabel
              className="w-full justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            />
          </nav>

          <div className="mt-auto border-border border-t p-2">
            <Button
              variant="ghost"
              data-testid="logout"
              onClick={() => {
                // Close the panel first: the confirmation must appear over
                // the page, not over a sheet that is animating away.
                onOpenChange(false)
                setSignOutOpen(true)
              }}
              className="w-full justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Outside <Sheet>: closing the sheet unmounts its children, and the
          confirmation has to outlive the panel it was opened from. */}
      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  )
}
