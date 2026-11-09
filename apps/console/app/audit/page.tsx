'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

export default function AuditPage() {
  const router = useRouter()
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const load = async () => {
    setCases(await authFetch<any[]>('/api/v1/audit/cases'))
  }

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    ;(async () => {
      try {
        await load()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Admin/auditor required')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  return (
    <DashboardLayout>
      <Header title="Audit cases" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Open and track audit cases for the workspace.
        </p>
        <Card className="bg-card border-border p-4 space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Case title"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          <Button
            onClick={async () => {
              try {
                await authFetch('/api/v1/audit/cases', {
                  method: 'POST',
                  body: JSON.stringify({ title, description }),
                })
                toast.success('Case created')
                setTitle('')
                setDescription('')
                await load()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed')
              }
            }}
          >
            Create case
          </Button>
        </Card>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Card className="bg-card border-border p-4 space-y-2">
            {cases.length === 0 && (
              <p className="text-sm text-muted-foreground">No cases yet.</p>
            )}
            {cases.map((c) => (
              <div key={c.id} className="border border-border rounded px-3 py-2 text-sm">
                <p className="font-medium">
                  #{c.id} {c.title}
                </p>
                <p className="text-xs text-muted-foreground capitalize">{c.status}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={async () => {
                    try {
                      await authFetch(`/api/v1/audit/cases/${c.id}/close`, {
                        method: 'POST',
                        body: '{}',
                      })
                      await load()
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Close failed')
                    }
                  }}
                >
                  Close
                </Button>
              </div>
            ))}
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
