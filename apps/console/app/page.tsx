'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConsoleShell } from '@/components/console-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  getDashboardUrl,
  resendVerification,
  type AuthUser,
} from '@/lib/api'
import { toast } from 'sonner'

type ProjectRow = { project_id: number; name?: string | null; slug?: string | null; role: string }

export default function ConsoleHomePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [planName, setPlanName] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const me = await fetchCurrentUser()
        setUser(me)
        const projs = await authFetch<ProjectRow[]>('/api/auth/projects')
        setProjects(projs)
        try {
          const sub = await authFetch<{ plan?: { name: string; slug: string } }>(
            '/api/v1/billing/subscription'
          )
          setPlanName(sub.plan?.name || sub.plan?.slug || 'Free')
        } catch {
          setPlanName('Free')
        }
      } catch {
        router.replace('/login')
        return
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleResend = async () => {
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

  if (loading) {
    return (
      <ConsoleShell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      </ConsoleShell>
    )
  }

  return (
    <ConsoleShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage verification, billing, and API keys. Governance data lives on the dashboard.
          </p>
        </div>

        {user && !user.email_verified_at && (
          <Alert className="border border-amber-600/30 bg-amber-600/10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <AlertDescription className="flex-1 text-amber-200 text-sm">
                Verify <span className="font-medium">{user.email}</span> to secure your account.
              </AlertDescription>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-600/40"
                disabled={resending}
                onClick={handleResend}
              >
                {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Resend link'}
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

        <Card className="bg-card border-border p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Signed in as</p>
              <p className="text-sm font-medium text-foreground mt-1">{user?.email}</p>
            </div>
            <Badge variant="outline">{planName || 'Free'}</Badge>
          </div>
          <div className="pt-3 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground uppercase">Projects</p>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {projects.map((p) => (
                  <li
                    key={p.project_id}
                    className="flex items-center justify-between text-sm border border-border rounded px-3 py-2"
                  >
                    <span>
                      {p.name || p.slug || `Project #${p.project_id}`}
                      <span className="text-muted-foreground text-xs ml-2">{p.role}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button asChild>
              <Link href="/settings">Settings & billing</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={getDashboardUrl()} target="_blank" rel="noreferrer">
                Open dashboard
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </Card>
      </div>
    </ConsoleShell>
  )
}
