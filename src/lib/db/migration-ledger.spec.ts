import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  type JournalEntry,
  type LedgerRow,
  migrationHash,
  planLedgerReconciliation,
  readJournal,
} from "./migration-ledger"

describe("migrationHash", () => {
  it("is the SHA-256 hex of the file content", () => {
    const content = "CREATE TABLE x (id int);"
    expect(migrationHash(content)).toBe(
      createHash("sha256").update(content).digest("hex"),
    )
    expect(migrationHash(content)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when a single byte changes", () => {
    expect(migrationHash("a")).not.toBe(migrationHash("b"))
  })
})

describe("planLedgerReconciliation", () => {
  const journal: JournalEntry[] = [
    { tag: "0000_init", when: 100 },
    { tag: "0001_second", when: 200 },
  ]
  const hashFor = (tag: string) => (tag === "0000_init" ? "hash0" : "hash1")

  it("rewrites legacy filename rows to the content hash and journal time", () => {
    const rows: LedgerRow[] = [
      { id: 1, hash: "0000_init.sql", created_at: 999_999 },
    ]
    const { updates, unmatched } = planLedgerReconciliation(
      rows,
      journal,
      hashFor,
    )
    expect(updates).toEqual([{ id: 1, hash: "hash0", createdAt: 100 }])
    expect(unmatched).toEqual([])
  })

  it("leaves content-hash rows untouched", () => {
    const rows: LedgerRow[] = [{ id: 2, hash: "a".repeat(64), created_at: 100 }]
    const { updates, unmatched } = planLedgerReconciliation(
      rows,
      journal,
      hashFor,
    )
    expect(updates).toEqual([])
    expect(unmatched).toEqual([])
  })

  it("reports a filename with no matching journal entry as unmatched", () => {
    const rows: LedgerRow[] = [
      { id: 3, hash: "0009_ghost.sql", created_at: 500 },
    ]
    const { updates, unmatched } = planLedgerReconciliation(
      rows,
      journal,
      hashFor,
    )
    expect(updates).toEqual([])
    expect(unmatched).toEqual([
      { id: 3, hash: "0009_ghost.sql", created_at: 500 },
    ])
  })

  it("treats a filename whose file is missing as unmatched", () => {
    const rows: LedgerRow[] = [
      { id: 4, hash: "0001_second.sql", created_at: 200 },
    ]
    const { updates, unmatched } = planLedgerReconciliation(
      rows,
      journal,
      () => null,
    )
    expect(updates).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it("handles a mixed ledger in one pass", () => {
    const rows: LedgerRow[] = [
      { id: 1, hash: "0000_init.sql", created_at: 1 },
      { id: 2, hash: "b".repeat(64), created_at: 2 },
      { id: 3, hash: "0001_second.sql", created_at: 3 },
    ]
    const { updates, unmatched } = planLedgerReconciliation(
      rows,
      journal,
      hashFor,
    )
    expect(updates.map((u) => u.id)).toEqual([1, 3])
    expect(unmatched).toEqual([])
  })
})

describe("readJournal", () => {
  it("reads the real journal in order", () => {
    const journal = readJournal()
    expect(journal.length).toBeGreaterThan(0)
    expect(journal[0].tag).toBe("0000_init")
    expect(journal.map((e) => e.when)).toEqual(
      [...journal.map((e) => e.when)].sort((a, b) => a - b),
    )
    for (const entry of journal) {
      expect(typeof entry.when).toBe("number")
    }
  })
})
