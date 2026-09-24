import { applyBulkOrderTransition } from "@/features/orders/transitions"
import { idsSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (
req: Request
) => {
  const parsed = await parseBody(req, idsSchema)
  if (parsed.error) return parsed.error
  return applyBulkOrderTransition("approve", parsed.data.ids, parsed.data)
})
