'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, getAuthToken } from '@/lib/api'

type AuditCase = {
  id: number
  title: string
  description?: string
  status: string
}

type CaseDetails = {
  case: AuditCase
  evidence: { id: number; description: string; file_url: string; file_hash: string }[]
  comments: { id: number; content: string; user_id: number; created_at?: string }[]
}

export default function AuditPage() {
  const router = useRouter()
  const [cases, setCases] = useState<AuditCase[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [details, setDetails] = useState<CaseDetails | null>(null)
  const [evidenceDesc, setEvidenceDesc] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [comment, setComment] = useState('')

  const load = async () => {
    setCases(await authFetch<AuditCase[]>('/api/v1/audit/cases'))
  }

  const openCase = async (id: number) => {
    setSelected(id)
    setDetails(await authFetch<CaseDetails>(`/api/v1/audit/cases/${id}`))
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
      <main className="p-6 max-w-4xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Open cases, attach evidence URLs, comment, and close reviews.
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
                const created = await authFetch<AuditCase>('/api/v1/audit/cases', {
                  method: 'POST',
                  body: JSON.stringify({ title, description }),
                })
                toast.success('Case created')
                setTitle('')
                setDescription('')
                await load()
                await openCase(created.id)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed')
              }
            }}
          >
            Create case
          </Button>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-card border-border p-4 space-y-2">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Cases
            </h2>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases yet.</p>
            ) : (
              cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCase(c.id).catch((e) => toast.error(String(e.message || e)))}
                  className={`w-full text-left border rounded px-3 py-2 text-sm transition-colors ${
                    selected === c.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      #{c.id} {c.title}
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {c.status}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </Card>

          <Card className="bg-card border-border p-4 space-y-4">
            {!details ? (
              <p className="text-sm text-muted-foreground">Select a case to view details.</p>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold">{details.case.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {details.case.description || 'No description'}
                  </p>
                  <Badge variant="outline" className="mt-2 capitalize">
                    {details.case.status}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Evidence</h3>
                  {details.evidence.length === 0 && (
                    <p className="text-xs text-muted-foreground">No evidence yet.</p>
                  )}
                  {details.evidence.map((ev) => (
                    <div key={ev.id} className="text-xs border border-border rounded p-2 space-y-1">
                      <p className="font-medium">{ev.description}</p>
                      <a
                        href={ev.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline break-all"
                      >
                        {ev.file_url}
                      </a>
                      <p className="font-mono text-muted-foreground truncate">
                        sha256:{ev.file_hash.slice(0, 16)}…
                      </p>
                    </div>
                  ))}
                  <Input
                    value={evidenceDesc}
                    onChange={(e) => setEvidenceDesc(e.target.value)}
                    placeholder="Evidence description"
                  />
                  <Input
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                    placeholder="https://… file or doc URL"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await authFetch(`/api/v1/audit/cases/${details.case.id}/evidence`, {
                          method: 'POST',
                          body: JSON.stringify({
                            description: evidenceDesc,
                            file_url: evidenceUrl,
                          }),
                        })
                        setEvidenceDesc('')
                        setEvidenceUrl('')
                        await openCase(details.case.id)
                        toast.success('Evidence added')
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed')
                      }
                    }}
                  >
                    Add evidence
                  </Button>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Comments</h3>
                  {details.comments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  )}
                  {details.comments.map((c) => (
                    <div key={c.id} className="text-xs border border-border rounded p-2">
                      <p>{c.content}</p>
                      <p className="text-muted-foreground mt-1">
                        user #{c.user_id}
                        {c.created_at ? ` · ${new Date(c.created_at).toLocaleString()}` : ''}
                      </p>
                    </div>
                  ))}
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await authFetch(`/api/v1/audit/cases/${details.case.id}/comments`, {
                          method: 'POST',
                          body: JSON.stringify({ content: comment }),
                        })
                        setComment('')
                        await openCase(details.case.id)
                        toast.success('Comment added')
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed')
                      }
                    }}
                  >
                    Post comment
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await authFetch(`/api/v1/audit/cases/${details.case.id}/close`, {
                          method: 'POST',
                          body: '{}',
                        })
                        await load()
                        await openCase(details.case.id)
                        toast.success('Case closed')
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Close failed')
                      }
                    }}
                  >
                    Close case
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await authFetch(`/api/v1/audit/cases/${details.case.id}/reopen`, {
                          method: 'POST',
                          body: '{}',
                        })
                        await load()
                        await openCase(details.case.id)
                        toast.success('Case reopened')
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Reopen failed')
                      }
                    }}
                  >
                    Reopen
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </main>
    </DashboardLayout>
  )
}
