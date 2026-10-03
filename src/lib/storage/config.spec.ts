import { describe, expect, it } from "vitest"
import type { UploadFolder } from "./config"
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  PUBLIC_UPLOAD_FOLDERS,
  UPLOAD_FOLDERS,
  UPLOAD_MAX_DIMENSIONS,
} from "./config"

describe("ALLOWED_IMAGE_TYPES", () => {
  it("contains 5 image types", () => {
    expect(ALLOWED_IMAGE_TYPES).toHaveLength(5)
  })

  it("includes common web image types", () => {
    expect(ALLOWED_IMAGE_TYPES).toContain("image/png")
    expect(ALLOWED_IMAGE_TYPES).toContain("image/jpeg")
    expect(ALLOWED_IMAGE_TYPES).toContain("image/jpg")
    expect(ALLOWED_IMAGE_TYPES).toContain("image/webp")
    expect(ALLOWED_IMAGE_TYPES).toContain("image/gif")
  })

  it("all are strings", () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(typeof type).toBe("string")
    }
  })
})

describe("MAX_UPLOAD_BYTES", () => {
  it("is 5MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024)
  })

  it("equals 5242880", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5242880)
  })
})

describe("UPLOAD_FOLDERS", () => {
  it("contains 4 folders", () => {
    // Was 5: `logos` went with the branding feature — nothing uploaded to it
    // and nothing rendered it.
    expect(UPLOAD_FOLDERS).toHaveLength(4)
  })

  it("includes expected folder names", () => {
    expect(UPLOAD_FOLDERS).toContain("avatars")
    expect(UPLOAD_FOLDERS).toContain("delivery-proofs")
    expect(UPLOAD_FOLDERS).toContain("pickups")
    expect(UPLOAD_FOLDERS).toContain("nids")
    // Removed with the branding feature: nothing uploaded to it and nothing
    // Rendered it.
    expect(UPLOAD_FOLDERS).not.toContain("logos")
    // …which leaves nothing world-readable, by design.
    expect(PUBLIC_UPLOAD_FOLDERS).toEqual([])
  })
})

describe("UPLOAD_MAX_DIMENSIONS", () => {
  it("has a dimension for every upload folder", () => {
    for (const folder of UPLOAD_FOLDERS) {
      expect(UPLOAD_MAX_DIMENSIONS[folder]).toBeDefined()
      expect(typeof UPLOAD_MAX_DIMENSIONS[folder]).toBe("number")
    }
  })

  it("avatars are 500px", () => {
    expect(UPLOAD_MAX_DIMENSIONS.avatars).toBe(500)
  })

  it("delivery-proofs are 1024px", () => {
    expect(UPLOAD_MAX_DIMENSIONS["delivery-proofs"]).toBe(1024)
  })

  it("pickups are 1024px", () => {
    expect(UPLOAD_MAX_DIMENSIONS.pickups).toBe(1024)
  })

  it("nids are 2048px", () => {
    expect(UPLOAD_MAX_DIMENSIONS.nids).toBe(2048)
  })

  it("all dimensions are positive", () => {
    for (const folder of Object.keys(UPLOAD_MAX_DIMENSIONS) as UploadFolder[]) {
      expect(UPLOAD_MAX_DIMENSIONS[folder]).toBeGreaterThan(0)
    }
  })
})
