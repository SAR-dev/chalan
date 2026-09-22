import { describe, expect, it } from "vitest"
import * as schema from "./schema"
import * as schemaPostgres from "./schema.postgres"

describe("schema re-export", () => {
  it("re-exports all exports from schema.postgres", () => {
    const postgresKeys = Object.keys(schemaPostgres)
    for (const key of postgresKeys) {
      expect(schema).toHaveProperty(key)
    }
  })

  it("has no extra exports beyond schema.postgres", () => {
    const schemaKeys = Object.keys(schema)
    const postgresKeys = Object.keys(schemaPostgres)
    for (const key of schemaKeys) {
      expect(postgresKeys).toContain(key)
    }
  })

  it("re-exports user table", () => {
    expect(schema.user).toBeDefined()
    expect(schema.user).toBe(schemaPostgres.user)
  })

  it("re-exports profile table", () => {
    expect(schema.profile).toBeDefined()
    expect(schema.profile).toBe(schemaPostgres.profile)
  })

  it("re-exports merchant table", () => {
    expect(schema.merchant).toBeDefined()
    expect(schema.merchant).toBe(schemaPostgres.merchant)
  })

  it("re-exports order table", () => {
    expect(schema.order).toBeDefined()
    expect(schema.order).toBe(schemaPostgres.order)
  })

  it("re-exports rider table", () => {
    expect(schema.rider).toBeDefined()
    expect(schema.rider).toBe(schemaPostgres.rider)
  })

  it("re-exports warehouse table", () => {
    expect(schema.warehouse).toBeDefined()
    expect(schema.warehouse).toBe(schemaPostgres.warehouse)
  })
})
