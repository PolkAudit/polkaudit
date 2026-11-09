'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

export default function AiPage() {
  const router = useRouter()
  const [recs, setRecs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [proposalId, setProposalId] = useState('1')
  const [title, setTitle] = useState('Treasury proposal')
  const [description, setDescription] = useState('Review spend request')
  const [value, setValue] = useState('15000')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setRecs(await authFetch<any[]>('/api/v1/ai/recommendations'))
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
      <Header title="AI analysis" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Queue proposal analysis and review recommendations (auditor/admin).
        </p>
        <Card className="bg-card border-border p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              placeholder="Proposal id"
            />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value"
              inputMode="decimal"
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="sm:col-span-2"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="sm:col-span-2"
            />
          </div>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await authFetch('/api/v1/ai/analyze/proposal', {
                  method: 'POST',
                  body: JSON.stringify({
                    proposal_id: String(proposalId),
                    title,
                    description,
                    value: Number(value) || 0,
                  }),
                })
                toast.success('Analysis queued')
                setTimeout(load, 1500)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Queueing…' : 'Analyze'}
          </Button>
        </Card>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Card className="bg-card border-border p-4 space-y-2">
            {recs.length === 0 && (
              <p className="text-sm text-muted-foreground">No recommendations yet.</p>
            )}
            {recs.map((r, i) => (
              <pre key={i} className="text-xs bg-muted/40 p-2 rounded overflow-auto">
                {JSON.stringify(r, null, 2)}
              </pre>
            ))}
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
