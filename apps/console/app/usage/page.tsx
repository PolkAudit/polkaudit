'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

type UsageSummary = {
  project_id: number
  period: string
  plan_slug: string
  api_calls: number
  export_calls: number
  api_quota_monthly: number
  api_remaining: number | null
  unlimited: boolean
}

export default function UsagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<UsageSummary | null>(null)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        setUsage(await authFetch<UsageSummary>('/api/v1/usage/summary'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load usage')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  return (
    <DashboardLayout>
      <Header title="Usage" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Monthly API and export usage for the selected workspace (landing-aligned quotas).
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : usage ? (
          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Period</p>
                <p className="font-semibold">{usage.period}</p>
              </div>
              <Badge variant="outline" className="capitalize">
                {usage.plan_slug}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-border p-3">
                <p className="text-xs text-muted-foreground uppercase">API calls</p>
                <p className="text-2xl font-bold mt-1">{usage.api_calls.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {usage.unlimited
                    ? 'Unlimited monthly quota'
                    : `Quota ${usage.api_quota_monthly.toLocaleString()} · remaining ${
                        usage.api_remaining?.toLocaleString() ?? 0
                      }`}
                </p>
              </div>
              <div className="rounded border border-border p-3">
                <p className="text-xs text-muted-foreground uppercase">Exports</p>
                <p className="text-2xl font-bold mt-1">{usage.export_calls.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Counted this month</p>
              </div>
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No usage data.</p>
        )}
      </main>
    </DashboardLayout>
  )
}
