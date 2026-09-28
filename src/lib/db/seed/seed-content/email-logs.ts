// ---------------------------------------------------------------------------
// Deterministic: Email logs (3)
// ---------------------------------------------------------------------------
export interface EmailLogSeedEntry {
  id: string
  to: string
  subject: string
  textBody: string
  status: "SENT" | "FAILED"
  attempts: number
  error: string | null
  createdAt: string
}

export const SEED_EMAIL_LOGS: EmailLogSeedEntry[] = [
  {
    id: "EL-100001E",
    to: "merchant1@email.com",
    subject: "[Delivery Management] Your merchant account has been approved",
    textBody:
      "Dear Owner 1, your merchant account has been approved. You can now start accepting orders.",
    status: "SENT",
    attempts: 1,
    error: null,
    createdAt: "2026-07-02T10:05:00.000Z",
  },
  {
    id: "EL-100002E",
    to: "merchant2@email.com",
    subject: "[Delivery Management] Your merchant account has been approved",
    textBody:
      "Dear Owner 2, your merchant account has been approved. You can now start accepting orders.",
    status: "FAILED",
    attempts: 3,
    error: "Connection timeout after 30s",
    createdAt: "2026-07-03T10:05:00.000Z",
  },
  {
    id: "EL-100003E",
    to: "merchant3@email.com",
    subject: "[Delivery Management] New order notification",
    textBody:
      "You have received a new order. Please log in to view details and arrange pickup.",
    status: "SENT",
    attempts: 1,
    error: null,
    createdAt: "2026-07-05T12:00:00.000Z",
  },
]
