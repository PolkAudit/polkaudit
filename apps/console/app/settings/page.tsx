'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConsoleShell } from '@/components/console-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  getDashboardUrl,
  resendVerification,
  startCheckout,
  type AuthUser,
} from '@/lib/api'

type ManagedKey = {
  id: number
  name: string
  key_prefix: string
  revoked_at: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [managedKeys, setManagedKeys] = useState<ManagedKey[]>([])
  const [newKeyName, setNewKeyName] = useState('default')
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [planSlug, setPlanSlug] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState<'pilot' | 'pro' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        setUser(await fetchCurrentUser())
      } catch {
        router.replace('/login')
        return
      }
      try {
        const keys = await authFetch<ManagedKey[]>('/api/v1/keys/')
        setManagedKeys(keys.filter((k) => !k.revoked_at))
      } catch {
        /* ignore */
      }
      try {
        const sub = await authFetch<{ plan?: { name: string; slug: string } }>(
          '/api/v1/billing/subscription'
        )
        setPlanName(sub.plan?.name || sub.plan?.slug || 'Free')
        setPlanSlug(sub.plan?.slug || 'free')
      } catch {
        setPlanName('Free')
        setPlanSlug('free')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleResendVerification = async () => {
    setResending(true)
    try {
      await resendVerification()
      toast.success('Verification email sent')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resend')
    } finally {
      setResending(false)
    }
  }

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
    <ConsoleShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verification, API keys, and plan upgrades.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            {user && !user.email_verified_at && (
              <Alert className="border border-amber-600/30 bg-amber-600/10">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <AlertDescription className="flex-1 text-amber-200 text-sm">
                    Your email <span className="font-medium">{user.email}</span> is not verified.
                  </AlertDescription>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-600/40"
                    disabled={resending}
                    onClick={handleResendVerification}
                  >
                    {resending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      'Resend verification'
                    )}
                  </Button>
                </div>
              </Alert>
            )}

            {user?.email_verified_at && (
              <Alert className="border border-emerald-600/30 bg-emerald-600/10">
                <AlertDescription className="text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Email verified
                </AlertDescription>
              </Alert>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Plan</h2>
              <Card className="bg-card border-border p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current plan</span>
                  <Badge variant="outline">{planName || 'Free'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upgrade via Razorpay Payment Links (INR). If checkout is not configured, you get a
                  contact fallback.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    disabled={
                      checkoutBusy !== null || planSlug === 'pilot' || planSlug === 'pro'
                    }
                    onClick={() => handleUpgrade('pilot')}
                  >
                    {checkoutBusy === 'pilot' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      'Upgrade to Pilot'
                    )}
                  </Button>
                  <Button
                    disabled={checkoutBusy !== null || planSlug === 'pro'}
                    onClick={() => handleUpgrade('pro')}
                  >
                    {checkoutBusy === 'pro' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      'Upgrade to Pro'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Or email{' '}
                  <a className="text-accent hover:underline" href="mailto:hello@polkaudit.xyz">
                    hello@polkaudit.xyz
                  </a>
                </p>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Project API keys</h2>
              <Card className="bg-card border-border p-6 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Create rotatable keys for your project. Raw keys are shown once. Use them on{' '}
                  <a
                    className="text-accent hover:underline"
                    href={getDashboardUrl()}
                    target="_blank"
                    rel="noreferrer"
                  >
                    app.polkaudit.xyz
                  </a>
                  .
                </p>
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
            </section>

            <p className="text-xs text-muted-foreground">
              <Link href="/" className="text-accent hover:underline">
                Back to home
              </Link>
            </p>
          </>
        )}
      </div>
    </ConsoleShell>
  )
}
