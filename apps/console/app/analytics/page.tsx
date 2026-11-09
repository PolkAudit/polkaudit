'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

type Metric = { date: string; value: number }
type Forecast = {
  forecast_date: string
  predicted_value: number
  confidence_lower: number
  confidence_upper: number
}
type Score = {
  transparency_score: number
  participation_score: number
  treasury_score: number
  overall_score: number
}

const METRICS = ['overall', 'transparency', 'participation', 'treasury'] as const

export default function AnalyticsPage() {
  const router = useRouter()
  const [metric, setMetric] = useState<(typeof METRICS)[number]>('overall')
  const [trends, setTrends] = useState<Metric[]>([])
  const [forecast, setForecast] = useState<Forecast[]>([])
  const [score, setScore] = useState<Score | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async (m: string) => {
    const [t, f, s] = await Promise.all([
      authFetch<Metric[]>(`/api/v1/analytics/trends?metric_type=${m}`).catch(() => []),
      authFetch<Forecast[]>(`/api/v1/analytics/forecast?metric_type=${m}`).catch(() => []),
      authFetch<Score>('/api/v1/scores/latest').catch(() => null),
    ])
    setTrends(t)
    setForecast(f)
    setScore(s)
  }

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        await load(metric)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    })()
  }, [router, metric])

  const generate = async () => {
    setBusy(true)
    try {
      await authFetch('/api/v1/analytics/generate', { method: 'POST', body: '{}' })
      await authFetch('/api/v1/scores/calculate', { method: 'POST', body: '{}' }).catch(() => null)
      await load(metric)
      toast.success('Analytics generated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generate failed (admin required)')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Analytics" showSearch={false} />
      <main className="p-6 max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Governance analytics and scores for the selected workspace (Pro-tier surface).
          </p>
          <Button onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate / refresh'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={metric === m ? 'default' : 'outline'}
              onClick={() => setMetric(m)}
              className="capitalize"
            >
              {m}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            {score && (
              <div className="grid gap-3 sm:grid-cols-4">
                {(
                  [
                    ['Overall', score.overall_score],
                    ['Transparency', score.transparency_score],
                    ['Participation', score.participation_score],
                    ['Treasury', score.treasury_score],
                  ] as const
                ).map(([label, val]) => (
                  <Card key={label} className="bg-card border-border p-4">
                    <p className="text-xs text-muted-foreground uppercase">{label}</p>
                    <p className="text-2xl font-bold mt-1">{Number(val).toFixed(1)}</p>
                  </Card>
                ))}
              </div>
            )}

            <Card className="bg-card border-border p-4 space-y-2">
              <h2 className="font-semibold">Trends ({metric})</h2>
              {trends.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trend rows — generate first.</p>
              ) : (
                <ul className="space-y-1 text-sm max-h-64 overflow-auto">
                  {trends.map((t, i) => (
                    <li key={`${t.date}-${i}`} className="flex justify-between border-b border-border/50 py-1">
                      <span>{t.date}</span>
                      <span className="font-mono">{t.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="bg-card border-border p-4 space-y-2">
              <h2 className="font-semibold">Forecast ({metric})</h2>
              {forecast.length === 0 ? (
                <p className="text-sm text-muted-foreground">No forecast rows yet.</p>
              ) : (
                <ul className="space-y-1 text-sm max-h-64 overflow-auto">
                  {forecast.map((f, i) => (
                    <li key={`${f.forecast_date}-${i}`} className="flex justify-between border-b border-border/50 py-1">
                      <span>{f.forecast_date}</span>
                      <span className="font-mono">{f.predicted_value}</span>
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
