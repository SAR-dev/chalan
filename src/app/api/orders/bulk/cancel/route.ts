import { z } from "zod"
import { applyBulkOrderTransition } from "@/features/orders/transitions"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

const bulkCancelSchema = idsSchema.extend({
  reason: z.string().trim().min(1).optional(),
})

export const PATCH = withErrorHandler(async (req: Request) => {
  const parsed = await parseBody(req, bulkCancelSchema)
  if (parsed.error) return parsed.error
  return applyBulkOrderTransition("cancel", parsed.data.ids, parsed.data)
})
