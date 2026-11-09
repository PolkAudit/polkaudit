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
import { CheckCircle2, AlertCircle, Loader2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  fetchHealth,
  getApiBase,
  getApiKeyOverride,
  getAuthToken,
  hasApiKey,
  setApiKeyOverride,
} from '@/lib/api'

type ManagedKey = {
  id: number
  name: string
  key_prefix: string
  revoked_at: string | null
}

export default function SettingsPage() {
  const [useCustomKey, setUseCustomKey] = useState(() => getApiKeyOverride().enabled)
  const [apiKey, setApiKey] = useState(() => getApiKeyOverride().key)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: 'success' | 'error' | null
    message: string
  }>({ status: null, message: '' })
  const [managedKeys, setManagedKeys] = useState<ManagedKey[]>([])
  const [newKeyName, setNewKeyName] = useState('dashboard')
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)

  const apiBaseUrl = getApiBase()
  const isApiKeyConfigured = hasApiKey()

  useEffect(() => {
    const token = getAuthToken()
    setSignedIn(!!token)
    if (!token) return
    ;(async () => {
      try {
        const keys = await authFetch<ManagedKey[]>('/api/v1/keys/')
        setManagedKeys(keys.filter((k) => !k.revoked_at))
      } catch {
        /* not signed in or no project */
      }
      try {
        const sub = await authFetch<{ plan?: { name: string; slug: string } }>(
          '/api/v1/billing/subscription'
        )
        setPlanName(sub.plan?.name || sub.plan?.slug || 'Free')
      } catch {
        setPlanName(null)
      }
    })()
  }, [])

  const handleCreateKey = async () => {
    try {
      const created = await authFetch<{ raw_key: string } & ManagedKey>('/api/v1/keys/', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName || 'default' }),
      })
      setCreatedRawKey(created.raw_key)
      setManagedKeys((prev) => [
        { id: created.id, name: created.name, key_prefix: created.key_prefix, revoked_at: null },
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
      if (!useCustomKey) {
        setApiKey('')
      }
    } catch (error) {
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
      setTestResult({
        status: 'success',
        message: 'Backend healthy - Connection successful',
      })
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <DashboardLayout>
      <Header title="Settings" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
        {/* 1. Environment (Read-only) */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Environment</h2>
          <Card className="bg-card border-border p-6 space-y-4">
            {/* API Base URL */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">
                API Base URL
              </label>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded text-sm font-mono text-foreground break-all">
                  {apiBaseUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(apiBaseUrl)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                >
                  <Copy className="h-4 w-4 text-muted-foreground hover:text-accent" />
                </button>
              </div>
            </div>

            {/* API Key Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Environment API Key
              </label>
              <div className="mt-2">
                {isApiKeyConfigured ? (
                  <Badge variant="default" className="bg-emerald-600/20 text-emerald-400 border-emerald-600/40">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-600/20 text-amber-400 border-amber-600/40">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Not set
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </section>

        {/* 2. API Connection (Editable) */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">API Connection</h2>
          <Card className="bg-card border-border p-6 space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Use custom API key
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Override default authentication with custom key
                </p>
              </div>
              <Switch checked={useCustomKey} onCheckedChange={setUseCustomKey} />
            </div>

            {/* API Key Input (conditional) */}
            {useCustomKey && (
              <div className="pt-2 border-t border-border">
                <label htmlFor="api-key" className="text-xs font-medium text-muted-foreground uppercase">
                  API Key
                </label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="mt-2 bg-muted/50 border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Must match backend API_KEY environment variable
                </p>
              </div>
            )}

            {/* Save Button */}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={handleSaveApiKey}
                disabled={isSaving}
                className="w-full sm:w-auto"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            </div>
          </Card>
        </section>

        {/* 3. Connection Test */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Connection Test</h2>
          <Card className="bg-card border-border p-6 space-y-4">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {/* Result Area */}
            {testResult.status && (
              <Alert
                className={`border ${
                  testResult.status === 'success'
                    ? 'bg-emerald-600/10 border-emerald-600/30'
                    : 'bg-red-600/10 border-red-600/30'
                }`}
              >
                <div className="flex gap-2">
                  {testResult.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <AlertDescription
                    className={
                      testResult.status === 'success'
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }
                  >
                    {testResult.message}
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </Card>
        </section>

        {/* 4. Project API keys (JWT account) */}
        {signedIn && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Project API keys</h2>
            <Card className="bg-card border-border p-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Create rotatable keys for your project. Raw keys are shown once.
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
                      <span className="font-mono text-muted-foreground text-xs">{k.key_prefix}…</span>
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
        )}

        {/* 5. Plan (manual billing) */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Plan</h2>
          <Card className="bg-card border-border p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current plan</span>
              <Badge variant="outline">{planName || (signedIn ? 'Free' : 'Demo')}</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pilots are activated manually after payment (Wise / Razorpay link). Contact{' '}
              <a className="text-accent hover:underline" href="mailto:hello@polkaudit.xyz">
                hello@polkaudit.xyz
              </a>{' '}
              to upgrade.
            </p>
          </Card>
        </section>

        {/* 6. Product */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Product</h2>
          <Card className="bg-card border-border p-6">
            <div className="grid gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Dashboard:</span>
                <span className="ml-2 font-mono text-foreground">app.polkaudit.xyz</span>
              </div>
              <div>
                <span className="text-muted-foreground">API:</span>
                <span className="ml-2 font-mono text-foreground">api.polkaudit.xyz</span>
              </div>
              <div>
                <span className="text-muted-foreground">Focus:</span>
                <span className="ml-2 text-foreground">Polkadot governance transparency</span>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </DashboardLayout>
  )
}

