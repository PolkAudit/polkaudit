'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, fetchCurrentUser, getAuthToken } from '@/lib/api'

type SmtpSettings = {
  host: string
  port: number
  user: string
  from_address: string
  use_tls: boolean
  source: string
  configured: boolean
  password_set: boolean
}

export default function AdminSmtpPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState('PolkAudit <noreply@polkaudit.xyz>')
  const [useTls, setUseTls] = useState(true)
  const [passwordSet, setPasswordSet] = useState(false)
  const [source, setSource] = useState('env')
  const [configured, setConfigured] = useState(false)
  const [testTo, setTestTo] = useState('')

  const apply = (s: SmtpSettings) => {
    setHost(s.host || '')
    setPort(String(s.port || 587))
    setUser(s.user || '')
    setFromAddress(s.from_address || 'PolkAudit <noreply@polkaudit.xyz>')
    setUseTls(!!s.use_tls)
    setPasswordSet(!!s.password_set)
    setSource(s.source || 'env')
    setConfigured(!!s.configured)
    setPassword('')
  }

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
        setTestTo(me.email)
        const s = await authFetch<SmtpSettings>('/api/admin/settings/smtp')
        apply(s)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load SMTP settings')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        host,
        port: Number(port) || 587,
        user,
        from_address: fromAddress,
        use_tls: useTls,
        clear_password: false,
      }
      if (password.trim()) body.password = password.trim()
      const s = await authFetch<SmtpSettings>('/api/admin/settings/smtp', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      apply(s)
      toast.success('SMTP settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleClearPassword = async () => {
    setSaving(true)
    try {
      const s = await authFetch<SmtpSettings>('/api/admin/settings/smtp', {
        method: 'PUT',
        body: JSON.stringify({
          host,
          port: Number(port) || 587,
          user,
          from_address: fromAddress,
          use_tls: useTls,
          clear_password: true,
        }),
      })
      apply(s)
      toast.success('SMTP password cleared')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testTo.trim()) {
      toast.error('Enter a recipient email')
      return
    }
    setTesting(true)
    try {
      const res = await authFetch<{ message: string }>('/api/admin/settings/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ to: testTo.trim() }),
      })
      toast.success(res.message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="SMTP" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Platform email for verify / reset / magic links. Values saved here override
          server env when Host is set. Password is never shown after save.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={configured ? 'default' : 'secondary'}>
                {configured ? 'Configured' : 'Not configured'}
              </Badge>
              <Badge variant="outline">Source: {source}</Badge>
              {passwordSet && <Badge variant="outline">Password set</Badge>}
            </div>

            {!configured && (
              <Alert className="border border-amber-600/30 bg-amber-600/10">
                <AlertDescription className="text-amber-200 text-sm">
                  Without SMTP, auth links are only written to API logs. Add a host to
                  enable real email delivery.
                </AlertDescription>
              </Alert>
            )}

            <Card className="bg-card border-border p-6">
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      SMTP host
                    </label>
                    <Input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Port
                    </label>
                    <Input
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Username
                    </label>
                    <Input value={user} onChange={(e) => setUser(e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Password {passwordSet ? '(leave blank to keep)' : ''}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9"
                        autoComplete="new-password"
                        placeholder={passwordSet ? '••••••••' : ''}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      From address
                    </label>
                    <Input
                      value={fromAddress}
                      onChange={(e) => setFromAddress(e.target.value)}
                      placeholder="PolkAudit <noreply@polkaudit.xyz>"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium">Use STARTTLS</p>
                    <p className="text-xs text-muted-foreground">Typical for port 587</p>
                  </div>
                  <Switch checked={useTls} onCheckedChange={setUseTls} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save SMTP settings'}
                  </Button>
                  {passwordSet && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={handleClearPassword}
                    >
                      Clear password
                    </Button>
                  )}
                </div>
              </form>
            </Card>

            <Card className="bg-card border-border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Send test email
              </h2>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  className="sm:flex-1"
                />
                <Button onClick={handleTest} disabled={testing || !configured}>
                  {testing ? 'Sending…' : 'Send test'}
                </Button>
              </div>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
