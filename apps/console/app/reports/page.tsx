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
import { authFetch, getApiBase, getAuthToken } from '@/lib/api'

type Report = {
  id: number
  title: string
  type: string
  period_start: string
  period_end: string
  generated_at: string
  risk_score: number
}

export default function ReportsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('Governance report')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setRows(await authFetch<Report[]>('/api/v1/reports/'))
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
        toast.error(e instanceof Error ? e.message : 'Failed to load reports')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const generate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const end = new Date()
      const start = new Date()
      start.setDate(end.getDate() - 30)
      await authFetch('/api/v1/reports/', {
        method: 'POST',
        body: JSON.stringify({
          title,
          type: 'adhoc',
          period_start: start.toISOString(),
          period_end: end.toISOString(),
        }),
      })
      toast.success('Report generated')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  const apiBase = getApiBase().replace('/api/v1', '')

  return (
    <DashboardLayout>
      <Header title="Reports" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Generate audit-style PDF reports for the selected period.
        </p>
        <Card className="bg-card border-border p-6">
          <form onSubmit={generate} className="flex flex-col sm:flex-row gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={busy}>
              {busy ? 'Generating…' : 'Generate (30d)'}
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
              <p className="text-sm text-muted-foreground">No reports yet.</p>
            )}
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border rounded px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.type} · risk {r.risk_score} · {new Date(r.generated_at).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <a href={`${apiBase}/api/v1/reports/${r.id}/download`} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </Button>
              </div>
            ))}
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
