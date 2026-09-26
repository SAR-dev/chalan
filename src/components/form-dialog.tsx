"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogContentBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type DialogSize = "sm" | "md" | "lg" | "xl"

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
}

type ButtonVariant = React.ComponentProps<typeof Button>["variant"]

export interface FormDialogProps {
  /** Controlled open state. Omit when relying solely on `trigger`. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Optional trigger element (e.g. a Button) rendered via DialogTrigger. */
  trigger?: React.ReactElement
  title: React.ReactNode
  description?: React.ReactNode
  /** Controls the max width of the dialog. Defaults to "md". */
  size?: DialogSize
  /** Extra classes for the DialogContent popup. */
  className?: string
  /**
   * When provided, the body + footer are wrapped in a <form> and the submit
   * button uses type="submit". When omitted, the dialog runs in "action"
   * mode and the submit button calls `onConfirm`.
   */
  onSubmit?: (e: React.FormEvent) => void
  /** Action handler used in non-form mode (when `onSubmit` is not provided). */
  onConfirm?: () => void
  children: React.ReactNode
  /** Fully replaces the default footer when provided. */
  footer?: React.ReactNode
  // ---- default footer config ----
  submitLabel?: React.ReactNode
  submitIcon?: React.ReactNode
  /** Label shown next to the spinner while submitting. Falls back to submitLabel. */
  submittingLabel?: React.ReactNode
  submitting?: boolean
  submitDisabled?: boolean
  submitVariant?: ButtonVariant
  showCancel?: boolean
  cancelLabel?: React.ReactNode
  /** Custom cancel handler. Defaults to closing the dialog. */
  onCancel?: () => void
  /** Makes the footer buttons full-width on mobile. */
  fullWidthButtons?: boolean
  /** Hide the default footer entirely. */
  hideFooter?: boolean
  /** data-testid for the default submit button (E2E selector policy). */
  submitTestId?: string
}

/**
 * Base dialog used across the app. It standardizes the header, optional form
 * wrapper, and footer (Cancel + a loading-aware submit/confirm button) so every
 * dialog shares the same structure, spacing, and behavior.
 */
export function FormDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  size = "md",
  className,
  onSubmit,
  onConfirm,
  children,
  footer,
  submitLabel,
  submitIcon,
  submittingLabel,
  submitting = false,
  submitDisabled = false,
  submitVariant,
  showCancel = true,
  cancelLabel = "Cancel",
  onCancel,
  fullWidthButtons = false,
  hideFooter = false,
  submitTestId,
}: FormDialogProps) {
  const buttonWidth = fullWidthButtons ? "w-full sm:w-auto" : undefined

  const submitButton = (
    <Button
      type={onSubmit ? "submit" : "button"}
      data-testid={submitTestId}
      onClick={onSubmit ? undefined : onConfirm}
      disabled={submitting || submitDisabled}
      variant={submitVariant}
      className={buttonWidth}
    >
      {submitting ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {submittingLabel ?? submitLabel}
        </>
      ) : (
        <>
          {submitIcon}
          {submitLabel}
        </>
      )}
    </Button>
  )

  const defaultFooter = hideFooter ? null : (
    <DialogFooter>
      {showCancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => (onCancel ? onCancel() : onOpenChange?.(false))}
          className={buttonWidth}
        >
          {cancelLabel}
        </Button>
      ) : null}
      {submitButton}
    </DialogFooter>
  )

  const footerNode = footer ?? defaultFooter

  const header = (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      {description ? (
        <DialogDescription>{description}</DialogDescription>
      ) : null}
    </DialogHeader>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        className={cn(SIZE_CLASS[size], className)}
        data-testid="form-dialog"
      >
        {header}
        {onSubmit ? (
          <form
            onSubmit={onSubmit}
            className="flex flex-1 flex-col gap-4 min-h-0"
          >
            <DialogContentBody className="py-4">{children}</DialogContentBody>
            {footerNode}
          </form>
        ) : (
          <>
            <DialogContentBody className="py-4">{children}</DialogContentBody>
            {footerNode}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
