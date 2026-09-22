"use client"

import { Wallet } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { useMerchantBalance } from "@/features/merchants/hooks/use-merchant-balance"
import { formatTk } from "@/lib/pricing"

const PAYMENT_METHODS = ["bKash", "Nagad", "Rocket", "Bank transfer"]

export function BalancePaymentDialog({
  merchantId,
  balance,
  open,
  onOpenChange,
}: {
  merchantId: string
  balance: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { submitPayment } = useMerchantBalance(merchantId)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("bKash")
  const [account, setAccount] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Reset fields whenever the dialog opens (same pattern as PayoutRequestDialog).
  const [openCount, setOpenCount] = useState(0)
  const prevOpen = useRef(open)
  useEffect(() => {
    if (open && !prevOpen.current) setOpenCount((c) => c + 1)
    prevOpen.current = open
  }, [open])

  const accountLabel =
    method === "Bank transfer" ? "Bank account details" : `${method} number`

  async function handleSubmit() {
    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0) {
      toast.error("Enter a valid payment amount.")
      return
    }
    if (parsed > balance) {
      toast.error(
        `Amount cannot exceed your outstanding balance of ${formatTk(balance)}.`,
      )
      return
    }
    if (!account.trim()) {
      toast.error("Enter your payment account details.")
      return
    }
    setSubmitting(true)
    try {
      const result = await submitPayment({
        amount: parsed,
        paymentMethod: method,
        paymentAccount: account.trim(),
        note: note.trim() || undefined,
      })
      if (result.ok) {
        toast.success("Payment submitted — an admin will confirm it shortly.")
        onOpenChange(false)
      } else {
        toast.error(result.error ?? "Unable to submit payment.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      key={openCount}
      open={open}
      onOpenChange={onOpenChange}
      title="Submit payment"
      description={`Outstanding balance: ${formatTk(balance)}. Send the amount to one of the platform payment channels, then fill in the details below.`}
      onConfirm={handleSubmit}
      submitting={submitting}
      submittingLabel="Submitting"
      submitLabel="Submit payment"
      submitIcon={<Wallet className="size-4" />}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-amount">Amount paid</Label>
          <Input
            id="pay-amount"
            type="number"
            min={1}
            max={balance}
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Maximum: {formatTk(balance)}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-method">Payment method</Label>
          <Select
            value={method}
            onValueChange={(value) => setMethod(value ?? "bKash")}
          >
            <SelectTrigger id="pay-method">
              <SelectValue placeholder="Select method" />
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
          <Label htmlFor="pay-account">{accountLabel}</Label>
          <Input
            id="pay-account"
            placeholder={
              method === "Bank transfer"
                ? "Bank · A/C number"
                : "+8801XXXXXXXXX"
            }
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pay-note">
            Note{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="pay-note"
            placeholder="Transaction ID, reference, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  )
}
