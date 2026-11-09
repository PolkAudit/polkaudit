'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  type AdminProject,
} from '@/lib/api'

export default function AdminChainsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

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
        const list = await authFetch<AdminProject[]>('/api/v1/projects/')
        setProjects(list)
        if (list[0]) setProjectId(String(list[0].id))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  return (
    <DashboardLayout>
      <Header title="Chain sync" showSearch={false} />
      <main className="p-6 max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Trigger background proposal sync for a project.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Card className="bg-card border-border p-6 space-y-4">
            <select
              className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (#{p.id})
                </option>
              ))}
            </select>
            <Button
              disabled={busy || !projectId}
              onClick={async () => {
                setBusy(true)
                try {
                  const res = await authFetch<{ message?: string }>(
                    `/api/v1/chains/sync/${projectId}`,
                    { method: 'POST' }
                  )
                  toast.success(res.message || 'Sync queued')
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Sync failed')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Queueing…' : 'Start sync'}
            </Button>
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
