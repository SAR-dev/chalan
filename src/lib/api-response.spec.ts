import { describe, expect, it } from "vitest"
import {
  badRequest,
  conflict,
  errorResponse,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api-response"

describe("errorResponse", () => {
  it("returns a JSON response with error message and status", async () => {
    const res = errorResponse("Something went wrong", 400)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Something went wrong" })
  })
})

describe("unauthorized", () => {
  it("returns 401 with null body", async () => {
    const res = unauthorized()
    expect(res.status).toBe(401)
    expect(await res.json()).toBeNull()
  })
})

describe("forbidden", () => {
  it("returns 403 with default message", async () => {
    const res = forbidden()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Forbidden" })
  })

  it("returns 403 with custom message", async () => {
    const res = forbidden("Not allowed")
    expect(await res.json()).toEqual({ error: "Not allowed" })
  })
})

describe("notFound", () => {
  it("returns 404 with default message", async () => {
    const res = notFound()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Not found" })
  })

  it("returns 404 with custom message", async () => {
    const res = notFound("User not found")
    expect(await res.json()).toEqual({ error: "User not found" })
  })
})

describe("badRequest", () => {
  it("returns 400 with given message", async () => {
    const res = badRequest("Invalid email")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid email" })
  })
})

describe("conflict", () => {
  it("returns 409 with given message", async () => {
    const res = conflict("Duplicate entry")
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Duplicate entry" })
  })
})

describe("serverError", () => {
  it("returns 500 with default message", async () => {
    const res = serverError()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Internal server error" })
  })
})
