"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BRAND_NAME } from "@/lib/constants"
import type { SidebarConfig } from "@/lib/nav-config"
import { isNavItemActive, sidebarVisibleItems } from "@/lib/nav-config"
import { cn } from "@/lib/utils"

// Claude-style nav link: quiet by default, soft neutral fill on hover,
// and a gentle tonal fill (not a saturated brand color) when active.
const navLinkClass =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150"
const navLinkActive = "bg-sidebar-accent text-sidebar-accent-foreground"
const navLinkIdle =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"

/**
 * The desktop sidebar: brand + nav, and nothing else.
 *
 * Identity, theme, and sign out moved to TopNav's avatar → RightNav panel
 * (see navigation/top-nav.tsx), so this column no longer renders a footer —
 * it exists to answer "where am I in the app", and every breakpoint now gets
 * the account actions from the same single place.
 */
export function RoleSidebar({
  config,
  businessName,
}: {
  config: SidebarConfig
  businessName?: string
}) {
  const pathname = usePathname()
  const BrandIcon = config.brandIcon

  return (
    <aside
      data-testid="sidebar"
      className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden md:flex"
    >
      {/* Brand — the merchant's business name (no logo), or the platform brand */}
      <Link
        href="/"
        data-testid="sidebar-brand"
        className="flex h-16 items-center gap-2 px-4"
      >
        {businessName ? (
          <span className="truncate text-[13px] font-semibold">
            {businessName}
          </span>
        ) : (
          <>
            <BrandIcon className="size-4 shrink-0" />
            <p className="text-[13px] font-semibold">{BRAND_NAME}</p>
          </>
        )}
        <span className="bg-sidebar-primary text-sidebar-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
          {config.roleLabel}
        </span>
      </Link>

      {/* Nav — no rules, no boxes, just rhythm and spacing. Utility items
          (Help/Inbox, and Support for the self-service roles) live in the
          RightNav panel instead; filter BEFORE the group-header logic so
          headers are derived from what is actually rendered. */}
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
      >
        {sidebarVisibleItems(config.items).map((item, i, visible) => {
          const active = isNavItemActive(item, pathname)
          const Icon = item.icon
          const prevGroup = i > 0 ? visible[i - 1].group : undefined
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
                data-testid={`nav-${item.href}`}
                // The active item is signalled by a tonal fill alone; a
                // screen reader gets no sense of place without this
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
    </aside>
  )
}
