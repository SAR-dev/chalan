"use client"

import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { isValidEmail } from "@/lib/validation"

interface MailConfigForm {
  label: string
  host: string
  port: string
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName: string
}

interface CreateMailConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: MailConfigForm
  onFormChange: (form: MailConfigForm) => void
  onSubmit: () => void
  onTest: () => void
  /** Recipient for the test send — owned by the page (defaults to the
   * signed-in admin); the config form itself never stores it. */
  testTo: string
  onTestToChange: (value: string) => void
  saving?: boolean
  testing?: boolean
}

export function CreateMailConfigDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  onTest,
  testTo,
  onTestToChange,
  saving,
  testing,
}: CreateMailConfigDialogProps) {
  const recipientValid = isValidEmail(testTo)
  const testDisabled =
    testing ||
    !form.host ||
    !form.user ||
    !form.pass ||
    !form.fromEmail ||
    !recipientValid

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Mail Config</DialogTitle>
          <DialogDescription>
            Add a new SMTP configuration. You can activate it later. Use Send
            test email to verify the credentials above before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Label</Label>
            <Input
              placeholder="e.g. Primary SMTP"
              value={form.label}
              onChange={(e) => onFormChange({ ...form, label: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 flex flex-col gap-2">
              <Label>SMTP Host</Label>
              <Input
                placeholder="smtp.example.com"
                value={form.host}
                onChange={(e) =>
                  onFormChange({ ...form, host: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Port</Label>
              <Input
                placeholder="587"
                value={form.port}
                onChange={(e) =>
                  onFormChange({ ...form, port: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.secure}
              onCheckedChange={(v) => onFormChange({ ...form, secure: v })}
            />
            <Label>Use TLS (port 465)</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Username</Label>
              <Input
                value={form.user}
                onChange={(e) =>
                  onFormChange({ ...form, user: e.target.value })
                }
              />
              <p className="text-muted-foreground text-xs">
                Usually your full email address.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={form.pass}
                onChange={(e) =>
                  onFormChange({ ...form, pass: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>From Email</Label>
              <Input
                type="email"
                placeholder="noreply@example.com"
                value={form.fromEmail}
                onChange={(e) =>
                  onFormChange({ ...form, fromEmail: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>From Name</Label>
              <Input
                value={form.fromName}
                onChange={(e) =>
                  onFormChange({ ...form, fromName: e.target.value })
                }
              />
            </div>
          </div>
        </div>
        {/* Recipient lives outside the config grid on purpose: it is a
            property of the test send, not of the stored config. */}
        <div className="flex flex-col gap-2 p-2 mb-2 border border-dashed rounded">
          <Label htmlFor="mail-config-test-to">Send test to</Label>
          <Input
            id="mail-config-test-to"
            data-testid="mail-config-test-to"
            type="email"
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => onTestToChange(e.target.value)}
            error={
              testTo.length > 0 && !recipientValid
                ? "Enter a valid email address."
                : undefined
            }
          />
          <p className="text-primary text-xs">
            {recipientValid
              ? "The test message is delivered here — it is not stored with the config."
              : "A test email needs a valid recipient address."}
          </p>
        </div>
        <DialogFooter>
          <Button
            data-testid="mail-config-send-test"
            variant="outline"
            onClick={onTest}
            disabled={testDisabled}
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="size-4" />
                Send test email
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="mail-config-create"
            onClick={onSubmit}
            disabled={
              saving ||
              !form.label ||
              !form.host ||
              !form.user ||
              !form.pass ||
              !form.fromEmail
            }
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
