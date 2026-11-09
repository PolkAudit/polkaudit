'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb } from '@/components/breadcrumb'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'
import { Bell, Loader2 } from 'lucide-react'

type Channel = {
  id: number
  name: string
  type: string
  config: Record<string, unknown>
  is_active?: boolean
}

type Rule = {
  id: number
  name: string
  rule_type: string
  condition: Record<string, unknown>
  channel_id: number
  is_active?: boolean
}

type HistoryRow = {
  id: number
  rule_id: number
  status: string
  error_message?: string | null
  created_at?: string
}

export default function AlertsPage() {
  const [signedIn, setSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [channels, setChannels] = useState<Channel[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [channelName, setChannelName] = useState('Ops email')
  const [channelEmail, setChannelEmail] = useState('')
  const [ruleName, setRuleName] = useState('Large treasury spend')
  const [threshold, setThreshold] = useState('1000000000000')
  const [channelId, setChannelId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  const projectHeaders = (): HeadersInit => {
    const pid =
      typeof window !== 'undefined' ? localStorage.getItem('polkaudit_project_id') : null
    return pid ? { 'X-Project-ID': pid } : {}
  }

  const refresh = async () => {
    const [ch, ru, hi] = await Promise.all([
      authFetch<Channel[]>('/api/v1/alerts/channels', { headers: projectHeaders() }),
      authFetch<Rule[]>('/api/v1/alerts/rules', { headers: projectHeaders() }),
      authFetch<HistoryRow[]>('/api/v1/alerts/history', { headers: projectHeaders() }),
    ])
    setChannels(ch)
    setRules(ru)
    setHistory(hi)
    if (ch.length && channelId === '') setChannelId(ch[0].id)
  }

  useEffect(() => {
    const token = getAuthToken()
    setSignedIn(!!token)
    if (!token) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        await refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load alerts')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const createChannel = async () => {
    if (!channelEmail.trim()) {
      toast.error('Email is required')
      return
    }
    setBusy(true)
    try {
      await authFetch('/api/v1/alerts/channels', {
        method: 'POST',
        headers: projectHeaders(),
        body: JSON.stringify({
          name: channelName || 'email',
          type: 'email',
          config: { email: channelEmail.trim() },
        }),
      })
      toast.success('Channel created')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create channel failed')
    } finally {
      setBusy(false)
    }
  }

  const createRule = async () => {
    if (!channelId) {
      toast.error('Select a channel')
      return
    }
    setBusy(true)
    try {
      await authFetch('/api/v1/alerts/rules', {
        method: 'POST',
        headers: projectHeaders(),
        body: JSON.stringify({
          name: ruleName || 'treasury_threshold',
          rule_type: 'treasury_threshold',
          condition: { threshold: threshold || '0' },
          channel_id: Number(channelId),
        }),
      })
      toast.success('Rule created')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create rule failed')
    } finally {
      setBusy(false)
    }
  }

  const trigger = async () => {
    setBusy(true)
    try {
      await authFetch('/api/v1/alerts/trigger', {
        method: 'POST',
        headers: projectHeaders(),
      })
      toast.success('Alert check triggered')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Trigger failed')
    } finally {
      setBusy(false)
    }
  }

  if (!signedIn) {
    return (
      <DashboardLayout>
        <Header title="Alerts" showSearch={false} />
        <main className="p-6">
          <Card className="bg-card border-border p-8 max-w-lg space-y-4">
            <Bell className="h-8 w-8 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Sign in to manage alerts</h2>
            <p className="text-sm text-muted-foreground">
              Create email channels and treasury-threshold rules for your project.
            </p>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </Card>
        </main>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <Header title="Alerts" showSearch={false} />
      <main className="p-6 space-y-6 max-w-4xl">
        <Breadcrumb items={[{ label: 'Alerts' }]} />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Notify your team when treasury spends cross a threshold.
              </p>
              <Button variant="outline" size="sm" onClick={trigger} disabled={busy}>
                Run check now
              </Button>
            </div>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-card border-border p-6 space-y-4">
                <h2 className="text-base font-semibold text-foreground">New email channel</h2>
                <Input
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="Channel name"
                />
                <Input
                  type="email"
                  value={channelEmail}
                  onChange={(e) => setChannelEmail(e.target.value)}
                  placeholder="ops@yourorg.com"
                />
                <Button onClick={createChannel} disabled={busy}>
                  Add channel
                </Button>
                <ul className="space-y-2 pt-2 border-t border-border">
                  {channels.map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span>
                        {c.name}{' '}
                        <span className="text-muted-foreground font-mono text-xs">
                          {(c.config as any)?.email || c.type}
                        </span>
                      </span>
                      <Badge variant="outline">{c.type}</Badge>
                    </li>
                  ))}
                  {channels.length === 0 && (
                    <li className="text-xs text-muted-foreground">No channels yet</li>
                  )}
                </ul>
              </Card>

              <Card className="bg-card border-border p-6 space-y-4">
                <h2 className="text-base font-semibold text-foreground">Treasury threshold rule</h2>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Rule name"
                />
                <Input
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="Threshold (planck string)"
                />
                <select
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Select channel</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button onClick={createRule} disabled={busy || !channels.length}>
                  Add rule
                </Button>
                <ul className="space-y-2 pt-2 border-t border-border">
                  {rules.map((r) => (
                    <li key={r.id} className="text-sm flex justify-between gap-2">
                      <span>
                        {r.name}{' '}
                        <span className="text-xs text-muted-foreground">{r.rule_type}</span>
                      </span>
                      <Badge variant="outline">ch #{r.channel_id}</Badge>
                    </li>
                  ))}
                  {rules.length === 0 && (
                    <li className="text-xs text-muted-foreground">No rules yet</li>
                  )}
                </ul>
              </Card>
            </section>

            <Card className="bg-card border-border p-6 space-y-3">
              <h2 className="text-base font-semibold text-foreground">Recent history</h2>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No alerts fired yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="text-sm flex items-center justify-between border-b border-border pb-2"
                    >
                      <span>
                        Rule #{h.rule_id}{' '}
                        <span className="text-xs text-muted-foreground">{h.created_at || ''}</span>
                      </span>
                      <Badge variant="outline">{h.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
