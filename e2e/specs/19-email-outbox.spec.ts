import "dotenv/config"

import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"
import { Client } from "pg"

// ─── S52. Email outbox (ROADMAP P1.5) ───────────────────────────────────────
//
// A domain write commits its email as an `email_outbox` row; if the process
// dies before delivery, the drain cron still sends it. Here we simulate the
// "committed then died" case by inserting a row directly and running the cron.

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — .env failed to load")
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

test.describe("S52. Email outbox", () => {
  test("the drain cron delivers a row left behind by a dead request", async ({
    request,
  }) => {
    const secret = process.env.CRON_SECRET
    expect(secret, "CRON_SECRET must be set for this spec").toBeTruthy()
    const subject = `S52 outbox ${Date.now()}`

    const id = await withDb(async (client) => {
      const rowId = randomUUID()
      await client.query(
        `INSERT INTO email_outbox (id, "to", subject, text, status)
         VALUES ($1, $2, $3, $4, 'PENDING')`,
        [rowId, "s52@example.com", subject, "outbox delivery test"],
      )
      return rowId
    })

    try {
      const res = await request.post("/api/cron/drain-email-outbox", {
        headers: { authorization: `Bearer ${secret}` },
      })
      expect(res.ok()).toBeTruthy()
      const json = (await res.json()) as { claimed: number }
      expect(json.claimed).toBeGreaterThanOrEqual(1)

      const after = await withDb(async (client) => {
        const row = await client.query(
          `SELECT status, attempts, "lastError" FROM email_outbox WHERE id = $1`,
          [id],
        )
        const logs = await client.query(
          `SELECT count(1)::int AS n FROM email_log WHERE subject = $1`,
          [subject],
        )
        return {
          status: row.rows[0]?.status as string,
          attempts: Number(row.rows[0]?.attempts ?? 0),
          logs: Number(logs.rows[0]?.n ?? 0),
        }
      })

      // No SMTP in e2e, so the single attempt fails. The row is marked FAILED
      // (never retried) but it was processed, and the delivery record was
      // written — failed mails are kept in the DB.
      expect(after.attempts).toBe(1)
      expect(after.status).toBe("FAILED")
      expect(after.logs).toBe(1)
    } finally {
      await withDb(async (client) => {
        await client.query(`DELETE FROM email_outbox WHERE id = $1`, [id])
        await client.query(`DELETE FROM email_log WHERE subject = $1`, [
          subject,
        ])
      })
    }
  })
})
