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
import {
  authFetch,
  fetchCurrentUser,
  formatBillingInterval,
  formatUsdCents,
  getAuthToken,
  type BillingPlan,
} from '@/lib/api'

const ADMIN_PLANS = ['free', 'pilot', 'starter', 'pro', 'enterprise'] as const

export default function AdminBillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [projectId, setProjectId] = useState('1')
  const [planSlug, setPlanSlug] = useState<(typeof ADMIN_PLANS)[number]>('starter')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const me = await fetchCurrentUser()
        if (me.role !== 'admin') {
          toast.error('Admin access required')
          router.replace('/')
          return
        }
        const list = await authFetch<BillingPlan[]>('/api/v1/billing/plans')
        setPlans(list)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault()
    const pid = Number(projectId)
    if (!Number.isFinite(pid) || pid <= 0) {
      toast.error('Enter a valid project id')
      return
    }
    setSaving(true)
    try {
      await authFetch('/api/v1/billing/subscription', {
        method: 'POST',
        body: JSON.stringify({
          project_id: pid,
          plan_slug: planSlug,
          status: 'active',
          billing_note: note || `admin override → ${planSlug}`,
        }),
      })
      toast.success(`Project ${pid} set to ${planSlug}`)
      setNote('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not set subscription')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Platform billing" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Manually assign a tenant subscription (USD list prices). Use this for Wise/DOT
          pilots or when Razorpay is not used.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Set tenant plan
              </h2>
              <form onSubmit={handleSet} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    Project ID
                  </label>
                  <Input
                    required
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    Plan
                  </label>
                  <select
                    className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                    value={planSlug}
                    onChange={(e) =>
                      setPlanSlug(e.target.value as (typeof ADMIN_PLANS)[number])
                    }
                  >
                    {ADMIN_PLANS.map((s) => {
                      const p = plans.find((x) => x.slug === s)
                      const price =
                        (p?.price_usd_cents || 0) > 0
                          ? `${formatUsdCents(p?.price_usd_cents)} ${formatBillingInterval(p?.billing_interval)}`
                          : s === 'enterprise'
                            ? 'custom'
                            : '$0'
                      return (
                        <option key={s} value={s}>
                          {p?.name || s} — {price}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    Billing note (optional)
                  </label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Wise invoice #42"
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Apply subscription'}
                </Button>
              </form>
            </Card>

            <Card className="bg-card border-border p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">USD list prices</h2>
              <ul className="space-y-2 text-sm">
                {plans
                  .slice()
                  .sort((a, b) => a.slug.localeCompare(b.slug))
                  .map((p) => (
                    <li
                      key={p.slug}
                      className="flex items-center justify-between border border-border rounded px-3 py-2"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {(p.price_usd_cents || 0) > 0
                          ? `${formatUsdCents(p.price_usd_cents)} ${formatBillingInterval(p.billing_interval)}`
                          : p.slug === 'enterprise'
                            ? 'Quote only'
                            : '$0'}
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
