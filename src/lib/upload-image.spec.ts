// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

let compressorShouldFail = false

vi.mock("compressorjs", () => ({
  default: vi.fn(function MockCompressor(_file: any, opts: any) {
    if (compressorShouldFail) {
      queueMicrotask(() => opts.error(new Error("Compression failed")))
    } else {
      queueMicrotask(() => opts.success(_file))
    }
  }),
}))

describe("uploadImage", () => {
  afterEach(() => {
    compressorShouldFail = false
    vi.unstubAllGlobals()
  })

  it("returns ok true on successful upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "/uploads/test.png" }),
      }),
    )

    const { uploadImage } = await import("@/lib/upload-image")
    const file = new File(["dummy"], "test.png", { type: "image/png" })
    const result = await uploadImage(file, "avatars")
    expect(result).toEqual({ ok: true, url: "/uploads/test.png" })
  })

  it("returns ok false on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    )

    const { uploadImage } = await import("@/lib/upload-image")
    const file = new File(["dummy"], "test.png", { type: "image/png" })
    const result = await uploadImage(file, "avatars")
    expect(result).toEqual({
      ok: false,
      error: "Network error while uploading. Try again.",
    })
  })

  it("returns ok false when server returns error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "File too large" }),
      }),
    )

    const { uploadImage } = await import("@/lib/upload-image")
    const file = new File(["dummy"], "test.png", { type: "image/png" })
    const result = await uploadImage(file, "avatars")
    expect(result).toEqual({ ok: false, error: "File too large" })
  })

  it("returns compression error when compressor fails", async () => {
    compressorShouldFail = true
    vi.stubGlobal("fetch", vi.fn())

    const { uploadImage } = await import("@/lib/upload-image")
    const file = new File(["dummy"], "test.png", { type: "image/png" })
    const result = await uploadImage(file, "avatars")
    expect(result).toEqual({
      ok: false,
      error: "Could not compress the image. Try again.",
    })
  })
})
