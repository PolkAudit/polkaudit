'use client'

import { useEffect, useState } from 'react'
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
  fetchCurrentUser,
  getAuthToken,
  type AdminProject,
  type AdminUser,
} from '@/lib/api'

type Membership = {
  user_id: number
  project_id: number
  role: string
  email?: string
  project_name?: string
  project_slug?: string
}

const ROLES = ['admin', 'auditor', 'member', 'viewer'] as const

export default function AdminMembershipsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Membership[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [userId, setUserId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number]>('member')
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    const [m, u, p] = await Promise.all([
      authFetch<Membership[]>('/api/admin/memberships'),
      authFetch<AdminUser[]>('/api/admin/users'),
      authFetch<AdminProject[]>('/api/v1/projects/'),
    ])
    setRows(m)
    setUsers(u)
    setProjects(p)
    if (!userId && u[0]) setUserId(String(u[0].id))
    if (!projectId && p[0]) setProjectId(String(p[0].id))
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
        await reload()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await authFetch('/api/admin/memberships', {
        method: 'POST',
        body: JSON.stringify({
          user_id: Number(userId),
          project_id: Number(projectId),
          role,
        }),
      })
      toast.success('Membership saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (uid: number, pid: number) => {
    try {
      await authFetch(`/api/admin/memberships/${uid}/${pid}`, { method: 'DELETE' })
      toast.success('Removed')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  return (
    <DashboardLayout>
      <Header title="Memberships" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Link users to tenant projects so Console billing, keys, and alerts resolve the
          correct workspace.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold mb-4">Assign membership</h2>
              <form onSubmit={handleAssign} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      User
                    </label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      required
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Project
                    </label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      required
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (#{p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Role
                    </label>
                    <select
                      className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                      value={role}
                      onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button type="submit" disabled={saving || !userId || !projectId}>
                  {saving ? 'Saving…' : 'Save membership'}
                </Button>
              </form>
            </Card>

            <Card className="bg-card border-border p-6 space-y-3">
              <h2 className="text-lg font-semibold">All memberships</h2>
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li
                    key={`${r.user_id}-${r.project_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{r.email || `User #${r.user_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.project_name || `Project #${r.project_id}`}
                        {r.project_slug ? ` · ${r.project_slug}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {r.role}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(r.user_id, r.project_id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="text-xs text-muted-foreground">No memberships yet.</li>
                )}
              </ul>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
