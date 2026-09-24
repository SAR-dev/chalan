import { applyOrderTransition } from "@/features/orders/transitions"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const { id } = await params
  return applyOrderTransition("return", id, req)
})

