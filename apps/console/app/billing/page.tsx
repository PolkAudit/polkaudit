'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  getAuthToken,
  startCheckout,
  type BillingPlan,
  type SubscriptionInfo,
} from '@/lib/api'

export default function BillingPage() {
  const router = useRouter()
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [checkoutBusy, setCheckoutBusy] = useState<'pilot' | 'pro' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const [subscription, planList] = await Promise.all([
          authFetch<SubscriptionInfo>('/api/v1/billing/subscription').catch(() => ({
            plan: { slug: 'free', name: 'Free' },
          })),
          authFetch<BillingPlan[]>('/api/v1/billing/plans').catch(() => []),
        ])
        setSub(subscription)
        setPlans(planList)
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const planSlug = sub?.plan?.slug || 'free'
  const planName = sub?.plan?.name || planSlug || 'Free'

  const handleUpgrade = async (plan: 'pilot' | 'pro') => {
    setCheckoutBusy(plan)
    try {
      const result = await startCheckout(plan)
      if (result.mode === 'razorpay' && result.checkout_url) {
        window.location.href = result.checkout_url
        return
      }
      toast.message('Manual upgrade', {
        description: `Contact ${result.contact || 'hello@polkaudit.xyz'} to activate ${plan}.`,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setCheckoutBusy(null)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Billing" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          View your plan and upgrade via Razorpay when payment links are configured.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Current plan
                  </p>
                  <p className="text-lg font-semibold text-foreground mt-1">{planName}</p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {sub?.status || 'active'}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  disabled={
                    checkoutBusy !== null || planSlug === 'pilot' || planSlug === 'pro'
                  }
                  onClick={() => handleUpgrade('pilot')}
                >
                  {checkoutBusy === 'pilot' ? 'Starting…' : 'Upgrade to Pilot'}
                </Button>
                <Button
                  disabled={checkoutBusy !== null || planSlug === 'pro'}
                  onClick={() => handleUpgrade('pro')}
                >
                  {checkoutBusy === 'pro' ? 'Starting…' : 'Upgrade to Pro'}
                </Button>
              </div>
            </Card>

            {plans.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Available plans
                </h2>
                <ul className="space-y-2">
                  {plans.map((p) => (
                    <li
                      key={p.slug}
                      className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{p.name || p.slug}</span>
                      {p.price_inr_paise != null && (
                        <span className="text-muted-foreground text-xs">
                          ₹{(p.price_inr_paise / 100).toLocaleString('en-IN')}
                          {p.interval ? ` / ${p.interval}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
