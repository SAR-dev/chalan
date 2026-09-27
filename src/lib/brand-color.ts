/**
 * Pure brand-color helpers used by the merchant branding feature.
 *
 * Everything here is intentionally dependency-free and side-effect-free so it
 * can be unit tested and reused from client components (settings preview,
 * portal theme injection) and server components (tracking page) alike.
 */

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Approximate page surfaces the brand color may be rendered as *text* on. */
const LIGHT_SURFACE = "#ffffff"
const DARK_SURFACE = "#1f2937"

export type LowContrastSide = "light" | "dark"
export type BrandForeground = "#000000" | "#ffffff"

/** Validate a 3- or 6-digit hex color (leading `#` required, trimmed). */
export function isValidHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim())
}

function parseHex(hex: string): [number, number, number] | null {
  const body = hex.trim().slice(1)
  if (!HEX_PATTERN.test(hex.trim())) return null
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body
  const int = Number.parseInt(full, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance (0–1). Returns NaN for invalid input. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return Number.NaN
  const [r, g, b] = [channel(rgb[0]), channel(rgb[1]), channel(rgb[2])]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1–21). Returns NaN when either input is invalid. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (Number.isNaN(la) || Number.isNaN(lb)) return Number.NaN
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Black or white — whichever carries the higher contrast ratio on the given
 * color. Invalid input falls back to white (the theme's default pairing).
 */
export function bestForeground(hex: string): BrandForeground {
  if (!isValidHexColor(hex)) return "#ffffff"
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#000000")
    ? "#ffffff"
    : "#000000"
}

/**
 * Sides where this color fails WCAG AA (4.5:1) when used as *text* on the
 * light or dark page surface. Used for the settings-page warning (never
 * blocks saving — the color is always safe as a background thanks to
 * {@link bestForeground}).
 */
export function lowContrastSides(hex: string): LowContrastSide[] {
  if (!isValidHexColor(hex)) return []
  const sides: LowContrastSide[] = []
  if (contrastRatio(hex, LIGHT_SURFACE) < 4.5) sides.push("light")
  if (contrastRatio(hex, DARK_SURFACE) < 4.5) sides.push("dark")
  return sides
}

/**
 * CSS custom properties that re-theme a surface from a brand color, or
 * `undefined` when the color is invalid (caller falls back to the CSS theme
 * defaults). The foreground is contrast-picked, so `bg-primary` +
 * `text-primary-foreground` always meets ≥ 4.58:1 (the best achievable floor
 * for any black/white pairing).
 */
export function brandThemeVars(
  color: string,
): Record<string, string> | undefined {
  if (!isValidHexColor(color)) return undefined
  const hex = color.trim().toLowerCase()
  const fg = bestForeground(hex)
  return {
    "--primary": hex,
    "--primary-foreground": fg,
    "--ring": hex,
    "--sidebar-primary": hex,
    "--sidebar-primary-foreground": fg,
    "--sidebar-ring": hex,
  }
}
