import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const state = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  tokenValid: false,
  saved: [] as { path: string; mime: string; size: number }[],
}))

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(state.session),
}))

vi.mock("@/lib/upload-token", () => ({
  verifyUploadToken: () => state.tokenValid,
}))

vi.mock("@/lib/storage", () => ({
  saveFile: (path: string, buffer: Buffer, mime: string) => {
    state.saved.push({ path, mime, size: buffer.length })
    return Promise.resolve({ path, publicUrl: `/uploads/${path}` })
  },
}))

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
])
const NOT_IMAGE = Buffer.from("<html>nope</html>")

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const BOUNDARY = "----vitestboundary"

function multipart(fields: {
  file?: { bytes: Buffer; name: string; type: string }
  folder?: string
  uploadToken?: string
}): { body: Buffer; contentType: string } {
  const parts: Buffer[] = []
  const text = (value: string) => parts.push(Buffer.from(value, "utf8"))

  if (fields.folder !== undefined) {
    text(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n${fields.folder}\r\n`,
    )
  }
  if (fields.uploadToken !== undefined) {
    text(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="uploadToken"\r\n\r\n${fields.uploadToken}\r\n`,
    )
  }
  if (fields.file) {
    text(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${fields.file.name}"\r\nContent-Type: ${fields.file.type}\r\n\r\n`,
    )
    parts.push(fields.file.bytes)
    text("\r\n")
  }
  text(`--${BOUNDARY}--\r\n`)

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  }
}

function req(
  fields: Parameters<typeof multipart>[0],
  options: { contentLength?: number | null } = {},
): Request {
  const { body, contentType } = multipart(fields)
  const headers: Record<string, string> = { "content-type": contentType }
  const length =
    options.contentLength === undefined ? body.length : options.contentLength
  if (length !== null) headers["content-length"] = String(length)
  return new Request("http://test.local/api/uploads", {
    method: "POST",
    headers,
    body,
  })
}

const validFile = { bytes: PNG, name: "id.png", type: "image/png" }

beforeEach(() => {
  state.session = null
  state.tokenValid = false
  state.saved.length = 0
})

describe("POST /api/uploads", () => {
  it("411 when Content-Length is missing (no unbounded buffering)", async () => {
    const res = await POST(
      req({ folder: "avatars", file: validFile }, { contentLength: null }),
    )
    expect(res.status).toBe(411)
    expect(state.saved).toHaveLength(0)
  })

  it("413 before parsing when the declared size exceeds the cap", async () => {
    const res = await POST(
      req(
        { folder: "avatars", file: validFile },
        { contentLength: MAX_UPLOAD_BYTES + 1024 * 1024 },
      ),
    )
    expect(res.status).toBe(413)
    expect(state.saved).toHaveLength(0)
  })

  it("400 for an invalid folder", async () => {
    state.session = { userId: "u_1", role: "MERCHANT" }
    const res = await POST(req({ folder: "secrets", file: validFile }))
    expect(res.status).toBe(400)
  })

  it("400 when no file is provided", async () => {
    state.session = { userId: "u_1", role: "MERCHANT" }
    const res = await POST(req({ folder: "avatars" }))
    expect(res.status).toBe(400)
  })

  it("401 for an unauthenticated non-NID upload", async () => {
    const res = await POST(req({ folder: "avatars", file: validFile }))
    expect(res.status).toBe(401)
    expect(state.saved).toHaveLength(0)
  })

  it("403 for an anonymous NID upload without a valid token", async () => {
    const res = await POST(req({ folder: "nids", file: validFile }))
    expect(res.status).toBe(403)
    expect(state.saved).toHaveLength(0)
  })

  it("allows an anonymous NID upload with a valid token", async () => {
    state.tokenValid = true
    const res = await POST(
      req({ folder: "nids", file: validFile, uploadToken: "signed" }),
    )
    expect(res.status).toBe(200)
    expect(state.saved[0]).toMatchObject({ mime: "image/png" })
    expect(state.saved[0]?.path).toMatch(/^nids\/public\/[0-9a-f-]{36}\.png$/)
  })

  it("rejects a file whose bytes are not an allowed image", async () => {
    state.session = { userId: "u_1", role: "MERCHANT" }
    const res = await POST(
      req({
        folder: "avatars",
        file: { bytes: NOT_IMAGE, name: "x.png", type: "image/png" },
      }),
    )
    expect(res.status).toBe(400)
    expect(state.saved).toHaveLength(0)
  })

  it("stores an authenticated upload under the caller's id and sniffed type", async () => {
    state.session = { userId: "u_1", role: "MERCHANT" }
    const res = await POST(
      req({
        folder: "avatars",
        // Client lies about the type; the sniff decides.
        file: { bytes: PNG, name: "photo.html", type: "text/html" },
      }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.url).toMatch(/^\/uploads\/avatars\/u_1\/[0-9a-f-]{36}\.png$/)
    expect(state.saved[0]).toMatchObject({ mime: "image/png" })
  })

  it("lets a signed-in merchant upload their own NID without a token", async () => {
    state.session = { userId: "u_9", role: "MERCHANT" }
    const res = await POST(req({ folder: "nids", file: validFile }))
    expect(res.status).toBe(200)
    expect(state.saved[0]?.path).toMatch(/^nids\/u_9\/[0-9a-f-]{36}\.png$/)
  })
})
