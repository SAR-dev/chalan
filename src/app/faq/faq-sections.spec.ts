import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { FAQ_ROLES, parseFaqSections, sectionsForRole } from "./faq-sections"

const RAW = readFileSync(
  join(process.cwd(), "src", "content", "faq.md"),
  "utf-8",
)

describe("parseFaqSections", () => {
  it("keeps the H1 and intro as a preamble with no role markers", () => {
    const { preamble } = parseFaqSections(RAW)
    expect(preamble).toContain("# Frequently Asked Questions")
    expect(preamble).not.toContain("role:")
  })

  it("strips every role marker from the rendered markdown", () => {
    const { sections } = parseFaqSections(RAW)
    for (const section of sections) {
      expect(section.markdown).not.toContain("<!-- role:")
      expect(section.markdown.startsWith("## ")).toBe(true)
    }
  })

  it("tags every section with a known role", () => {
    const { sections } = parseFaqSections(RAW)
    expect(sections.length).toBeGreaterThan(8)
    for (const section of sections) {
      expect(FAQ_ROLES).toContain(section.role)
    }
  })

  it("gives every section a unique id", () => {
    const { sections } = parseFaqSections(RAW)
    const ids = sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("covers all four roles plus shared content", () => {
    const { sections } = parseFaqSections(RAW)
    const roles = new Set(sections.map((s) => s.role))
    expect(roles).toEqual(
      new Set(["shared", "merchant", "rider", "warehouse", "super-admin"]),
    )
  })

  it("falls back to shared for an unknown role marker", () => {
    const { sections } = parseFaqSections(
      "<!-- role: bogus -->\n## Mistyped\n\nBody.",
    )
    expect(sections).toHaveLength(1)
    expect(sections[0].role).toBe("shared")
  })

  it("ignores a marker with no content under it", () => {
    const { sections } = parseFaqSections(
      "<!-- role: shared -->\n<!-- role: rider -->\n## Riders\n\nBody.",
    )
    expect(sections).toHaveLength(1)
    expect(sections[0].id).toBe("riders")
  })

  it("slugifies the heading for the id", () => {
    const { sections } = parseFaqSections(
      "<!-- role: merchant -->\n## For merchants: pricing, COD & payouts\n\nBody.",
    )
    expect(sections[0].id).toBe("for-merchants-pricing-cod-payouts")
  })
})

describe("sectionsForRole", () => {
  const sections = parseFaqSections(RAW).sections

  it("returns everything for the all tab", () => {
    expect(sectionsForRole(sections, "all")).toHaveLength(sections.length)
  })

  it("returns shared plus the selected role only", () => {
    const rider = sectionsForRole(sections, "rider")
    expect(rider.length).toBeGreaterThan(0)
    for (const section of rider) {
      expect(["shared", "rider"]).toContain(section.role)
    }
    expect(rider.some((s) => s.role === "rider")).toBe(true)
    expect(rider.some((s) => s.role === "super-admin")).toBe(false)
  })

  it("gives every role at least one of its own sections", () => {
    for (const role of FAQ_ROLES) {
      if (role === "shared") continue
      expect(sections.some((s) => s.role === role)).toBe(true)
    }
  })
})
