'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  type AdminProject,
} from '@/lib/api'

type PaymentRow = {
  id: number
  provider: string
  event_id?: string | null
  event_type: string
  project_id?: number | null
  created_at?: string | null
}

export default function AdminPaymentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [projectFilter, setProjectFilter] = useState('')

  const load = async (pid?: string) => {
    const qs = pid ? `?project_id=${pid}&limit=200` : '?limit=200'
    const [payments, projectList] = await Promise.all([
      authFetch<PaymentRow[]>(`/api/admin/payments${qs}`),
      authFetch<AdminProject[]>('/api/v1/projects/').catch(() => []),
    ])
    setRows(payments)
    setProjects(projectList)
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
        await load()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load payments')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const projectName = (id?: number | null) => {
    if (!id) return '—'
    const p = projects.find((x) => x.id === id)
    return p ? `${p.name} (#${id})` : `#${id}`
  }

  return (
    <DashboardLayout>
      <Header title="Payment events" showSearch={false} />
      <main className="p-6 max-w-4xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Razorpay webhook audit log (`payment_events`). Filter by tenant project.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Project
              </label>
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={projectFilter}
                onChange={async (e) => {
                  const v = e.target.value
                  setProjectFilter(v)
                  setLoading(true)
                  try {
                    await load(v || undefined)
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (#{p.id})
                  </option>
                ))}
              </select>
            </div>

            <Card className="bg-card border-border p-4">
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{r.event_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {projectName(r.project_id)}
                        {r.event_id ? ` · ${r.event_id}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.provider}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="text-xs text-muted-foreground">No payment events.</li>
                )}
              </ul>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
