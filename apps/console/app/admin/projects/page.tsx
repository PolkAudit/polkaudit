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
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  type AdminProject,
} from '@/lib/api'

export default function AdminProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [chainId, setChainId] = useState('polkadot')
  const [rpcUrl, setRpcUrl] = useState('wss://rpc.polkadot.io')

  const loadProjects = async () => {
    const list = await authFetch<AdminProject[]>('/api/v1/projects/')
    setProjects(list)
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
        await loadProjects()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load projects')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await authFetch<AdminProject>('/api/v1/projects/', {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug,
          chain_id: chainId,
          rpc_url: rpcUrl,
        }),
      })
      toast.success('Project created')
      setName('')
      setSlug('')
      await loadProjects()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Projects" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Platform projects (tenants). Create entries for new chains or workspaces.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Create project</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Name
                    </label>
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Polkadot Main"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Slug
                    </label>
                    <Input
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="polkadot-main"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      Chain ID
                    </label>
                    <Input
                      required
                      value={chainId}
                      onChange={(e) => setChainId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">
                      RPC URL
                    </label>
                    <Input
                      required
                      value={rpcUrl}
                      onChange={(e) => setRpcUrl(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create project'}
                </Button>
              </form>
            </Card>

            <Card className="bg-card border-border p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">All projects</h2>
              <ul className="space-y-2">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    className="rounded border border-border px-3 py-2 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-xs font-mono text-muted-foreground">{p.slug}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.chain_id} · {p.rpc_url}
                    </p>
                  </li>
                ))}
                {projects.length === 0 && (
                  <li className="text-xs text-muted-foreground">No projects yet.</li>
                )}
              </ul>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
