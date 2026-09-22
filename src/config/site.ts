import siteData from "@/config/site.json"
import { SiteIcon } from "@/icons/SiteIcon"

// Single source of truth for the site's identity (name, tagline, brand icon).
// The icon is an inline SVG React component sourced from /public/icon.svg so
// it renders identically on every page — login, register, nav, and all app
// sidebars — without relying on a Lucide component.
//
// siteUrl resolution order:
//   1. NEXT_PUBLIC_SITE_URL  (explicit canonical — preferred)
//   2. site.json siteUrl     (last-resort static fallback)

export interface SiteConfig {
  /** Product / brand name, shown in nav, login, and metadata. */
  name: string
  /** Short positioning line, e.g. shown on the login brand panel. */
  tagline: string
  /** Used as the default <meta name="description"> for the app. */
  description: string
  /** Canonical origin, used for metadataBase and OG URLs. */
  siteUrl: string
  /** Default author for article:author and meta author tags. */
  author: string
  /** Default Open Graph image path (relative to siteUrl). */
  ogImage: string
  /** The brand mark as an inline-SVG React component. */
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

function resolveSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? siteData.siteUrl
}

export const siteConfig: SiteConfig = {
  name: siteData.name,
  tagline: siteData.tagline,
  description: siteData.description,
  siteUrl: resolveSiteUrl(),
  author: siteData.author,
  ogImage: siteData.ogImage,
  icon: SiteIcon,
}

// Convenience alias so callers can render <SiteIcon /> directly.
export { SiteIcon }

// Template keywords for content markdown replacement.
export interface AppContent {
  APP_NAME: string
  APP_URL: string
  APP_EMAIL: string
}

export const appContent: AppContent = {
  APP_NAME: siteConfig.name,
  APP_URL: siteConfig.siteUrl,
  APP_EMAIL: `support@${new URL(siteConfig.siteUrl).hostname}`,
}
