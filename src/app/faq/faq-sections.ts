// =============================================================================
// Role-tagged FAQ sections.
//
// `src/content/faq.md` is one file, but each `## ` section is preceded by a
// `<!-- role: … -->` marker. The marker is stripped here, so the markdown that
// reaches the renderer never contains it, and the /faq tabs can show one role's
// answers (plus the `shared` ones) without splitting the source into files.
// =============================================================================

export const FAQ_ROLES = [
  "shared",
  "merchant",
  "rider",
  "warehouse",
  "super-admin",
] as const

export type FaqRole = (typeof FAQ_ROLES)[number]

export interface FaqSection {
  /** Slug of the section's `## ` heading — stable React key and test id. */
  id: string
  role: FaqRole
  /** Section markdown, marker removed, ready for `<Markdown>`. */
  markdown: string
}

const ROLE_MARKER = /^<!--\s*role:\s*([a-z-]+)\s*-->$/

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Splits the FAQ file into its preamble and its role-tagged sections.
 *
 * A section begins at a `<!-- role: … -->` marker and runs to the next marker.
 * Text before the first marker is the preamble (the H1 and intro), which always
 * renders above the tabs. An unknown role name falls back to `shared`, so a typo
 * shows content to everyone rather than hiding it.
 */
export function parseFaqSections(raw: string): {
  preamble: string
  sections: FaqSection[]
} {
  const preamble: string[] = []
  const sections: FaqSection[] = []
  let role: FaqRole | null = null
  let buffer: string[] = []

  function flush() {
    const markdown = buffer.join("\n").trim()
    if (role && markdown) {
      const heading = /^##\s+(.+)$/m.exec(markdown)?.[1] ?? markdown
      sections.push({ id: slugify(heading), role, markdown })
    }
    buffer = []
  }

  for (const line of raw.split("\n")) {
    const marker = ROLE_MARKER.exec(line.trim())
    if (marker) {
      flush()
      const found = marker[1]
      role = (FAQ_ROLES as readonly string[]).includes(found)
        ? (found as FaqRole)
        : "shared"
      continue
    }
    if (role) buffer.push(line)
    else preamble.push(line)
  }
  flush()

  return { preamble: preamble.join("\n").trim(), sections }
}

/**
 * The sections a tab shows: everything for `all`, otherwise the `shared`
 * sections plus the selected role's own.
 */
export function sectionsForRole(
  sections: FaqSection[],
  role: FaqRole | "all",
): FaqSection[] {
  if (role === "all") return sections
  return sections.filter((s) => s.role === "shared" || s.role === role)
}
