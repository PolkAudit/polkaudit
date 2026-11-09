'use client'

import { useEffect, useMemo, useState } from 'react'
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
  formatBillingInterval,
  formatUsdCents,
  getAuthToken,
  startCheckout,
  type BillingPlan,
  type CheckoutPlanSlug,
  type SubscriptionInfo,
} from '@/lib/api'

const PLAN_ORDER = ['free', 'pilot', 'starter', 'pro', 'enterprise']
const CHECKOUT_PLANS: CheckoutPlanSlug[] = ['pilot', 'starter', 'pro']

const PLAN_BLURBS: Record<string, string> = {
  free: 'Default workspace access',
  pilot: 'Design-partner pack (landing midpoint)',
  starter: 'Small treasury / grant teams',
  pro: 'Active treasury teams',
  enterprise: 'Quote-only — contact sales',
}

export default function BillingPage() {
  const router = useRouter()
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [checkoutBusy, setCheckoutBusy] = useState<CheckoutPlanSlug | null>(null)
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
            plan: { slug: 'free', name: 'Free', price_usd_cents: 0, currency: 'USD' },
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

  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const ai = PLAN_ORDER.indexOf(a.slug)
      const bi = PLAN_ORDER.indexOf(b.slug)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [plans])

  const handleUpgrade = async (plan: CheckoutPlanSlug) => {
    setCheckoutBusy(plan)
    try {
      const result = await startCheckout(plan)
      if (result.mode === 'razorpay' && result.checkout_url) {
        window.location.href = result.checkout_url
        return
      }
      const amount = formatUsdCents(result.amount_usd_cents)
      const cadence = formatBillingInterval(result.billing_interval)
      toast.message('Manual upgrade', {
        description: `Contact ${result.contact || 'hello@polkaudit.xyz'} to activate ${plan} (${amount} ${cadence}).`.trim(),
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
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Tenant subscription fees match{' '}
          <a
            href="https://polkaudit.xyz/#pricing"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            polkaudit.xyz
          </a>{' '}
          USD midpoints. Checkout is USD-only via Razorpay payment links.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Current plan
                  </p>
                  <p className="text-lg font-semibold text-foreground mt-1">{planName}</p>
                  {sub?.plan && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {(sub.plan.price_usd_cents || 0) > 0
                        ? `${formatUsdCents(sub.plan.price_usd_cents)} ${formatBillingInterval(sub.plan.billing_interval)}`
                        : planSlug === 'enterprise'
                          ? 'Custom quote'
                          : 'No charge'}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="capitalize">
                  {sub?.status || 'active'}
                </Badge>
              </div>
            </Card>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Plans (USD)
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {orderedPlans.map((p) => {
                  const isCurrent = p.slug === planSlug
                  const canCheckout = CHECKOUT_PLANS.includes(p.slug as CheckoutPlanSlug)
                  const busy = checkoutBusy === p.slug
                  return (
                    <Card
                      key={p.slug}
                      className={`bg-card border-border p-5 space-y-3 ${
                        isCurrent ? 'border-accent/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{p.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {PLAN_BLURBS[p.slug] || p.slug}
                          </p>
                        </div>
                        {isCurrent && <Badge>Current</Badge>}
                      </div>
                      <p className="text-foreground">
                        {(p.price_usd_cents || 0) > 0 ? (
                          <>
                            <span className="text-xl font-bold">
                              {formatUsdCents(p.price_usd_cents)}
                            </span>{' '}
                            <span className="text-sm text-muted-foreground">
                              {formatBillingInterval(p.billing_interval)}
                            </span>
                          </>
                        ) : p.slug === 'enterprise' ? (
                          <span className="text-lg font-semibold">Custom</span>
                        ) : (
                          <span className="text-lg font-semibold">$0</span>
                        )}
                      </p>
                      {canCheckout ? (
                        <Button
                          className="w-full"
                          variant={isCurrent ? 'outline' : 'default'}
                          disabled={checkoutBusy !== null || isCurrent}
                          onClick={() => handleUpgrade(p.slug as CheckoutPlanSlug)}
                        >
                          {busy
                            ? 'Starting…'
                            : isCurrent
                              ? 'Active'
                              : `Subscribe · ${formatUsdCents(p.price_usd_cents)}`}
                        </Button>
                      ) : p.slug === 'enterprise' ? (
                        <Button className="w-full" variant="outline" asChild>
                          <a href="mailto:hello@polkaudit.xyz?subject=PolkAudit%20Enterprise">
                            Contact sales
                          </a>
                        </Button>
                      ) : null}
                    </Card>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
