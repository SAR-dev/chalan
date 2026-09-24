"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TeamMember } from "@/lib/types"

const UNASSIGNED = "__unassigned__"

interface ChangeWarehouseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: TeamMember | null
  warehouses: { id: string; name: string; city: string }[]
  selectedWarehouseId: string
  onWarehouseChange: (warehouseId: string) => void
  onConfirm: () => void
  loading?: boolean
}

export function ChangeWarehouseDialog({
  open,
  onOpenChange,
  user,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  onConfirm,
  loading,
}: ChangeWarehouseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change warehouse</DialogTitle>
          <DialogDescription>
            Assign {user?.name} to a different warehouse.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Select
            value={selectedWarehouseId}
            onValueChange={(v) => onWarehouseChange(v ?? UNASSIGNED)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value) => {
                  if (!value || value === UNASSIGNED) return "Unassigned"
                  const w = warehouses.find((x) => x.id === value)
                  return w ? `${w.name}-${w.city}` : "Unknown"
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}-{w.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
