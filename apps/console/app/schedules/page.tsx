'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

type Schedule = {
  id: number
  name: string
  export_type: string
  cadence: string
  is_active: boolean
  notify_email?: string | null
  last_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
}

export default function SchedulesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('weekly-exports')
  const [exportType, setExportType] = useState('proposals')
  const [cadence, setCadence] = useState('weekly')
  const [notifyEmail, setNotifyEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setRows(await authFetch<Schedule[]>('/api/v1/schedules/'))
  }

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        await load()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load schedules')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await authFetch('/api/v1/schedules/', {
        method: 'POST',
        body: JSON.stringify({
          name,
          export_type: exportType,
          cadence,
          notify_email: notifyEmail.trim() || null,
        }),
      })
      toast.success('Schedule created')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Scheduled exports" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Recurring CSV exports emailed when due. Run now for a one-off; the backend worker /
          cron picks up due jobs automatically when enabled.
        </p>

        <Card className="bg-card border-border p-6">
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
              <Input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="Notify email (optional)"
              />
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={exportType}
                onChange={(e) => setExportType(e.target.value)}
              >
                <option value="proposals">proposals</option>
                <option value="treasury">treasury</option>
                <option value="both">both</option>
              </select>
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
              >
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Add schedule'}
            </Button>
          </form>
        </Card>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Card className="bg-card border-border p-4 space-y-2">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">No schedules yet.</p>
            )}
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border rounded px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.export_type} · {r.cadence}
                    {r.notify_email ? ` · ${r.notify_email}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last:{' '}
                    {r.last_run_at
                      ? `${new Date(r.last_run_at).toLocaleString()} (${r.last_status || '—'})`
                      : 'never'}
                    {r.last_error ? ` · ${r.last_error}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.is_active ? 'default' : 'secondary'}>
                    {r.is_active ? 'Active' : 'Paused'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await authFetch(`/api/v1/schedules/${r.id}/run`, {
                          method: 'POST',
                          body: '{}',
                        })
                        toast.success('Export ran')
                        await load()
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Run failed')
                      }
                    }}
                  >
                    Run now
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await authFetch(`/api/v1/schedules/${r.id}/toggle`, {
                        method: 'POST',
                        body: '{}',
                      })
                      await load()
                    }}
                  >
                    Toggle
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await authFetch(`/api/v1/schedules/${r.id}`, { method: 'DELETE' })
                      await load()
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
