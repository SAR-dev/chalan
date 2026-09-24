import { z } from "zod"
import { applyBulkOrderTransition } from "@/features/orders/transitions"
import { parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

const bulkAssignPickupSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  riderId: z.string().min(1, "Rider is required"),
})

export const PATCH = withErrorHandler(async (
req: Request
) => {
  const parsed = await parseBody(req, bulkAssignPickupSchema)
  if (parsed.error) return parsed.error
  return applyBulkOrderTransition(
    "assign-pickup-rider",
    parsed.data.ids,
    parsed.data,
  )
})
