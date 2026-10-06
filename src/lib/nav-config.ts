import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bike,
  CalendarClock,
  CircleHelp,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  type LucideIcon,
  Mail,
  MapPin,
  Megaphone,
  Package,
  PackageCheck,
  PackagePlus,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  Truck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Warehouse as WarehouseIcon,
} from "lucide-react"
import { SiteIcon } from "@/icons/SiteIcon"
import type { Role } from "@/lib/types"

export interface SidebarNavItem {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  /** Extra pathnames that also mark this item active (each matched as an
   * exact path or a path prefix), e.g. New Order covering the import page. */
  activePaths?: string[]
  group?: string
  /** Where the item is RENDERED. Omitted = "sidebar" (desktop sidebar + the
   * TopNav's mobile drawer). "rightnav" = the account slide-over opened from
   * the TopNav avatar — used for utility links (Help, and Support for the
   * self-service roles) that aren't part of a role's daily workflow. The
   * announcements feed is deliberately a sidebar destination: it is a board
   * you read, not a utility (and the TopNav bell links to it directly).
   *
   * Deliberately a rendering concern only: the item stays in `items`, which is
   * what the merchant moderator grant model, the shell route guard, and the
   * command palette read — moving an item here must never change who can
   * reach the page. */
  placement?: "sidebar" | "rightnav"
}

/** The role's working nav: everything not relegated to the RightNav panel.
 * Filtering preserves order, so group contiguity (see nav-config.spec.ts)
 * still holds on the result. */
export function sidebarVisibleItems(items: SidebarNavItem[]): SidebarNavItem[] {
  return items.filter((item) => item.placement !== "rightnav")
}

/** Items rendered in the RightNav account panel (identity → resources →
 * account → theme → sign out), in config order. */
export function rightNavItems(items: SidebarNavItem[]): SidebarNavItem[] {
  return items.filter((item) => item.placement === "rightnav")
}

/** Whether a nav item should render as active for the current pathname. */
export function isNavItemActive(
  item: SidebarNavItem,
  pathname: string,
): boolean {
  const matches = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`)
  if (item.activePaths?.some((path) => matches(path))) return true
  return item.exact ? pathname === item.href : matches(item.href)
}

export interface SidebarConfig {
  // The brand mark accepts either a Lucide icon or the inline SVG SiteIcon —
  // both satisfy React.ComponentType<React.SVGProps<SVGSVGElement>>.
  brandIcon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  roleLabel: string
  items: SidebarNavItem[]
}

// Super Admins oversee the whole platform and are the only role that can
// provision Admin / Warehouse Admin accounts (the "Admins" page).
export const SUPER_ADMIN_SIDEBAR: SidebarConfig = {
  brandIcon: SiteIcon,
  roleLabel: "Super Admin",
  // Grouped, work-first: the queues you work come before the directories you
  // consult, money after coverage, logs and settings last. The landing page
  // (`Overview`) stays ungrouped so it reads as the top-level entry point.
  //
  // Groups must stay contiguous — `RoleSidebar` renders a header whenever
  // `item.group` differs from the previous item's, so an interleaved group
  // would repeat its header.
  items: [
    {
      href: "/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      exact: true,
    },
    // The three approval queues, in the order the admin guide works them.
    {
      href: "/dashboard/nid-reviews",
      label: "Merchant Reviews",
      icon: FileText,
      group: "Approvals",
    },
    {
      href: "/dashboard/orders",
      label: "Orders",
      icon: Package,
      group: "Approvals",
    },
    {
      href: "/dashboard/rider-applications",
      label: "Rider Applications",
      icon: UserPlus,
      group: "Approvals",
    },
    // Who sells, who delivers, where from, and who administers the platform.
    {
      href: "/dashboard/merchants",
      label: "Merchants",
      icon: Store,
      group: "Directory",
    },
    {
      href: "/dashboard/riders",
      label: "Riders",
      icon: Bike,
      group: "Directory",
    },
    {
      href: "/dashboard/warehouses",
      label: "Warehouses",
      icon: WarehouseIcon,
      group: "Directory",
    },
    {
      href: "/dashboard/team",
      label: "Admins",
      icon: ShieldCheck,
      group: "Directory",
    },
    {
      href: "/dashboard/users",
      label: "Users",
      icon: Users,
      group: "Directory",
    },
    // The pricing matrix an order prices itself from: zones -> cities -> rates.
    {
      href: "/dashboard/delivery-zones",
      label: "Delivery Zones",
      icon: MapPin,
      group: "Coverage & pricing",
    },
    {
      href: "/dashboard/delivery-cities",
      label: "Delivery Cities",
      icon: MapPin,
      group: "Coverage & pricing",
    },
    {
      href: "/dashboard/zone-pricing",
      label: "Zone Pricing",
      icon: Tag,
      group: "Coverage & pricing",
    },
    {
      href: "/dashboard/zone-delivery-time",
      label: "Zone Delivery Times",
      icon: CalendarClock,
      group: "Coverage & pricing",
    },
    {
      href: "/dashboard/packages",
      label: "Packages",
      icon: Package,
      group: "Coverage & pricing",
    },
    {
      href: "/dashboard/payouts",
      label: "Payouts",
      icon: Wallet,
      group: "Money",
    },
    {
      href: "/dashboard/cod-settlement",
      label: "COD Settlement",
      icon: Receipt,
      group: "Money",
    },
    {
      href: "/dashboard/delivery-performance",
      label: "Delivery Performance",
      icon: BarChart3,
      group: "Reports",
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit Logs",
      icon: ScrollText,
      group: "Reports",
    },
    {
      href: "/dashboard/email-logs",
      label: "Email Logs",
      icon: Mail,
      group: "Reports",
    },
    {
      href: "/dashboard/announcements",
      label: "Announcements",
      icon: Megaphone,
      group: "System",
    },
    {
      // Admin's own feed entry was retired: the manage page above already
      // owns the sidebar slot, and the feed stays reachable through the
      // TopNav bell (announcementsPathForRole) and detail back-links.
      href: "/dashboard/support",
      label: "Support",
      icon: LifeBuoy,
      group: "System",
    },
    {
      href: "/help",
      label: "Help",
      icon: CircleHelp,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/dashboard/settings",
      label: "Settings",
      icon: Settings,
      exact: true,
      group: "System",
    },
    {
      href: "/dashboard/account",
      label: "Account",
      icon: UserCog,
      exact: true,
      group: "System",
    },
  ],
}

// Picks the correct console sidebar. All dashboard roles get the full
// SUPER_ADMIN layout since ADMIN has been removed.
export function dashboardSidebarForRole(
  _role: Role | undefined,
): SidebarConfig {
  return SUPER_ADMIN_SIDEBAR
}

// Where each role lands after login or on the root URL. Lives in a server-safe
// module so both the server-side "/" redirect and client components can use it.
export function homeForRole(role: Role): string {
  if (role === "MERCHANT") return "/merchant"
  if (role === "RIDER") return "/rider"
  if (role === "WAREHOUSE_ADMIN") return "/warehouse"
  return "/dashboard"
}

/**
 * Each role's announcements feed — the destination of the TopNav bell link
 * and the detail page's back link. Mirrors the nav items above; the
 * dashboard route is `announcements-inbox` (the sibling of the admin's
 * `announcements` management page), while the other three roles' feed is
 * simply `/announcements`.
 */
export function announcementsPathForRole(role: Role): string {
  if (role === "MERCHANT") return "/merchant/announcements"
  if (role === "RIDER") return "/rider/announcements"
  if (role === "WAREHOUSE_ADMIN") return "/warehouse/announcements"
  return "/dashboard/announcements-inbox"
}

/**
 * The sidebar/top-nav config for any signed-in user, including the merchant
 * moderator grant filter. The four role shells each build this themselves
 * (they also have per-role subtitles); this exists for shared surfaces
 * outside the role segments — today, /announcements/[id] — where there is no
 * shell to do it.
 */
export function navConfigForUser(
  user: NavPermissionSubject | null | undefined,
): SidebarConfig {
  switch (user?.role) {
    case "MERCHANT":
      return { ...MERCHANT_SIDEBAR, items: merchantVisibleNavItems(user) }
    case "WAREHOUSE_ADMIN":
      return WAREHOUSE_SIDEBAR
    case "RIDER":
      return RIDER_SIDEBAR
    default:
      // Dashboard (and any future/unknown role): the dashboard config. Its
      // role argument is unused today (every console role shares one layout),
      // and the subject's free-text role isn't the schema's Role union, so
      // nothing is passed rather than casting a string into the union.
      return dashboardSidebarForRole(undefined)
  }
}

export const MERCHANT_SIDEBAR: SidebarConfig = {
  brandIcon: SiteIcon,
  roleLabel: "Merchant",
  // Work-first: the order-taking actions, then money, then setup/reference,
  // then the system surfaces. Landing page ungrouped, same as the other roles.
  items: [
    {
      href: "/merchant",
      label: "Dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/merchant/orders/new",
      label: "New Order",
      icon: PackagePlus,
      activePaths: ["/merchant/orders/import"],
      group: "Orders",
    },
    {
      href: "/merchant/orders",
      label: "Orders",
      icon: Package,
      exact: true,
      group: "Orders",
    },
    {
      href: "/merchant/finance",
      label: "Finance",
      icon: Wallet,
      group: "Money",
    },
    {
      href: "/merchant/pricing",
      label: "Pricing",
      icon: Tag,
      exact: true,
      group: "Money",
    },
    {
      href: "/merchant/settings",
      label: "Business Settings",
      icon: UserCog,
      exact: true,
      group: "Business",
    },
    {
      href: "/merchant/verify-nid",
      label: "Verification",
      icon: ShieldCheck,
      exact: true,
      group: "Business",
    },
    {
      href: "/merchant/delivery-cities",
      label: "Delivery Cities",
      icon: MapPin,
      exact: true,
      group: "Business",
    },
    {
      href: "/merchant/announcements",
      label: "Announcements",
      icon: Megaphone,
      exact: true,
      group: "System",
    },
    {
      href: "/merchant/support",
      label: "Support",
      icon: LifeBuoy,
      exact: true,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/help",
      label: "Help",
      icon: CircleHelp,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/merchant/account",
      label: "Account",
      icon: UserCog,
      exact: true,
      group: "System",
    },
  ],
}

// ─── Merchant moderator nav grants ────────────────────────────
//
// Moderator access is modeled as grants over the MERCHANT_SIDEBAR hrefs.
// The owner's own access is unrestricted; every other MERCHANT profile with
// `isModerator` only reaches the hrefs listed in `moderatorPermissions`.

/** Href a moderator can always reach (landing + self-service + public docs). */
export const MERCHANT_MODERATOR_ALWAYS_HREFS: readonly string[] = [
  "/merchant",
  "/merchant/account",
  "/help",
]

/** Hrefs that are never grantable to moderators (owner-only surfaces —
 *  the moderator-management UI lives under Business Settings, and Delivery
 *  Cities is reference info a moderator has no order-taking need for). */
export const MERCHANT_OWNER_ONLY_HREFS: readonly string[] = [
  "/merchant/settings",
  "/merchant/delivery-cities",
]

/** The nav subjects our permission helpers reason about (the `me` shape from
 *  requireSession / the `User` shape from /api/users/me both satisfy this). */
export interface NavPermissionSubject {
  role?: string | null
  isModerator?: boolean | null
  moderatorPermissions?: string[] | null
}

/** Sidebar items offered as grant checkboxes: everything except the
 *  always-on and owner-only entries. */
export function merchantGrantableNavItems(): SidebarNavItem[] {
  return MERCHANT_SIDEBAR.items.filter(
    (item) =>
      !MERCHANT_MODERATOR_ALWAYS_HREFS.includes(item.href) &&
      !MERCHANT_OWNER_ONLY_HREFS.includes(item.href),
  )
}

/** Sidebar items for a merchant user: the owner sees the full nav; a
 *  moderator sees always-on items plus the granted ones. */
export function merchantVisibleNavItems(
  user: NavPermissionSubject | null | undefined,
): SidebarNavItem[] {
  if (!user || user.role !== "MERCHANT" || !user.isModerator) {
    return MERCHANT_SIDEBAR.items
  }
  const granted = new Set(user.moderatorPermissions ?? [])
  return MERCHANT_SIDEBAR.items.filter(
    (item) =>
      MERCHANT_MODERATOR_ALWAYS_HREFS.includes(item.href) ||
      (!MERCHANT_OWNER_ONLY_HREFS.includes(item.href) &&
        granted.has(item.href)),
  )
}

/** Server-side nav gate for sensitive endpoints. Owners and non-merchant
 *  roles always pass; moderators need the href granted — owner-only hrefs
 *  never pass for a moderator, even if a stale grant claims them. */
export function hasNavPermission(
  user: NavPermissionSubject | null | undefined,
  href: string,
): boolean {
  if (!user) return false // fail closed for a missing subject
  if (user.role !== "MERCHANT") return true
  if (!user.isModerator) return true
  if (MERCHANT_OWNER_ONLY_HREFS.includes(href)) return false
  return (user.moderatorPermissions ?? []).includes(href)
}

export const WAREHOUSE_SIDEBAR: SidebarConfig = {
  brandIcon: SiteIcon,
  roleLabel: "Warehouse",
  // Work-first: the overview is the landing page, then the hub floor in the
  // order a parcel moves through it (approve → work it → review it closed),
  // then money, then system. Landing page ungrouped, like the admin Overview.
  items: [
    {
      href: "/warehouse",
      label: "Overview",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/warehouse/orders",
      label: "Order approval",
      icon: ShieldCheck,
      exact: true,
      group: "Floor",
    },
    {
      href: "/warehouse/ongoing",
      label: "Ongoing",
      icon: Truck,
      exact: true,
      group: "Floor",
    },
    {
      href: "/warehouse/completed",
      label: "Completed",
      icon: PackageCheck,
      exact: true,
      group: "Floor",
    },
    {
      href: "/warehouse/riders",
      label: "Riders",
      icon: Bike,
      exact: true,
      group: "Floor",
    },
    {
      href: "/warehouse/exceptions",
      label: "Exceptions",
      icon: AlertTriangle,
      exact: true,
      group: "Floor",
    },
    {
      href: "/warehouse/cod-settlement",
      label: "COD Settlement",
      icon: Receipt,
      exact: true,
      group: "Money",
    },
    {
      href: "/warehouse/rider-cash",
      label: "Rider Cash",
      icon: Banknote,
      exact: true,
      group: "Money",
    },
    {
      href: "/warehouse/announcements",
      label: "Announcements",
      icon: Megaphone,
      exact: true,
      group: "System",
    },
    {
      href: "/warehouse/support",
      label: "Support",
      icon: LifeBuoy,
      exact: true,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/help",
      label: "Help",
      icon: CircleHelp,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/warehouse/account",
      label: "Account",
      icon: UserCog,
      exact: true,
      group: "System",
    },
  ],
}

export const RIDER_SIDEBAR: SidebarConfig = {
  brandIcon: SiteIcon,
  roleLabel: "Rider",
  // Work-first: the queue is the landing page, then the two queues, then money,
  // then system. `Earnings` was documented in the rider guide but had no sidebar
  // entry — it was reachable only by typing the URL.
  items: [
    { href: "/rider", label: "To-do", icon: ListChecks, exact: true },
    {
      href: "/rider/pickup",
      label: "Pickups",
      icon: PackageCheck,
      exact: true,
      group: "Queues",
    },
    {
      href: "/rider/delivery",
      label: "Deliveries",
      icon: Truck,
      exact: true,
      group: "Queues",
    },
    {
      href: "/rider/earnings",
      label: "Earnings",
      icon: Wallet,
      exact: true,
      group: "Money",
    },
    {
      href: "/rider/announcements",
      label: "Announcements",
      icon: Megaphone,
      exact: true,
      group: "System",
    },
    {
      href: "/rider/support",
      label: "Support",
      icon: LifeBuoy,
      exact: true,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/help",
      label: "Help",
      icon: CircleHelp,
      group: "System",
      placement: "rightnav",
    },
    {
      href: "/rider/account",
      label: "Account",
      icon: UserCog,
      exact: true,
      group: "System",
    },
  ],
}
