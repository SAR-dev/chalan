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
