import type { Rider } from "@/lib/types"

export interface EditRiderDialogProps {
  rider: Rider | null
  open: boolean
  onOpenChange: (open: boolean) => void
  // When false (e.g. a Warehouse Admin managing their own hub), the home
  // warehouse cannot be changed and the warehouse selector is hidden.
  canReassignWarehouse?: boolean
}
