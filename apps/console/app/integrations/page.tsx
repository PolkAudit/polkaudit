'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

type Plugin = { name: string; slug: string; description: string }

export default function IntegrationsPage() {
  const router = useRouter()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState('')
  const [webhook, setWebhook] = useState('')
  const [message, setMessage] = useState('PolkAudit test dispatch')

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const list = await authFetch<Plugin[]>('/api/v1/integrations/plugins')
        setPlugins(list)
        if (list[0]) setSlug(list[0].slug)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Admin role required for plugins')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  return (
    <DashboardLayout>
      <Header title="Integrations" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Configure notification plugins for the workspace (admin).
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-4 space-y-2">
              <h2 className="font-semibold">Available plugins</h2>
              {plugins.length === 0 && (
                <p className="text-sm text-muted-foreground">No plugins seeded.</p>
              )}
              <ul className="space-y-1 text-sm">
                {plugins.map((p) => (
                  <li key={p.slug} className="border border-border rounded px-3 py-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground"> · {p.slug}</span>
                    <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="bg-card border-border p-4 space-y-3">
              <h2 className="font-semibold">Configure</h2>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              >
                {plugins.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="Webhook URL / config"
              />
              <Button
                onClick={async () => {
                  try {
                    await authFetch('/api/v1/integrations/configure', {
                      method: 'POST',
                      body: JSON.stringify({
                        plugin_slug: slug,
                        config: { webhook_url: webhook },
                      }),
                    })
                    toast.success('Configured')
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed')
                  }
                }}
              >
                Save config
              </Button>
              <div className="flex gap-2">
                <Input value={message} onChange={(e) => setMessage(e.target.value)} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await authFetch(
                        `/api/v1/integrations/test-dispatch?message=${encodeURIComponent(message)}`,
                        { method: 'POST' }
                      )
                      toast.success('Dispatched')
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Dispatch failed')
                    }
                  }}
                >
                  Test
                </Button>
              </div>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
