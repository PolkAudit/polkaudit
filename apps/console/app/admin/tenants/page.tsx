'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, fetchCurrentUser, getAuthToken } from '@/lib/api'

type TenantResult = {
  project: { id: number; name: string; slug: string }
  user: { id: number; email: string; created: boolean }
  membership_role: string
  subscription: { plan_slug: string; status: string }
  api_key: { raw_key: string; key_prefix: string } | null
}

const PLANS = ['free', 'pilot', 'starter', 'pro', 'enterprise'] as const

export default function AdminTenantsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TenantResult | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [chainId, setChainId] = useState('polkadot')
  const [rpcUrl, setRpcUrl] = useState('wss://rpc.polkadot.io')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [planSlug, setPlanSlug] = useState<(typeof PLANS)[number]>('starter')
  const [createKey, setCreateKey] = useState(true)

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
      } catch {
        router.replace('/login')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const created = await authFetch<TenantResult>('/api/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug,
          chain_id: chainId,
          rpc_url: rpcUrl,
          admin_email: email,
          admin_password: password,
          user_role: 'member',
          project_role: 'admin',
          plan_slug: planSlug,
          create_api_key: createKey,
          api_key_name: 'default',
        }),
      })
      setResult(created)
      toast.success(`Tenant ${created.project.slug} ready`)
      setPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Onboarding failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Onboard tenant" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          One-shot provision: project workspace + user membership + plan + optional API
          key. This is the recommended path for new paying tenants.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Project name
                    </label>
                    <Input
                      required
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        if (!slug) {
                          setSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/^-|-$/g, '')
                          )
                        }
                      }}
                      placeholder="Acme Treasury"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Slug
                    </label>
                    <Input
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="acme-treasury"
                      pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Chain ID
                    </label>
                    <Input value={chainId} onChange={(e) => setChainId(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      RPC URL
                    </label>
                    <Input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Admin email
                    </label>
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Temp password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Starting plan
                    </label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={planSlug}
                      onChange={(e) =>
                        setPlanSlug(e.target.value as (typeof PLANS)[number])
                      }
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={createKey}
                        onChange={(e) => setCreateKey(e.target.checked)}
                      />
                      Create API key
                    </label>
                  </div>
                </div>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Provisioning…' : 'Create tenant'}
                </Button>
              </form>
            </Card>

            {result && (
              <Card className="bg-card border-border p-6 space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Tenant created</h2>
                <p className="text-sm text-muted-foreground">
                  Project #{result.project.id} · {result.project.name} ({result.project.slug})
                  <br />
                  User {result.user.email} ({result.user.created ? 'new' : 'existing'}) · plan{' '}
                  {result.subscription.plan_slug}
                </p>
                {result.api_key?.raw_key && (
                  <Alert className="border border-accent/40 bg-accent/5">
                    <AlertDescription className="text-xs font-mono break-all">
                      {result.api_key.raw_key}
                      <button
                        type="button"
                        className="ml-2 inline-flex"
                        onClick={() => {
                          navigator.clipboard.writeText(result.api_key!.raw_key)
                          toast.success('Copied')
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </AlertDescription>
                  </Alert>
                )}
              </Card>
            )}
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
