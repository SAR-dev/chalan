"use client"

import {
  Loader2,
  MailPlus,
  Pencil,
  RotateCcw,
  ShieldCheck,
  UserMinus,
  Users,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CreateModeratorDialog } from "@/features/merchants/dialogs/create-moderator-dialog"
import { EditModeratorDialog } from "@/features/merchants/dialogs/edit-moderator-dialog"
import {
  type ModeratorAccount,
  useMerchantModerators,
} from "@/features/merchants/hooks/use-merchant-moderators"
import { merchantGrantableNavItems } from "@/lib/nav-config"
import { cn } from "@/lib/utils"

const LABEL_BY_HREF = new Map(
  merchantGrantableNavItems().map((i) => [i.href, i.label]),
)

const STATUS_BADGE: Record<ModeratorAccount["status"], string> = {
  PENDING:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ACTIVE:
    "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
  DEACTIVATED: "bg-muted text-muted-foreground border-transparent",
}

function accessLabel(permissions: string[]): string {
  if (permissions.length === 0) return "No access"
  return permissions.map((href) => LABEL_BY_HREF.get(href) ?? href).join(", ")
}

export function ModeratorsCard({ merchantId }: { merchantId: string }) {
  const {
    moderators,
    quota,
    isLoading,
    mutate,
    updateModerator,
    resendActivation,
  } = useMerchantModerators(merchantId)

  const [editTarget, setEditTarget] = useState<ModeratorAccount | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ModeratorAccount | null>(
    null,
  )
  const [busyId, setBusyId] = useState<string | null>(null)

  const quotaFull = Boolean(quota && quota.used >= quota.max)

  async function handleResend(moderator: ModeratorAccount) {
    setBusyId(moderator.userId)
    const result = await resendActivation(moderator.userId)
    setBusyId(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Activation email resent to ${moderator.email}.`)
  }

  async function handleSetActive(
    moderator: ModeratorAccount,
    isActive: boolean,
  ) {
    setBusyId(moderator.userId)
    const result = await updateModerator(moderator.userId, { isActive })
    setBusyId(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(
      isActive
        ? `${moderator.name} is active again.`
        : `${moderator.name} deactivated. Their slot is free.`,
    )
    await mutate()
  }

  return (
    <>
      <Card data-testid="moderators-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Moderators
          </CardTitle>
          <CardDescription>
            Staff logins with the sidebar access you choose. They set their own
            password through an emailed activation link.
            {quota ? ` ${quota.used}/${quota.max} slots used.` : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading moderators
            </div>
          ) : moderators.length === 0 ? (
            <div
              className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm"
              data-testid="moderators-empty"
            >
              No moderators yet — invite your staff to help manage orders.
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {moderators.map((moderator) => (
                <li
                  key={moderator.userId}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="moderator-row"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {moderator.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px]",
                          STATUS_BADGE[moderator.status],
                        )}
                        data-testid="moderator-status"
                      >
                        {moderator.status === "DEACTIVATED"
                          ? "Deactivated"
                          : moderator.status.charAt(0) +
                            moderator.status.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {moderator.email}
                    </p>
                    <p
                      className="text-muted-foreground mt-0.5 truncate text-xs"
                      title={accessLabel(moderator.permissions)}
                    >
                      Access: {accessLabel(moderator.permissions)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setEditTarget(moderator)}
                      data-testid="edit-moderator"
                    >
                      <Pencil className="size-3" />
                      Access
                    </Button>

                    {moderator.status === "PENDING" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleResend(moderator)}
                        disabled={busyId === moderator.userId}
                        data-testid="resend-activation"
                      >
                        {busyId === moderator.userId ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <MailPlus className="size-3" />
                        )}
                        Resend
                      </Button>
                    ) : moderator.status === "ACTIVE" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => setConfirmTarget(moderator)}
                        data-testid="deactivate-moderator"
                      >
                        <UserMinus className="size-3" />
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleSetActive(moderator, true)}
                        disabled={busyId === moderator.userId}
                        data-testid="reactivate-moderator"
                      >
                        <RotateCcw className="size-3" />
                        Restore
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-border mt-1 flex items-center justify-between border-t pt-3">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <ShieldCheck className="size-3.5" />
              Business Settings stays owner-only.
            </p>
            <CreateModeratorDialog
              merchantId={merchantId}
              disabled={quotaFull}
              disabledReason={
                quota
                  ? `Limit reached (${quota.used}/${quota.max}).`
                  : undefined
              }
            />
          </div>
          {quotaFull ? (
            <p
              role="status"
              className="text-amber-600 dark:text-amber-400 text-xs"
              data-testid="quota-full"
            >
              Moderator limit reached ({quota?.used}/{quota?.max}). Deactivate
              someone to free a slot.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <EditModeratorDialog
        merchantId={merchantId}
        moderator={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null)
        }}
        title="Deactivate moderator?"
        description={`${
          confirmTarget?.name ?? "This moderator"
        } will be signed out and their quota slot freed. You can restore them later.`}
        confirmLabel="Deactivate"
        variant="destructive"
        loading={confirmTarget !== null && busyId === confirmTarget.userId}
        onConfirm={async () => {
          const target = confirmTarget
          if (!target) return
          setConfirmTarget(null)
          await handleSetActive(target, false)
        }}
      />
    </>
  )
}
