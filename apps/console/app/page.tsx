'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  CreditCard,
  Bell,
  Loader2,
} from 'lucide-react'
import {
  fetchCurrentUser,
  fetchMyProjects,
  getAuthToken,
  getDashboardUrl,
  authFetch,
  type AuthUser,
  type MyProject,
} from '@/lib/api'

export default function ConsoleHomePage() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [projects, setProjects] = useState<MyProject[]>([])
  const [planName, setPlanName] = useState<string>('Free')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const me = await fetchCurrentUser()
        setUser(me)
        setProjects(await fetchMyProjects())
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

  return (
    <DashboardLayout>
      <Header title="Home" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Account</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage verification, billing, and API keys. Governance data lives on the
                dashboard.
              </p>
            </div>

            {user && !user.email_verified_at && (
              <Alert className="border border-amber-600/30 bg-amber-600/10">
                <AlertDescription className="text-amber-200 text-sm">
                  Email not verified — confirm from Settings or your inbox.
                </AlertDescription>
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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Signed in as
                  </p>
                  <p className="text-foreground font-medium mt-1">{user?.email}</p>
                  {user?.role && (
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      Role: {user.role}
                    </p>
                  )}
                </div>
                <Badge variant="outline">{planName}</Badge>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Projects
                </p>
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects linked yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {projects.map((p) => (
                      <li
                        key={p.project_id}
                        className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-foreground">
                          {p.name || p.slug || `Project ${p.project_id}`}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {p.role}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild>
                  <a href={getDashboardUrl()} target="_blank" rel="noreferrer">
                    Open dashboard
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/settings">Settings</Link>
                </Button>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/keys">
                <Card className="bg-card border-border p-4 hover:border-accent/50 transition-colors h-full">
                  <KeyRound className="h-5 w-5 text-accent mb-2" />
                  <p className="text-sm font-medium text-foreground">API keys</p>
                  <p className="text-xs text-muted-foreground mt-1">Create and revoke keys</p>
                </Card>
              </Link>
              <Link href="/billing">
                <Card className="bg-card border-border p-4 hover:border-accent/50 transition-colors h-full">
                  <CreditCard className="h-5 w-5 text-accent mb-2" />
                  <p className="text-sm font-medium text-foreground">Billing</p>
                  <p className="text-xs text-muted-foreground mt-1">Plan and upgrades</p>
                </Card>
              </Link>
              <Link href="/alerts">
                <Card className="bg-card border-border p-4 hover:border-accent/50 transition-colors h-full">
                  <Bell className="h-5 w-5 text-accent mb-2" />
                  <p className="text-sm font-medium text-foreground">Alerts</p>
                  <p className="text-xs text-muted-foreground mt-1">Channels and rules</p>
                </Card>
              </Link>
            </div>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
