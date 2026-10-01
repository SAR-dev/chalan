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
//
// Every value a buyer of this product must change before launch lives in the
// `legal` block of `site.json` and is surfaced here as a `{{TOKEN}}`. The legal
// markdown (`src/content/terms.md`, `privacy.md`) references the tokens rather
// than the values, so rebranding or relocating the entity is a one-file edit
// and no placeholder can be left behind in the source.
//
// Keep the token set and `AppContent` in step — `content-keywords.spec.ts`
// fails if any `{{...}}` in the content files has no backing key.
export interface AppContent {
  APP_NAME: string
  APP_URL: string
  APP_EMAIL: string
  /** Full legal name of the contracting entity. */
  ENTITY_NAME: string
  /** Registered postal address of that entity. */
  REGISTERED_ADDRESS: string
  /** Mailbox for privacy and legal correspondence. */
  CONTACT_EMAIL: string
  /** Conflict-of-laws rule, e.g. "the laws of Bangladesh". */
  GOVERNING_LAW: string
  /** Courts with jurisdiction, e.g. "the courts of Dhaka, Bangladesh". */
  JURISDICTION: string
  /** Financial-services regulator named in the settlement clauses. */
  REGULATOR: string
  /** Data protection regulator named in the privacy policy. */
  PRIVACY_AUTHORITY: string
  /** Settlement/wallet partners named in the COD clauses. */
  PAYMENT_PARTNERS: string
  /** Identity documents required at registration. */
  ID_DOCUMENTS: string
  /** Customs statute referenced for prohibited goods. */
  CUSTOMS_LAW: string
  /** Currency code used in every stated figure. */
  CURRENCY: string
  /** Single-parcel COD ceiling stated in the terms. */
  MAX_COD_VALUE: string
  /** Per-consignment liability cap stated in the terms. */
  LIABILITY_CAP: string
  /** Reverse-logistics fee for a return inside the pickup city. */
  RTM_FEE_INTRA_CITY: string
  /** Reverse-logistics fee for a return to another region. */
  RTM_FEE_INTER_CITY: string
  /**
   * Version stamped on the Terms and Privacy documents — and recorded against
   * each account when it is created, so an acceptance can be tied to the exact
   * wording the user agreed to rather than to whatever is published later.
   */
  LEGAL_VERSION: string
}

const legal = siteData.legal

export const appContent: AppContent = {
  APP_NAME: siteConfig.name,
  APP_URL: siteConfig.siteUrl,
  APP_EMAIL: `support@${new URL(siteConfig.siteUrl).hostname}`,
  ENTITY_NAME: legal.entityName,
  REGISTERED_ADDRESS: legal.registeredAddress,
  CONTACT_EMAIL: legal.contactEmail,
  GOVERNING_LAW: legal.governingLaw,
  JURISDICTION: legal.jurisdiction,
  REGULATOR: legal.regulator,
  PRIVACY_AUTHORITY: legal.privacyAuthority,
  PAYMENT_PARTNERS: legal.paymentPartners,
  ID_DOCUMENTS: legal.idDocuments,
  CUSTOMS_LAW: legal.customsLaw,
  CURRENCY: legal.currency,
  MAX_COD_VALUE: legal.maxCodValue,
  LIABILITY_CAP: legal.liabilityCap,
  RTM_FEE_INTRA_CITY: legal.rtmFeeIntraCity,
  RTM_FEE_INTER_CITY: legal.rtmFeeInterCity,
  LEGAL_VERSION: legal.legalVersion,
}
