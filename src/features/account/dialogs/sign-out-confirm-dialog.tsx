"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useAuth } from "@/features/account/hooks/use-auth"

interface SignOutConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The confirmation step between clicking Sign out and the session actually
 * ending.
 *
 * One shared instance rather than one per navigation surface: it is mounted
 * by the TopNav's RightNav panel (the single home of Sign out at every
 * breakpoint), and AGENTS.md puts every modal in its own file. Each caller
 * owns only its `open` state — the loading state and the sign-out call live
 * here so two surfaces cannot drift apart (one confirming silently, say,
 * while the other asks).
 *
 * It must be mounted OUTSIDE the RightNav `<Sheet>`: closing the sheet
 * unmounts its children, and the confirmation has to outlive the panel it
 * was opened from.
 *
 * Cancel closes the dialog without calling `logout()` at all, which is what
 * keeps "abort" a genuinely side-effect-free path rather than a sign-out that
 * gets interrupted.
 */
export function SignOutConfirmDialog({
  open,
  onOpenChange,
}: SignOutConfirmDialogProps) {
  const { logout } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      // `logout()` signs out, drops every cached resource, and only then
      // redirects — so awaiting it is what makes the spinner cover the whole
      // operation instead of disappearing at the first await inside.
      await logout()
      onOpenChange(false)
    } catch {
      // Deliberately leaves the dialog open. Closing it on failure would strand
      // the user on the page with no explanation and no obvious way to retry —
      // and swallowing the rejection here is what keeps it from surfacing as
      // an unhandled promise, since `onClick` cannot await this handler.
      toast.error("Couldn't sign out. Please try again.")
    } finally {
      // Re-enables both buttons. On success the shell has usually already
      // replaced itself with its own loader, so this is then a no-op.
      setLoading(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      loading={loading}
      title="Sign out?"
      description="You'll need to sign in again to access your account."
      confirmLabel="Sign out"
      onConfirm={handleConfirm}
    />
  )
}
