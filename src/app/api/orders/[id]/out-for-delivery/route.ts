import { applyOrderTransition } from "@/features/orders/transitions"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return applyOrderTransition("out-for-delivery", id, req)
}
