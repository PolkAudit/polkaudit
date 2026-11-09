'use client'

import { useState } from 'react'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchHealth,
  getApiBase,
  getApiKeyOverride,
  getConsoleUrl,
  hasApiKey,
  setApiKeyOverride,
} from '@/lib/api'

export default function SettingsPage() {
  const [useCustomKey, setUseCustomKey] = useState(() => getApiKeyOverride().enabled)
  const [apiKey, setApiKey] = useState(() => getApiKeyOverride().key)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: 'success' | 'error' | null
    message: string
  }>({ status: null, message: '' })

  const apiBaseUrl = getApiBase()
  const consoleUrl = getConsoleUrl()
  const isApiKeyConfigured = hasApiKey()

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
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Account & billing</h2>
          <Card className="bg-card border-border p-6 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign in, verify email, manage API keys, and upgrade plans in PolkAudit Console.
            </p>
            <Button asChild>
              <a href={`${consoleUrl}/settings`} target="_blank" rel="noreferrer">
                Manage account & billing
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
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
                <code className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded text-sm font-mono text-foreground break-all">
                  {apiBaseUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(apiBaseUrl)}
                  className="p-2 hover:bg-muted rounded transition-colors"
                  type="button"
                >
                  <Copy className="h-4 w-4 text-muted-foreground hover:text-accent" />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Environment API Key
              </label>
              <div className="mt-2">
                {isApiKeyConfigured ? (
                  <Badge
                    variant="default"
                    className="bg-emerald-600/20 text-emerald-400 border-emerald-600/40"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-amber-600/20 text-amber-400 border-amber-600/40"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Not set
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">API Connection</h2>
          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">Use custom API key</label>
                <p className="text-xs text-muted-foreground mt-1">
                  Override default authentication with a key from Console
                </p>
              </div>
              <Switch checked={useCustomKey} onCheckedChange={setUseCustomKey} />
            </div>

            {useCustomKey && (
              <div className="pt-2 border-t border-border">
                <label
                  htmlFor="api-key"
                  className="text-xs font-medium text-muted-foreground uppercase"
                >
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
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <Button onClick={handleSaveApiKey} disabled={isSaving} className="w-full sm:w-auto">
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
                      testResult.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                    }
                  >
                    {testResult.message}
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </Card>
        </section>
      </main>
    </DashboardLayout>
  )
}
