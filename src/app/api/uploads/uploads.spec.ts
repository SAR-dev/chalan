import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as uploadFile } from "./route"

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/storage/config", () => ({
  ALLOWED_IMAGE_TYPES: ["image/png", "image/jpeg"],
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  UPLOAD_FOLDERS: ["avatars", "delivery-proof"],
}))

vi.mock("@/lib/storage", () => ({
  saveFile: () => Promise.resolve({ publicUrl: "https://cdn.test/file.png" }),
}))

beforeEach(() => {
  sessionState.value = null
})

function createFormFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }

describe("POST /api/uploads", () => {
  it("401 when unauthenticated", async () => {
    const form = new FormData()
    form.append("file", createFormFile("test.png", "image/png", 100))
    const res = await uploadFile(
      new Request("http://test.local/api", { method: "POST", body: form }),
    )
    expect(res.status).toBe(401)
  })

  it("400 when no file provided", async () => {
    sessionState.value = admin
    const form = new FormData()
    const res = await uploadFile(
      new Request("http://test.local/api", { method: "POST", body: form }),
    )
    expect(res.status).toBe(400)
  })

  it("uploads file and returns URL", async () => {
    sessionState.value = admin
    const form = new FormData()
    form.append("file", createFormFile("test.png", "image/png", 100))
    form.append("folder", "avatars")
    const res = await uploadFile(
      new Request("http://test.local/api", { method: "POST", body: form }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveProperty("url")
  })
})
