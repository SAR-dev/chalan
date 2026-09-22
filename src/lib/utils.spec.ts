import { describe, expect, it } from "vitest"
import { cn, initials } from "@/lib/utils"

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1")
  })

  it("resolves conflicting classes (last wins)", () => {
    expect(cn("px-4", "px-2")).toBe("px-2")
  })

  it("handles conditional classes via clsx syntax", () => {
    expect(cn("base", false, "visible")).toBe("base visible")
  })

  it("handles undefined and null inputs", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b")
  })
})

describe("initials", () => {
  it("returns uppercase initials from first and last name", () => {
    expect(initials("Tanvir Hasan")).toBe("TH")
  })

  it("returns single initial for single name", () => {
    expect(initials("Tanvir")).toBe("T")
  })

  it("returns two initials for three names", () => {
    expect(initials("John Michael Doe")).toBe("JM")
  })

  it("handles lowercase input", () => {
    expect(initials("tanvir hossain")).toBe("TH")
  })

  it("handles empty string", () => {
    expect(initials("")).toBe("")
  })
})
