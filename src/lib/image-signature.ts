/**
 * Magic-byte sniffing (ROADMAP P0.2).
 *
 * A client-declared `file.type` and filename extension are attacker-controlled,
 * so the upload endpoint must decide what a file *is* from its bytes. This
 * covers the four image formats the app accepts.
 */

export type SniffedImageType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

/** Detect the image type from the leading bytes, or null when unrecognized. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) {
    return "image/gif"
  }
  // RIFF....WEBP
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP"))
    return "image/webp"
  return null
}

/** File extension a sniffed type is stored under. */
export const IMAGE_EXTENSION: Record<SniffedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
}
