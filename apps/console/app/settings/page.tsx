'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Copy, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  changePassword,
  clearSession,
  fetchCurrentUser,
  fetchHealth,
  getApiBase,
  getApiKeyOverride,
  getAuthToken,
  hasApiKey,
  resendVerification,
  setApiKeyOverride,
  startCheckout,
  type AuthUser,
} from '@/lib/api'
import { useRouter } from 'next/navigation'

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
  const [useCustomKey, setUseCustomKey] = useState(() => getApiKeyOverride().enabled)
  const [apiKey, setApiKey] = useState(() => getApiKeyOverride().key)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: 'success' | 'error' | null
    message: string
  }>({ status: null, message: '' })
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const apiBaseUrl = getApiBase()
  const isApiKeyConfigured = hasApiKey()

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

  const handleSaveApiKey = async () => {
    if (useCustomKey && !apiKey.trim()) {
      toast.error('API key cannot be empty')
      return
    }
    setIsSaving(true)
    try {
      setApiKeyOverride(apiKey.trim(), useCustomKey)
      toast.success('API configuration saved')
      if (!useCustomKey) setApiKey('')
    } catch {
      toast.error('Failed to save API configuration')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult({ status: null, message: '' })
    try {
      await fetchHealth()
      setTestResult({ status: 'success', message: 'Backend healthy' })
      toast.success('Connection test passed')
    } catch (error) {
      setTestResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unable to reach backend',
      })
      toast.error('Connection test error')
    } finally {
      setIsTesting(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    setChangingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  const signOut = () => {
    clearSession()
    router.push('/login')
  }

  return (
    <DashboardLayout>
      <Header title="Settings" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
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
                    {resending ? 'Sending…' : 'Resend verification'}
                  </Button>
                </div>
              </Alert>
            )}

            {user?.email_verified_at && (
              <Alert className="border border-emerald-600/30 bg-emerald-600/10">
                <AlertDescription className="text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Signed in as {user.email} · Email verified
                </AlertDescription>
              </Alert>
            )}

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Change password</h2>
              <Card className="bg-card border-border p-6">
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Current password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      New password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Confirm new password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={changingPassword}>
                      {changingPassword ? 'Updating…' : 'Update password'}
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <a href="/forgot-password">Forgot password?</a>
                    </Button>
                  </div>
                </form>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Plan</h2>
              <Card className="bg-card border-border p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current plan</span>
                  <Badge variant="outline">{planName || 'Free'}</Badge>
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
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Project API keys</h2>
              <Card className="bg-card border-border p-6 space-y-4">
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

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Environment</h2>
              <Card className="bg-card border-border p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    API Base URL
                  </label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded text-sm font-mono break-all">
                      {apiBaseUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(apiBaseUrl)}
                      className="p-2 hover:bg-muted rounded"
                    >
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    Environment API Key
                  </label>
                  <div className="mt-2">
                    {isApiKeyConfigured ? (
                      <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/40">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not set</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-sm font-medium">Use custom API key</p>
                    <p className="text-xs text-muted-foreground">Override for governance fetches</p>
                  </div>
                  <Switch checked={useCustomKey} onCheckedChange={setUseCustomKey} />
                </div>
                {useCustomKey && (
                  <Input
                    type="password"
                    placeholder="API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveApiKey} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save configuration'}
                  </Button>
                  <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                    {isTesting ? 'Testing…' : 'Test connection'}
                  </Button>
                  <Button variant="ghost" onClick={signOut}>
                    Sign out
                  </Button>
                </div>
                {testResult.status && (
                  <Alert
                    className={
                      testResult.status === 'success'
                        ? 'border-emerald-600/30 bg-emerald-600/10'
                        : 'border-red-600/30 bg-red-600/10'
                    }
                  >
                    <AlertDescription
                      className={
                        testResult.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {testResult.message}
                    </AlertDescription>
                  </Alert>
                )}
              </Card>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
