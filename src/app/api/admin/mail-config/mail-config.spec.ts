import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PATCH as activateMailConfig } from "./[id]/activate/route"
import { DELETE as deleteMailConfig } from "./[id]/route"
import { POST as createMailConfig, GET as listMailConfigs } from "./route"
import { POST as testMail } from "./test/route"

const { mockSendTestMail } = vi.hoisted(() => ({ mockSendTestMail: vi.fn() }))

vi.mock("@/lib/mailer", () => ({
  sendTestMail: mockSendTestMail,
}))

// encryptSecret needs a 64-hex-char AES-256 key; the crypto.ts dev fallback is
// not a valid 32-byte key, so stub a valid one for every test in this file.
vi.stubEnv("SMTP_SECRET_KEY", "ab".repeat(32))

afterAll(() => {
  vi.unstubAllEnvs()
})

const sessionState: { value: Record<string, unknown> | null } = { value: null }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

const selectQueue: unknown[][] = []
const updateResult: unknown[] = []
const updatePayloads: Record<string, unknown>[] = []
const insertResult: unknown[] = []
const insertPayloads: Record<string, unknown>[] = []

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      offset: () => chain,
      orderBy: () => chain,
      $dynamic: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled),
    }
    return chain
  }
  const makeUpdateChain = () => {
    const chain: Record<string, unknown> = {
      set: (vals: Record<string, unknown>) => {
        updatePayloads.push(vals)
        return chain
      },
      where: () => chain,
      returning: () => Promise.resolve(updateResult),
    }
    return chain
  }
  const makeInsertChain = () => {
    const chain: Record<string, unknown> = {
      values: (vals: Record<string, unknown>) => {
        insertPayloads.push(vals)
        return chain
      },
      returning: () => Promise.resolve(insertResult),
    }
    return chain
  }
  const makeDeleteChain = () => {
    const chain: Record<string, unknown> = {
      where: () => Promise.resolve(),
    }
    return chain
  }
  const tx = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
  }
  const db = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
    transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  }
  return { db, dbRead: { ...db, select: () => makeSelectChain() }, pool: {} }
})

beforeEach(() => {
  selectQueue.length = 0
  updateResult.length = 0
  updatePayloads.length = 0
  insertResult.length = 0
  insertPayloads.length = 0
  sessionState.value = null
  mockSendTestMail.mockReset()
})

function req(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? "http://test.local/api/admin/mail-config", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function ctx(id = "mc_1") {
  return { params: Promise.resolve({ id }) }
}

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "Warehouse Wendy",
  userId: "u2",
  warehouseId: "wh_1",
}
const merchantSession = {
  role: "MERCHANT",
  name: "Merchant Moe",
  userId: "u3",
  merchantId: "m_1",
}

const rawPass = "raw-smtp-password"
const maskedPass = "••••••••"

const validCreateBody = {
  label: "Primary SMTP",
  host: "smtp.example.com",
  port: "587",
  secure: false,
  user: "smtp-user",
  pass: "super-secret-pass",
  fromEmail: "no-reply@example.com",
  fromName: "Chalan",
}

const { label: _label, ...validTestBody } = validCreateBody

describe("GET /api/admin/mail-config", () => {
  it("403 when unauthenticated (route forbids missing session)", async () => {
    const res = await listMailConfigs()
    expect(res.status).toBe(403)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await listMailConfigs()
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await listMailConfigs()
    expect(res.status).toBe(403)
  })

  it("masks SMTP password in list — raw password never returned", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        id: "mc_1",
        label: "Primary",
        host: "smtp.example.com",
        port: "587",
        secure: false,
        user: "smtp-user",
        pass: rawPass,
        fromEmail: "no-reply@example.com",
        fromName: "Chalan",
        isActive: true,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "mc_2",
        label: "Backup",
        host: "smtp2.example.com",
        port: "465",
        secure: true,
        user: "smtp-user-2",
        pass: "",
        fromEmail: "no-reply@example.com",
        fromName: "Chalan",
        isActive: false,
        createdAt: "2025-01-02T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
      },
    ])
    const res = await listMailConfigs()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(2)
    expect(json[0].pass).toBe(maskedPass)
    expect(json[1].pass).toBe("")
    expect(JSON.stringify(json)).not.toContain(rawPass)
    expect(json[0]).toMatchObject({ id: "mc_1", isActive: true })
  })
})

describe("POST /api/admin/mail-config", () => {
  it("403 when unauthenticated (route forbids missing session)", async () => {
    const res = await createMailConfig(req("POST", undefined, validCreateBody))
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await createMailConfig(req("POST", undefined, validCreateBody))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body with issues", async () => {
    sessionState.value = admin
    const res = await createMailConfig(req("POST", undefined, {}))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 on invalid fromEmail", async () => {
    sessionState.value = admin
    const res = await createMailConfig(
      req("POST", undefined, { ...validCreateBody, fromEmail: "not-an-email" }),
    )
    expect(res.status).toBe(400)
  })

  it("creates config with encrypted password, returns masked", async () => {
    sessionState.value = admin
    insertResult.push({
      id: "mc_new",
      ...validCreateBody,
      pass: "enc:v1:abc123",
      isActive: false,
    })
    const res = await createMailConfig(req("POST", undefined, validCreateBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.id).toBe("mc_new")
    expect(json.pass).toBe(maskedPass)
    expect(JSON.stringify(json)).not.toContain("super-secret-pass")
    const stored = insertPayloads[0].pass as string
    expect(stored).not.toBe("super-secret-pass")
    expect(stored.startsWith("enc:v1:")).toBe(true)
  })
})

describe("POST /api/admin/mail-config/test", () => {
  it("403 when unauthenticated (route forbids missing session)", async () => {
    const res = await testMail(req("POST", undefined, validTestBody))
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await testMail(req("POST", undefined, validTestBody))
    expect(res.status).toBe(403)
  })

  it("400 on invalid body with issues", async () => {
    sessionState.value = admin
    const res = await testMail(req("POST", undefined, {}))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("400 on invalid to address", async () => {
    sessionState.value = admin
    const res = await testMail(
      req("POST", undefined, { ...validTestBody, to: "not-an-email" }),
    )
    expect(res.status).toBe(400)
  })

  it("sends test mail to fromEmail by default, returns ok", async () => {
    sessionState.value = admin
    mockSendTestMail.mockResolvedValue({ messageId: "msg_1" })
    const res = await testMail(req("POST", undefined, validTestBody))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, messageId: "msg_1" })
    expect(mockSendTestMail).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        user: "smtp-user",
        pass: "super-secret-pass",
      }),
      "no-reply@example.com",
    )
  })

  it("routes to the provided to address", async () => {
    sessionState.value = admin
    mockSendTestMail.mockResolvedValue({ messageId: "msg_2" })
    const res = await testMail(
      req("POST", undefined, { ...validTestBody, to: "ops@example.com" }),
    )
    expect(res.status).toBe(200)
    expect(mockSendTestMail).toHaveBeenCalledWith(
      expect.anything(),
      "ops@example.com",
    )
  })

  it("returns a generic 400 instead of echoing the SMTP error", async () => {
    sessionState.value = admin
    mockSendTestMail.mockRejectedValue(
      new Error("Invalid login: 535 5.7.8 Username and Password not accepted"),
    )
    const res = await testMail(req("POST", undefined, validTestBody))
    const json = await res.json()
    expect(res.status).toBe(400)
    // Connection failures can leak internal hostnames/addresses, so the detail
    // is logged rather than returned.
    expect(json.error).toBe(
      "Could not send the test email. Check the server logs.",
    )
  })
})

describe("DELETE /api/admin/mail-config/:id", () => {
  it("403 when unauthenticated (route forbids missing session)", async () => {
    const res = await deleteMailConfig(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("403 for merchant", async () => {
    sessionState.value = merchantSession
    const res = await deleteMailConfig(req("DELETE"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when config not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await deleteMailConfig(req("DELETE"), ctx("mc_missing"))
    expect(res.status).toBe(404)
  })

  it("400 when trying to delete the active config", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "mc_1", isActive: true }])
    const res = await deleteMailConfig(req("DELETE"), ctx())
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain("Cannot delete the active config")
  })

  it("deletes an inactive config", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "mc_2", isActive: false }])
    const res = await deleteMailConfig(req("DELETE"), ctx("mc_2"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true })
  })
})

describe("PATCH /api/admin/mail-config/:id/activate", () => {
  it("403 when unauthenticated (route forbids missing session)", async () => {
    const res = await activateMailConfig(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("403 for warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await activateMailConfig(req("PATCH"), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when config not found", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await activateMailConfig(req("PATCH"), ctx("mc_missing"))
    expect(res.status).toBe(404)
  })

  it("deactivates others, activates selected, masks password", async () => {
    sessionState.value = admin
    selectQueue.push(
      [{ id: "mc_2" }],
      [
        {
          id: "mc_2",
          label: "Backup",
          host: "smtp2.example.com",
          port: "465",
          secure: true,
          user: "smtp-user-2",
          pass: "enc:v1:xyz",
          fromEmail: "no-reply@example.com",
          fromName: "Chalan",
          isActive: true,
          createdAt: "2025-01-02T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        },
      ],
    )
    const res = await activateMailConfig(req("PATCH"), ctx("mc_2"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.id).toBe("mc_2")
    expect(json.isActive).toBe(true)
    expect(json.pass).toBe(maskedPass)
    expect(JSON.stringify(json)).not.toContain("enc:v1:xyz")
    expect(updatePayloads).toHaveLength(2)
    expect(updatePayloads[0]).toMatchObject({ isActive: false })
    expect(updatePayloads[1]).toMatchObject({ isActive: true })
  })
})
