import { describe, expect, it } from "vitest"
import { stripMarkdown } from "./markdown"

describe("stripMarkdown", () => {
  it("returns plain text unchanged", () => {
    expect(stripMarkdown("Just a sentence.")).toBe("Just a sentence.")
  })

  it("drops heading markers", () => {
    expect(stripMarkdown("## Release notes")).toBe("Release notes")
    expect(stripMarkdown("# One\n### Three")).toBe("One Three")
  })

  it("keeps link labels and image alt text, dropping URLs", () => {
    expect(stripMarkdown("See [the docs](https://example.com/x).")).toBe(
      "See the docs.",
    )
    expect(stripMarkdown("![logo](https://example.com/l.png) here")).toBe(
      "logo here",
    )
  })

  it("removes emphasis markers but keeps the words", () => {
    expect(stripMarkdown("**bold** and *italic* and ~~gone~~")).toBe(
      "bold and italic and gone",
    )
    expect(stripMarkdown("`code` inline")).toBe("code inline")
  })

  it("removes list markers and blockquotes", () => {
    expect(stripMarkdown("- first\n- second")).toBe("first second")
    expect(stripMarkdown("1. one\n2. two")).toBe("one two")
    expect(stripMarkdown("> quoted")).toBe("quoted")
  })

  it("keeps code fence contents but drops the fences", () => {
    expect(stripMarkdown("```ts\nconst x = 1\n```")).toBe("const x = 1")
  })

  it("collapses newlines into a single line", () => {
    expect(stripMarkdown("line one\n\nline two")).toBe("line one line two")
  })

  it("handles a realistic announcement without leaking syntax", () => {
    const md = [
      "# Holiday schedule",
      "",
      "We will be **closed** on 26 March.",
      "",
      "- Dhaka office: closed",
      "- Read [the notice](https://example.com/notice)",
    ].join("\n")
    expect(stripMarkdown(md)).toBe(
      "Holiday schedule We will be closed on 26 March. Dhaka office: closed Read the notice",
    )
  })

  it("never returns a string longer than its input collapsed", () => {
    const md = "# a\n\n- b\n\n**c**"
    expect(stripMarkdown(md).length).toBeLessThanOrEqual(md.length)
  })
})
