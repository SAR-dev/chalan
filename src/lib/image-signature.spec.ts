import { describe, expect, it } from "vitest"
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-signature"

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
])
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const gif87 = Uint8Array.from([...Buffer.from("GIF87a"), 0x01, 0x02])
const gif89 = Uint8Array.from([...Buffer.from("GIF89a"), 0x01, 0x02])
const webp = Uint8Array.from([
  ...Buffer.from("RIFF"),
  0x00,
  0x00,
  0x00,
  0x00,
  ...Buffer.from("WEBP"),
])

describe("sniffImageType", () => {
  it("detects PNG, JPEG, GIF and WEBP", () => {
    expect(sniffImageType(png)).toBe("image/png")
    expect(sniffImageType(jpeg)).toBe("image/jpeg")
    expect(sniffImageType(gif87)).toBe("image/gif")
    expect(sniffImageType(gif89)).toBe("image/gif")
    expect(sniffImageType(webp)).toBe("image/webp")
  })

  it("rejects non-images and truncated input", () => {
    expect(sniffImageType(Buffer.from("<html>not an image</html>"))).toBeNull()
    expect(sniffImageType(Buffer.from(""))).toBeNull()
    expect(sniffImageType(Uint8Array.from([0x89, 0x50]))).toBeNull()
    // RIFF but not WEBP (e.g. a WAV file)
    expect(
      sniffImageType(
        Uint8Array.from([
          ...Buffer.from("RIFF"),
          0,
          0,
          0,
          0,
          ...Buffer.from("WAVE"),
        ]),
      ),
    ).toBeNull()
  })

  it("maps each type to a safe extension", () => {
    expect(IMAGE_EXTENSION["image/png"]).toBe("png")
    expect(IMAGE_EXTENSION["image/jpeg"]).toBe("jpg")
    expect(IMAGE_EXTENSION["image/gif"]).toBe("gif")
    expect(IMAGE_EXTENSION["image/webp"]).toBe("webp")
  })
})
