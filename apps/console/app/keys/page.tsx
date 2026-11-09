'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  getAuthToken,
  type ManagedKey,
} from '@/lib/api'

export default function KeysPage() {
  const router = useRouter()
  const [managedKeys, setManagedKeys] = useState<ManagedKey[]>([])
  const [newKeyName, setNewKeyName] = useState('default')
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const keys = await authFetch<ManagedKey[]>('/api/v1/keys/')
        setManagedKeys(keys.filter((k) => !k.revoked_at))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load keys')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleCreateKey = async () => {
    try {
      const created = await authFetch<{ raw_key: string } & ManagedKey>('/api/v1/keys/', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName || 'default' }),
      })
      setCreatedRawKey(created.raw_key)
      setManagedKeys((prev) => [
        {
          id: created.id,
          name: created.name,
          key_prefix: created.key_prefix,
          revoked_at: null,
        },
        ...prev,
      ])
      toast.success('API key created — copy it now')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create key')
    }
  }

  const handleRevokeKey = async (id: number) => {
    try {
      await authFetch(`/api/v1/keys/${id}/revoke`, { method: 'POST' })
      setManagedKeys((prev) => prev.filter((k) => k.id !== id))
      toast.success('Key revoked')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  return (
    <DashboardLayout>
      <Header title="API keys" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Project keys for the governance dashboard (`X-API-KEY`). Copy new keys immediately —
          the full secret is shown once.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name"
                className="sm:max-w-xs"
              />
              <Button onClick={handleCreateKey}>Create key</Button>
            </div>
            {createdRawKey && (
              <Alert className="border border-accent/40 bg-accent/5">
                <AlertDescription className="text-xs font-mono break-all">
                  {createdRawKey}
                  <button
                    className="ml-2 inline-flex"
                    onClick={() => copyToClipboard(createdRawKey)}
                    type="button"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </AlertDescription>
              </Alert>
            )}
            <ul className="space-y-2">
              {managedKeys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between text-sm border border-border rounded px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{k.name}</span>{' '}
                    <span className="font-mono text-muted-foreground text-xs">
                      {k.key_prefix}…
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeKey(k.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
              {managedKeys.length === 0 && (
                <li className="text-xs text-muted-foreground">No active keys yet.</li>
              )}
            </ul>
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
