"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useMerchantBalance } from "@/features/merchants/hooks/use-merchant-balance"

const PAYMENT_METHODS = ["bKash", "Nagad", "Rocket", "Bank transfer"] as const

interface Props {
  merchantId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Merchant requests a manual top-up: they transfer the money themselves and an
 * admin confirms it. Reuses `POST /api/merchants/[id]/balance/payment`, which
 * allows only one PENDING top-up per merchant at a time.
 */
export function RequestTopUpDialog({ merchantId, open, onOpenChange }: Props) {
  const { submitPayment } = useMerchantBalance(merchantId)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0])
  const [account, setAccount] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount("")
    setMethod(PAYMENT_METHODS[0])
    setAccount("")
    setNote("")
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await submitPayment({
        amount: Number(amount) || 0,
        paymentMethod: method,
        paymentAccount: account.trim(),
        note: note.trim() || undefined,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Could not submit the top-up.")
        return
      }
      toast.success("Top-up submitted. An admin will confirm your transfer.")
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request a top-up"
      description="Transfer the amount to the platform account, then submit the details here. An admin confirms the payment and it is added to your credit."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Submit top-up"
      submitTestId="top-up-submit"
      submitDisabled={!amount || Number(amount) <= 0 || !account.trim()}
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="top-up-amount">Amount (TK)</Label>
          <Input
            id="top-up-amount"
            data-testid="top-up-amount-input"
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="top-up-method">Payment method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v ?? "")}>
            <SelectTrigger
              id="top-up-method"
              className="w-full"
              data-testid="top-up-method-select"
            >
              <SelectValue placeholder="Select a method">{method}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="top-up-account">Account / reference</Label>
          <Input
            id="top-up-account"
            data-testid="top-up-account-input"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="e.g. 01700000000 or the transfer reference"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="top-up-note">Note (optional)</Label>
          <Textarea
            id="top-up-note"
            data-testid="top-up-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the admin should know"
            className="min-h-20"
          />
        </div>
      </div>
    </FormDialog>
  )
}
