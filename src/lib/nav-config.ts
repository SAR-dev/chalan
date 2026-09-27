import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bike,
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
  items: [
    {
      href: "/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/dashboard/orders",
      label: "Orders",
      icon: Package,
      group: "Management",
    },
    {
      href: "/dashboard/merchants",
      label: "Merchants",
      icon: Store,
      group: "Management",
    },
    {
      href: "/dashboard/nid-reviews",
      label: "Merchant Reviews",
      icon: FileText,
      group: "Management",
    },
    {
      href: "/dashboard/riders",
      label: "Riders",
      icon: Bike,
      group: "Management",
    },
    {
      href: "/dashboard/rider-applications",
      label: "Rider Applications",
      icon: UserPlus,
      group: "Management",
    },
    {
      href: "/dashboard/warehouses",
      label: "Warehouses",
      icon: WarehouseIcon,
      group: "Operations",
    },
    {
      href: "/dashboard/payouts",
      label: "Payouts",
      icon: Wallet,
      group: "Operations",
    },
    {
      href: "/dashboard/delivery-cities",
      label: "Delivery Cities",
      icon: MapPin,
      group: "Operations",
    },
    {
      href: "/dashboard/delivery-zones",
      label: "Delivery Zones",
      icon: MapPin,
      group: "Operations",
    },
    {
      href: "/dashboard/zone-pricing",
      label: "Zone Pricing",
      icon: Wallet,
      group: "Operations",
    },
    {
      href: "/dashboard/delivery-performance",
      label: "Delivery Performance",
      icon: BarChart3,
      group: "Analytics",
    },
    {
      href: "/dashboard/cod-settlement",
      label: "COD Settlement",
      icon: Receipt,
      group: "Analytics",
    },
    {
      href: "/dashboard/announcements",
      label: "Announcements",
      icon: Megaphone,
      group: "System",
    },
    {
      href: "/dashboard/announcements-inbox",
      label: "Inbox",
      icon: Bell,
      group: "System",
    },
    {
      href: "/dashboard/audit-logs",
      label: "Audit Logs",
      icon: ScrollText,
      group: "System",
    },
    {
      href: "/dashboard/email-logs",
      label: "Email Logs",
      icon: Mail,
      group: "System",
    },
    {
      href: "/dashboard/support",
      label: "Support",
      icon: LifeBuoy,
      group: "System",
    },
    { href: "/help", label: "Help", icon: CircleHelp, group: "System" },
    { href: "/dashboard/users", label: "Users", icon: Users, group: "System" },
    { href: "/dashboard/team", label: "Admins", icon: Users, group: "System" },
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

export const MERCHANT_SIDEBAR: SidebarConfig = {
  brandIcon: SiteIcon,
  roleLabel: "Merchant",
  items: [
    {
      href: "/merchant",
      label: "Dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/merchant/orders",
      label: "Orders",
      icon: Package,
      exact: true,
    },
    {
      href: "/merchant/orders/new",
      label: "New Order",
      icon: PackagePlus,
      activePaths: ["/merchant/orders/import"],
    },
    { href: "/merchant/finance", label: "Finance", icon: Wallet },
    { href: "/merchant/pricing", label: "Pricing", icon: Tag, exact: true },
    {
      href: "/merchant/settings",
      label: "Business Settings",
      icon: UserCog,
      exact: true,
    },
    {
      href: "/merchant/verify-nid",
      label: "Verification",
      icon: ShieldCheck,
      exact: true,
    },
    {
      href: "/merchant/account",
      label: "Account",
      icon: UserCog,
      exact: true,
    },
    {
      href: "/merchant/announcements",
      label: "Inbox",
      icon: Megaphone,
      exact: true,
    },
    {
      href: "/merchant/support",
      label: "Support",
      icon: LifeBuoy,
      exact: true,
    },
    { href: "/help", label: "Help", icon: CircleHelp },
  ],
}

// ─── Merchant moderator nav grants (ROADMAP 5.2) ────────────────────────────
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
 *  the moderator-management UI lives under Business Settings). */
export const MERCHANT_OWNER_ONLY_HREFS: readonly string[] = [
  "/merchant/settings",
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
  items: [
    {
      href: "/warehouse",
      label: "Intake queue",
      icon: PackagePlus,
      exact: true,
    },
    {
      href: "/warehouse/dispatch",
      label: "Dispatch desk",
      icon: Truck,
      exact: true,
    },
    {
      href: "/warehouse/orders",
      label: "Order progress",
      icon: Package,
      exact: true,
    },
    {
      href: "/warehouse/riders",
      label: "Riders",
      icon: Bike,
      exact: true,
    },
    {
      href: "/warehouse/exceptions",
      label: "Exceptions",
      icon: AlertTriangle,
      exact: true,
    },
    {
      href: "/warehouse/cod-settlement",
      label: "COD Settlement",
      icon: Wallet,
      exact: true,
    },
    {
      href: "/warehouse/announcements",
      label: "Inbox",
      icon: Megaphone,
      exact: true,
    },
    {
      href: "/warehouse/support",
      label: "Support",
      icon: LifeBuoy,
      exact: true,
    },
    { href: "/help", label: "Help", icon: CircleHelp },
    {
      href: "/warehouse/account",
      label: "Account",
      icon: UserCog,
      exact: true,
    },
  ],
}

export const RIDER_SIDEBAR: SidebarConfig = {
  brandIcon: SiteIcon,
  roleLabel: "Rider",
  items: [
    { href: "/rider", label: "To-do", icon: ListChecks, exact: true },
    {
      href: "/rider/pickup",
      label: "Pickups",
      icon: PackageCheck,
      exact: true,
    },
    {
      href: "/rider/delivery",
      label: "Deliveries",
      icon: Truck,
      exact: true,
    },
    {
      href: "/rider/announcements",
      label: "Inbox",
      icon: Megaphone,
      exact: true,
    },
    {
      href: "/rider/support",
      label: "Support",
      icon: LifeBuoy,
      exact: true,
    },
    { href: "/help", label: "Help", icon: CircleHelp },
    {
      href: "/rider/account",
      label: "Account",
      icon: UserCog,
      exact: true,
    },
  ],
}
