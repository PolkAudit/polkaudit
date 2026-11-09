'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  type AdminProject,
} from '@/lib/api'

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<AdminProject | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [usage, setUsage] = useState<any>(null)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        const me = await fetchCurrentUser()
        if (me.role !== 'admin') {
          router.replace('/')
          return
        }
        const projects = await authFetch<AdminProject[]>('/api/v1/projects/')
        const p = projects.find((x) => String(x.id) === String(id)) || null
        setProject(p)
        const m = await authFetch<any[]>(`/api/admin/memberships?project_id=${id}`)
        setMembers(m)
        // usage requires X-Project-ID — authFetch already sends stored project; override via header
        try {
          setUsage(
            await authFetch<any>('/api/v1/usage/summary', {
              headers: { 'X-Project-ID': String(id) },
            })
          )
        } catch {
          setUsage(null)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, router])

  return (
    <DashboardLayout>
      <Header title="Tenant detail" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : !project ? (
          <p className="text-sm text-muted-foreground">Project not found.</p>
        ) : (
          <>
            <Card className="bg-card border-border p-6 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{project.name}</h2>
                <Badge variant="outline">#{project.id}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {project.slug} · {project.chain_id}
              </p>
              <p className="text-xs font-mono text-muted-foreground">{project.rpc_url}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" asChild>
                  <a href="/admin/memberships">Memberships</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href="/admin/billing">Platform billing</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href="/keys">API keys</a>
                </Button>
              </div>
            </Card>

            <Card className="bg-card border-border p-4 space-y-2">
              <h3 className="font-semibold">Members</h3>
              {members.length === 0 && (
                <p className="text-sm text-muted-foreground">No memberships.</p>
              )}
              {members.map((m) => (
                <div
                  key={`${m.user_id}-${m.project_id}`}
                  className="flex justify-between text-sm border border-border rounded px-3 py-2"
                >
                  <span>{m.email || `User #${m.user_id}`}</span>
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </Card>

            <Card className="bg-card border-border p-4 space-y-2">
              <h3 className="font-semibold">Usage</h3>
              {!usage ? (
                <p className="text-sm text-muted-foreground">
                  Switch workspace to this project to load usage, or open Usage with project
                  selected.
                </p>
              ) : (
                <p className="text-sm">
                  {usage.period}: {usage.api_calls} API calls
                  {usage.unlimited
                    ? ' (unlimited)'
                    : ` / ${usage.api_quota_monthly} · plan ${usage.plan_slug}`}
                </p>
              )}
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
