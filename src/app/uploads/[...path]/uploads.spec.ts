import { beforeEach, describe, expect, it, vi } from "vitest"
import { PUBLIC_UPLOAD_FOLDERS } from "@/lib/storage/config"
import { GET } from "./route"

const state = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  fileMissing: false,
  readCalls: 0,
}))

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(state.session),
}))

// The route reads through the storage abstraction (so the local and R2
// backends share one path), so mock that rather than the filesystem.
vi.mock("@/lib/storage", () => ({
  readFile: () => {
    state.readCalls += 1
    return state.fileMissing
      ? Promise.resolve(null)
      : Promise.resolve({
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          contentType: null,
        })
  },
}))

function req(
  segments: string[],
): [Request, { params: Promise<{ path: string[] }> }] {
  return [
    new Request(`http://test.local/uploads/${segments.join("/")}`),
    { params: Promise.resolve({ path: segments }) },
  ]
}

const merchant = { userId: "u_1", role: "MERCHANT" }
const superAdmin = { userId: "u_admin", role: "SUPER_ADMIN" }

beforeEach(() => {
  state.session = null
  state.fileMissing = false
  state.readCalls = 0
})

describe("GET /uploads/[...path] access policy", () => {
  // `logos` was the only world-readable folder and went with the branding
  // feature: nothing uploaded to it and nothing rendered it. With
  // PUBLIC_UPLOAD_FOLDERS empty, every stored file needs a session — asserted
  // so a folder can never quietly become public again without a test noticing.
  it("serves nothing without a session: no folder is public", async () => {
    expect(PUBLIC_UPLOAD_FOLDERS).toEqual([])
    const res = await GET(...req(["avatars", "u_1", "me.png"]))
    expect(res.status).toBe(401)
    expect(state.readCalls).toBe(0)
  })

  it("401s for a private file without a session", async () => {
    const res = await GET(...req(["nids", "u_1", "id.png"]))
    expect(res.status).toBe(401)
    // Auth is checked before touching the filesystem.
    expect(state.readCalls).toBe(0)
  })

  it("403s for another user's NID", async () => {
    state.session = merchant
    const res = await GET(...req(["nids", "u_other", "id.png"]))
    expect(res.status).toBe(403)
    expect(state.readCalls).toBe(0)
  })

  it("serves the owner their own NID with a private cache", async () => {
    state.session = merchant
    const res = await GET(...req(["nids", "u_1", "id.png"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toContain("private")
  })

  it("lets a SUPER_ADMIN read any NID (review flow)", async () => {
    state.session = superAdmin
    const res = await GET(...req(["nids", "u_1", "id.png"]))
    expect(res.status).toBe(200)
  })

  it("403s for another user's avatar", async () => {
    state.session = merchant
    const res = await GET(...req(["avatars", "u_other", "me.png"]))
    expect(res.status).toBe(403)
  })

  it("requires a session for order proofs but allows any role", async () => {
    const anonymous = await GET(...req(["delivery-proofs", "u_9", "proof.png"]))
    expect(anonymous.status).toBe(401)

    state.session = merchant
    const authed = await GET(...req(["delivery-proofs", "u_9", "proof.png"]))
    expect(authed.status).toBe(200)
  })

  it("404s for traversal attempts", async () => {
    const res = await GET(...req(["nids", "..", "secret.png"]))
    expect(res.status).toBe(404)
    expect(state.readCalls).toBe(0)
  })

  it("404s when the file does not exist", async () => {
    state.session = merchant
    state.fileMissing = true
    const res = await GET(...req(["nids", "u_1", "missing.png"]))
    expect(res.status).toBe(404)
  })
})
