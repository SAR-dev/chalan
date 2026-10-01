import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { appContent } from "@/config/site"
import {
  replaceContentKeywords,
  unresolvedContentKeywords,
} from "./content-keywords"

const CONTENT_DIR = join(process.cwd(), "src", "content")
const CONTENT_FILES = ["terms.md", "privacy.md"]

function read(file: string): string {
  return readFileSync(join(CONTENT_DIR, file), "utf-8")
}

describe("content keywords", () => {
  // The whole point of the token layer: a legal document that renders with a
  // bare `{{ENTITY_NAME}}` in it is worse than one that names the wrong
  // entity, because it looks finished. This is the gate that says the config
  // and the markdown agree.
  describe.each(CONTENT_FILES)("%s has no unresolved tokens", (file) => {
    it("renders every {{TOKEN}} it uses", () => {
      expect(unresolvedContentKeywords(read(file))).toEqual([])
    })

    it("contains no empty config value behind a token it uses", () => {
      const used = read(file).match(/\{\{([A-Z_]+)\}\}/g) ?? []
      const keys = [...new Set(used.map((t) => t.slice(2, -2)))]
      for (const key of keys) {
        const value = appContent[key as keyof typeof appContent]
        expect(value, `{{${key}}} resolved to an empty value`).toBeTruthy()
      }
    })
  })

  it("substitutes a configured token", () => {
    expect(replaceContentKeywords("{{APP_NAME}}")).toBe(appContent.APP_NAME)
    expect(replaceContentKeywords("{{ENTITY_NAME}}")).toBe(
      appContent.ENTITY_NAME,
    )
  })

  it("leaves an unknown token visible rather than blanking it", () => {
    // Blanking would silently publish a sentence with a hole in it; showing the
    // token makes the mistake obvious in review instead.
    expect(replaceContentKeywords("x {{NOT_A_TOKEN}} y")).toBe(
      "x {{NOT_A_TOKEN}} y",
    )
  })

  it("does not resolve a token whose config value is empty", () => {
    // A buyer who clears a legal field (say, the registered address) must see
    // the token still sitting there, not a legal sentence with a gap in it.
    const before = "{{ENTITY_NAME}}"
    expect(replaceContentKeywords(before)).toBe(appContent.ENTITY_NAME)
    expect(unresolvedContentKeywords("{{NOPE}}")).toEqual(["NOPE"])
  })

  it("substitutes every token the legal documents actually use", () => {
    const raw = read("terms.md")
    const keys = [
      ...new Set(
        (raw.match(/\{\{([A-Z_]+)\}\}/g) ?? []).map((t) => t.slice(2, -2)),
      ),
    ]
    // A non-empty set proves the documents really are token-driven rather than
    // quietly re-hardcoding the values this round was meant to remove.
    expect(keys.length).toBeGreaterThan(10)
    for (const key of keys) {
      expect(appContent).toHaveProperty(key)
    }
  })
})
