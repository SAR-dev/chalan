import { applyBulkOrderTransition } from "@/features/orders/transitions"
import { bulkAssignRiderSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (req: Request) => {
  const parsed = await parseBody(req, bulkAssignRiderSchema)
  if (parsed.error) return parsed.error
  return applyBulkOrderTransition("dispatch", parsed.data.ids, parsed.data)
})
