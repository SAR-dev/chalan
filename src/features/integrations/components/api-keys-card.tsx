"use client"

import { Copy, KeyRound, Loader2, Trash2, Webhook } from "lucide-react"
import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  useApiKeys,
  useWebhookEndpoints,
} from "@/features/integrations/hooks/use-api-keys"
import { API_KEY_SCOPES, type ApiKeyScope } from "@/lib/api-key-scopes"
import { formatDateTime } from "@/lib/format"
import { toast } from "@/lib/notify"

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <Badge variant="outline" className="text-xs">
      {scope}
    </Badge>
  )
}

export function ApiKeysCard() {
  const { keys, isLoading, createKey, revokeKey } = useApiKeys()
  const {
    endpoints,
    isLoading: hooksLoading,
    createEndpoint,
    deleteEndpoint,
    revealedSecret,
    dismissSecret,
  } = useWebhookEndpoints()

  const [label, setLabel] = useState("")
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["orders:write"])
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState<{
    plaintext: string
    label: string
  } | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [hookUrl, setHookUrl] = useState("")
  const [hookEvents, setHookEvents] = useState<string[]>([])
  const [hookCreating, setHookCreating] = useState(false)

  async function handleCreateKey() {
    if (!label.trim()) {
      toast.error("Give the key a label")
      return
    }
    setCreating(true)
    const res = await createKey(label.trim(), scopes)
    setCreating(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not create key")
      return
    }
    setRevealedKey({ plaintext: res.plaintext!, label: label.trim() })
    setLabel("")
    toast.success("API key created — copy it now, it will not be shown again")
  }

  async function handleCreateHook() {
    if (!hookUrl.trim()) {
      toast.error("Enter a webhook URL")
      return
    }
    setHookCreating(true)
    const res = await createEndpoint(hookUrl.trim(), hookEvents)
    setHookCreating(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not register endpoint")
      return
    }
    setHookUrl("")
    setHookEvents([])
    toast.success("Webhook endpoint registered")
  }

  if (isLoading && hooksLoading) return null

  return (
    <div className="flex flex-col gap-6">
      {/* API Keys */}
      <Card data-testid="api-keys-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            API keys
          </CardTitle>
          <CardDescription>
            Keys grant programmatic access to <code>/api/v1/orders</code>. The
            secret is shown once — store it securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {revealedKey && (
            <div
              data-testid="revealed-key"
              className="bg-muted flex flex-col gap-2 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">
                Copy now — this key for &quot;{revealedKey.label}&quot; will not
                be shown again
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-background flex-1 truncate rounded border p-2 text-xs">
                  {revealedKey.plaintext}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey.plaintext)
                    toast.success("Copied")
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRevealedKey(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <Label htmlFor="api-key-label">New key label</Label>
            <Input
              id="api-key-label"
              data-testid="api-key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Production"
              maxLength={80}
            />
            <div className="flex flex-wrap gap-2">
              {API_KEY_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={(e) =>
                      setScopes((prev) =>
                        e.target.checked
                          ? [...prev, s]
                          : prev.filter((x) => x !== s),
                      )
                    }
                    data-testid={`scope-${s}`}
                  />
                  {s}
                </label>
              ))}
            </div>
            <Button
              onClick={handleCreateKey}
              disabled={creating || !label.trim()}
              data-testid="create-api-key"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              Create key
            </Button>
          </div>

          {keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No API keys yet</p>
          ) : (
            keys.map((k) => (
              <div
                key={k.id}
                data-testid={`api-key-${k.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {k.label}{" "}
                    <code className="text-muted-foreground text-xs">
                      {k.prefix}…
                    </code>
                    {k.revokedAt && (
                      <Badge variant="destructive" className="ml-2">
                        Revoked
                      </Badge>
                    )}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <ScopeBadge key={s} scope={s} />
                    ))}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    Created {formatDateTime(k.createdAt)}
                    {k.lastUsedAt
                      ? ` · Last used ${formatDateTime(k.lastUsedAt)}`
                      : ""}
                  </span>
                </div>
                {!k.revokedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`revoke-${k.id}`}
                    onClick={() => setRevokeId(k.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card data-testid="webhooks-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="size-4" />
            Webhooks
          </CardTitle>
          <CardDescription>
            Receive order events at your URL. Each delivery is signed with
            <code> x-chalan-signature</code> so you can verify it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {revealedSecret && (
            <div
              data-testid="revealed-webhook-secret"
              className="bg-muted flex flex-col gap-2 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">
                Webhook secret for {revealedSecret.url} — copy now
              </p>
              <code className="bg-background truncate rounded border p-2 text-xs">
                {revealedSecret.secret}
              </code>
              <Button size="sm" variant="ghost" onClick={dismissSecret}>
                Dismiss
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <Label htmlFor="webhook-url">Endpoint URL (https)</Label>
            <Input
              id="webhook-url"
              data-testid="webhook-url"
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              placeholder="https://example.com/hooks/chalan"
            />
            <Label>Events (empty = all)</Label>
            <div className="flex flex-wrap gap-2">
              {[
                "order.created",
                "order.approved",
                "order.dispatched",
                "order.delivered",
                "order.failed",
                "order.cancelled",
              ].map((e) => (
                <label key={e} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={hookEvents.includes(e)}
                    onChange={(ev) =>
                      setHookEvents((prev) =>
                        ev.target.checked
                          ? [...prev, e]
                          : prev.filter((x) => x !== e),
                      )
                    }
                    data-testid={`hook-event-${e}`}
                  />
                  {e}
                </label>
              ))}
            </div>
            <Button
              onClick={handleCreateHook}
              disabled={hookCreating || !hookUrl.trim()}
              data-testid="create-webhook"
            >
              {hookCreating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Add endpoint
            </Button>
          </div>

          {endpoints.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No webhook endpoints yet
            </p>
          ) : (
            endpoints.map((ep) => (
              <div
                key={ep.id}
                data-testid={`webhook-${ep.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="break-all text-sm font-medium">
                    {ep.url}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ep.events.length === 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        all events
                      </Badge>
                    ) : (
                      ep.events.map((e) => <ScopeBadge key={e} scope={e} />)
                    )}
                    {!ep.isActive && (
                      <Badge variant="destructive">Disabled</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {ep.failureCount > 0
                      ? `${ep.failureCount} failures · `
                      : ""}
                    Created {formatDateTime(ep.createdAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid={`delete-webhook-${ep.id}`}
                  onClick={async () => {
                    const res = await deleteEndpoint(ep.id)
                    if (!res.ok) toast.error(res.error ?? "Could not remove")
                    else toast.success("Endpoint removed")
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(o) => !o && setRevokeId(null)}
        title="Revoke this API key?"
        description="This cannot be undone. The key will stop working immediately."
        confirmLabel="Revoke"
        variant="destructive"
        onConfirm={async () => {
          if (!revokeId) return
          const res = await revokeKey(revokeId)
          setRevokeId(null)
          if (!res.ok) toast.error(res.error ?? "Could not revoke")
          else toast.success("Key revoked")
        }}
      />
    </div>
  )
}
