import { MERCHANT_IDS } from "./merchants"
import { ADMIN_USER_NAMES } from "./users"

// ---------------------------------------------------------------------------
// Deterministic: Audit logs (5)
// ---------------------------------------------------------------------------
export interface AuditLogSeedEntry {
  id: string
  actorName: string
  actorRole: "SUPER_ADMIN"
  action: string
  entityType: string
  entityId: string
  description: string
  createdAt: string
}

export const SEED_AUDIT_LOGS: AuditLogSeedEntry[] = [
  {
    id: "AL-100001E",
    actorName: ADMIN_USER_NAMES.nadia,
    actorRole: "SUPER_ADMIN",
    action: "MERCHANT_APPROVED",
    entityType: "merchant",
    entityId: "MER-100001E",
    description: "Approved merchant Acme Corp",
    createdAt: "2026-07-10T09:00:00.000Z",
  },
  {
    id: "AL-100002E",
    actorName: ADMIN_USER_NAMES.tanvir,
    actorRole: "SUPER_ADMIN",
    action: "MERCHANT_APPROVED",
    entityType: "merchant",
    entityId: MERCHANT_IDS.merchant1,
    description: `Approved merchant Merchant 1 Business`,
    createdAt: "2026-07-02T10:00:00.000Z",
  },
  {
    id: "AL-100003E",
    actorName: ADMIN_USER_NAMES.tanvir,
    actorRole: "SUPER_ADMIN",
    action: "ORDER_APPROVED",
    entityType: "order",
    entityId: "E2E-APPROVED-001",
    description: "Approved order E2E-APPROVED-001",
    createdAt: "2026-07-13T10:00:00.000Z",
  },
  {
    id: "AL-100004E",
    actorName: ADMIN_USER_NAMES.nadia,
    actorRole: "SUPER_ADMIN",
    action: "PAYOUT_APPROVED",
    entityType: "payout_request",
    entityId: "PR-100001E",
    description: "Approved payout request PR-100001E",
    createdAt: "2026-07-14T09:00:00.000Z",
  },
  {
    id: "AL-100005E",
    actorName: ADMIN_USER_NAMES.nadia,
    actorRole: "SUPER_ADMIN",
    action: "TEAM_MEMBER_CREATED",
    entityType: "user",
    entityId: "seed_user_staff_1",
    description: "Created staff account for Staff Member One",
    createdAt: "2026-07-12T14:00:00.000Z",
  },
]
