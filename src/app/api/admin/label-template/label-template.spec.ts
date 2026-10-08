import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { POST as PUBLISH } from "./[id]/publish/route"
import { DELETE, GET as GET_ONE, PATCH } from "./[id]/route"
import { GET, POST } from "./route"

// =============================================================================
// Parcel label template routes (R5)
//
// Covers the designer's whole write path: create/read/update/discard the
// working draft, and publish it as an append-only version. These assert the
// route contract — auth, validation, the draft/published state machine, and
// that publishing appends rather than overwrites.
// =============================================================================

const sessionState: { value: Record<string, unknown> | null } = { value: null }

const selectQueue: unknown[][] = []
const insertResult: unknown[] = []
const insertPayloads: Record<string, unknown>[] = []
const updateResultQueue: unknown[][] = []
const updatePayloads: Record<string, unknown>[] = []
let deleteOutcome: unknown = { rowCount: 1 }

vi.mock("@/lib/api-auth", () => ({
  requireSession: () => Promise.resolve(sessionState.value),
}))

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => {}),
  logAuditMany: vi.fn(async () => {}),
}))

vi.mock("@/lib/db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (onFulfilled: (rows: unknown[]) => unknown) =>
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
      returning: () => Promise.resolve(updateResultQueue.shift() ?? []),
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
  const makeDeleteChain = () => ({
    where: () => Promise.resolve(deleteOutcome),
  })
  const db: Record<string, unknown> = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    delete: () => makeDeleteChain(),
  }
  // The publish route wraps the default-flip and the append in one transaction;
  // running the callback against the same mock keeps both visible to the test.
  db.transaction = (fn: (tx: typeof db) => unknown) => Promise.resolve(fn(db))
  return { db, dbRead: db, pool: {} }
})

const admin = { role: "SUPER_ADMIN", name: "Admin", userId: "u1" }
const warehouseAdmin = {
  role: "WAREHOUSE_ADMIN",
  name: "Wendy",
  userId: "u2",
  warehouseId: "wh_1",
}
const rider = { role: "RIDER", name: "Rhea", userId: "u3", riderId: "r_1" }

beforeEach(() => {
  selectQueue.length = 0
  updateResultQueue.length = 0
  updatePayloads.length = 0
  insertPayloads.length = 0
  insertResult.length = 0
  deleteOutcome = { rowCount: 1 }
  sessionState.value = null
})

function req(method: string, url: string, body?: unknown): Request {
  const absolute = url.startsWith("http") ? url : `http://test.local${url}`
  return new Request(absolute, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const validBody = {
  name: "Default parcel label",
  widthMm: 100,
  heightMm: 150,
  logoRef: null,
  template: DEFAULT_LABEL_TEMPLATE_PDFME,
}

const draftRow = {
  id: "lt_draft",
  ...validBody,
  version: 1,
  publishedAt: null,
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}
const publishedRow = {
  id: "lt_pub_1",
  ...validBody,
  version: 1,
  publishedAt: "2025-12-01T00:00:00.000Z",
  isDefault: true,
  createdAt: "2025-12-01T00:00:00.000Z",
  updatedAt: "2025-12-01T00:00:00.000Z",
}

describe("GET /api/admin/label-template", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(req("GET", "/api/admin/label-template"))
    expect(res.status).toBe(401)
  })

  it("403 for a warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await GET(req("GET", "/api/admin/label-template"))
    expect(res.status).toBe(403)
  })

  it("returns the draft, the live version and history", async () => {
    sessionState.value = admin
    selectQueue.push([
      draftRow,
      {
        ...publishedRow,
        id: "lt_pub_2",
        version: 2,
        publishedAt: "2026-02-01T00:00:00.000Z",
        isDefault: true,
      },
      publishedRow,
    ])
    const res = await GET(req("GET", "/api/admin/label-template"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.draft.id).toBe("lt_draft")
    expect(json.published.version).toBe(2)
    expect(json.versions).toHaveLength(2)
  })

  it("returns nulls when nothing exists yet", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await GET(req("GET", "/api/admin/label-template"))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.draft).toBeNull()
    expect(json.published).toBeNull()
    expect(json.versions).toEqual([])
  })
})

describe("POST /api/admin/label-template", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req("POST", "/api/admin/label-template", validBody))
    expect(res.status).toBe(401)
  })

  it("403 for a warehouse admin", async () => {
    sessionState.value = warehouseAdmin
    const res = await POST(req("POST", "/api/admin/label-template", validBody))
    expect(res.status).toBe(403)
  })

  it("400 on an empty body", async () => {
    sessionState.value = admin
    const res = await POST(req("POST", "/api/admin/label-template", {}))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe("Invalid request body")
    expect(json.issues).toBeDefined()
  })

  it("409 when a draft already exists", async () => {
    sessionState.value = admin
    selectQueue.push([{ id: "lt_draft" }])
    const res = await POST(req("POST", "/api/admin/label-template", validBody))
    expect(res.status).toBe(409)
    expect(insertPayloads).toHaveLength(0)
  })

  it("creates the first draft, unpublished and not the default", async () => {
    sessionState.value = admin
    selectQueue.push([])
    insertResult.push({ ...draftRow, id: "lt_new" })
    const res = await POST(req("POST", "/api/admin/label-template", validBody))
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      version: 1,
      publishedAt: null,
      isDefault: false,
      widthMm: 100,
      heightMm: 150,
    })
    expect(json.id).toBe("lt_new")
  })
})

describe("GET /api/admin/label-template/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET_ONE(req("GET", "/api/admin/label-template/lt_1"), {
      params: Promise.resolve({ id: "lt_1" }),
    })
    expect(res.status).toBe(401)
  })

  it("404 when unknown", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await GET_ONE(req("GET", "/api/admin/label-template/missing"), {
      params: Promise.resolve({ id: "missing" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns the row", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow])
    const res = await GET_ONE(
      req("GET", "/api/admin/label-template/lt_draft"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.id).toBe("lt_draft")
  })
})

describe("PATCH /api/admin/label-template/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/lt_draft", { name: "New" }),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(401)
  })

  it("404 when unknown", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/missing", { name: "New" }),
      { params: Promise.resolve({ id: "missing" }) },
    )
    expect(res.status).toBe(404)
  })

  it("409 when the row is already published", async () => {
    sessionState.value = admin
    selectQueue.push([publishedRow])
    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/lt_pub_1", { name: "New" }),
      { params: Promise.resolve({ id: "lt_pub_1" }) },
    )
    expect(res.status).toBe(409)
    expect(updatePayloads).toHaveLength(0)
  })

  it("saves the draft and returns the updated row", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow])
    updateResultQueue.push([{ ...draftRow, name: "New" }])
    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/lt_draft", { name: "New" }),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.name).toBe("New")
    expect(updatePayloads[0]).toMatchObject({ name: "New" })
  })

  it("400 on a body that changes nothing", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow])
    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/lt_draft", {}),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.issues).toBeDefined()
  })
})

describe("DELETE /api/admin/label-template/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(
      req("DELETE", "/api/admin/label-template/lt_draft"),
      {
        params: Promise.resolve({ id: "lt_draft" }),
      },
    )
    expect(res.status).toBe(401)
  })

  it("409 when the row is published", async () => {
    sessionState.value = admin
    selectQueue.push([publishedRow])
    const res = await DELETE(
      req("DELETE", "/api/admin/label-template/lt_pub_1"),
      { params: Promise.resolve({ id: "lt_pub_1" }) },
    )
    expect(res.status).toBe(409)
  })

  it("404 when unknown", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await DELETE(
      req("DELETE", "/api/admin/label-template/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    )
    expect(res.status).toBe(404)
  })

  it("discards the draft", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow])
    const res = await DELETE(
      req("DELETE", "/api/admin/label-template/lt_draft"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
  })
})

describe("POST /api/admin/label-template/:id/publish", () => {
  it("401 when unauthenticated", async () => {
    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/lt_draft/publish"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(401)
  })

  it("403 for a rider", async () => {
    sessionState.value = rider
    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/lt_draft/publish"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(403)
  })

  it("404 when unknown", async () => {
    sessionState.value = admin
    selectQueue.push([])
    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/missing/publish"),
      { params: Promise.resolve({ id: "missing" }) },
    )
    expect(res.status).toBe(404)
  })

  it("409 when the row is already published", async () => {
    sessionState.value = admin
    selectQueue.push([publishedRow])
    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/lt_pub_1/publish"),
      { params: Promise.resolve({ id: "lt_pub_1" }) },
    )
    expect(res.status).toBe(409)
  })

  it("appends a new version, clears the old default and makes the new one live", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow])
    selectQueue.push([{ max: 1 }])
    insertResult.push({
      ...draftRow,
      id: "lt_pub_2",
      version: 2,
      isDefault: true,
    })
    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/lt_draft/publish"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    const json = await res.json()
    expect(res.status).toBe(201)
    // The old default is flipped off before the append...
    expect(updatePayloads[0]).toMatchObject({ isDefault: false })
    // ...and the appended row is version 2 and live.
    expect(insertPayloads[0]).toMatchObject({
      version: 2,
      publishedAt: expect.any(String),
      isDefault: true,
    })
    expect(json.id).toBe("lt_pub_2")
  })
})

// =============================================================================
// pdfme engine: server-side template validation, paper size from basePdf,
// and publish copying the template.
// =============================================================================

/** The default template's paper size (narrowed — BasePdf is a union type). */
const PAPER = DEFAULT_LABEL_TEMPLATE_PDFME.basePdf as {
  width: number
  height: number
}

/** A template whose QR sits exactly on the scannable floor (30mm square). */
function validPdfmeTemplate(): typeof DEFAULT_LABEL_TEMPLATE_PDFME {
  return JSON.parse(JSON.stringify(DEFAULT_LABEL_TEMPLATE_PDFME))
}

/** Same, but with a QR under the floor — must be rejected everywhere. */
function undersizedQrTemplate(): typeof DEFAULT_LABEL_TEMPLATE_PDFME {
  const t = validPdfmeTemplate()
  const qr = t.schemas[0].find((s) => s.type === "qrcode")
  if (qr) {
    qr.width = 10
    qr.height = 10
  }
  return t
}

describe("pdfme engine routes", () => {
  it("creates a draft, taking paper size from basePdf", async () => {
    sessionState.value = admin
    selectQueue.push([]) // no draft exists
    insertResult.push({ id: "lt_pdfme" })

    const res = await POST(
      req("POST", "/api/admin/label-template", {
        name: "Canvas label",
        widthMm: 120, // in range, but the client copy must be ignored anyway
        heightMm: 180,
        template: validPdfmeTemplate(),
      }),
    )
    expect(res.status).toBe(201)
    const payload = insertPayloads[0]
    expect(payload.template).toEqual(validPdfmeTemplate())
    // Rule 7: widthMm/heightMm come from basePdf, never the client values.
    expect(payload.widthMm).toBe(PAPER.width)
    expect(payload.heightMm).toBe(PAPER.height)
  })

  it("rejects a template whose QR is under the scannable floor", async () => {
    sessionState.value = admin
    const res = await POST(
      req("POST", "/api/admin/label-template", {
        name: "Too small",
        widthMm: 100,
        heightMm: 150,
        template: undersizedQrTemplate(),
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/invalid pdfme template/i)
  })

  it("rejects a draft with no template", async () => {
    sessionState.value = admin
    const res = await POST(
      req("POST", "/api/admin/label-template", {
        name: "Empty",
        widthMm: 100,
        heightMm: 150,
      }),
    )
    expect(res.status).toBe(400)
  })

  it("PATCH validates a supplied template and rewrites widthMm/heightMm from basePdf", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow]) // existing row read happens first
    updateResultQueue.push([{ id: "lt_draft" }])

    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/lt_draft", {
        template: validPdfmeTemplate(),
        widthMm: 120,
        heightMm: 180,
      }),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(200)
    expect(updatePayloads[0]).toMatchObject({
      template: validPdfmeTemplate(),
      widthMm: PAPER.width,
      heightMm: PAPER.height,
    })
  })

  it("PATCH rejects an invalid template before touching the row", async () => {
    sessionState.value = admin
    selectQueue.push([draftRow])

    const res = await PATCH(
      req("PATCH", "/api/admin/label-template/lt_draft", {
        template: undersizedQrTemplate(),
      }),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })

  it("publish copies the template into the appended version", async () => {
    sessionState.value = admin
    const pdfmeDraft = {
      ...draftRow,
      template: validPdfmeTemplate(),
    }
    selectQueue.push([pdfmeDraft])
    selectQueue.push([{ max: 3 }])
    insertResult.push({
      ...pdfmeDraft,
      id: "lt_pub_4",
      version: 4,
      isDefault: true,
    })

    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/lt_draft/publish"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(201)
    expect(insertPayloads[0]).toMatchObject({
      template: validPdfmeTemplate(),
      version: 4,
      isDefault: true,
    })
  })

  it("publish refuses an invalid pdfme template", async () => {
    sessionState.value = admin
    selectQueue.push([
      {
        ...draftRow,
        template: undersizedQrTemplate(),
      },
    ])

    const res = await PUBLISH(
      req("POST", "/api/admin/label-template/lt_draft/publish"),
      { params: Promise.resolve({ id: "lt_draft" }) },
    )
    expect(res.status).toBe(400)
    expect(insertPayloads).toHaveLength(0)
  })
})
