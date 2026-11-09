'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch, fetchCurrentUser, getAuthToken } from '@/lib/api'

type TableInfo = { name: string; approx_rows: number }

export default function AdminDatabasePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [sql, setSql] = useState('SELECT id, email, role FROM users LIMIT 20')
  const [busy, setBusy] = useState(false)
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [selected, setSelected] = useState<string | null>(null)

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
        setTables(await authFetch<TableInfo[]>('/api/admin/db/tables'))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load tables')
        router.replace('/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const runQuery = async () => {
    setBusy(true)
    try {
      const res = await authFetch<{ columns: string[]; rows: Record<string, unknown>[] }>(
        '/api/admin/db/query',
        { method: 'POST', body: JSON.stringify({ sql, limit: 100 }) }
      )
      setColumns(res.columns)
      setRows(res.rows)
      toast.success(`${res.rows.length} rows`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setBusy(false)
    }
  }

  const browse = async (name: string) => {
    setSelected(name)
    setBusy(true)
    try {
      const res = await authFetch<{
        columns: string[]
        rows: Record<string, unknown>[]
      }>(`/api/admin/db/tables/${name}?limit=50`)
      setColumns(res.columns)
      setRows(res.rows)
      setSql(`SELECT * FROM ${name} LIMIT 50`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Browse failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Database" showSearch={false} />
      <main className="p-6 max-w-6xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Platform-admin read-only explorer (SELECT / EXPLAIN only). Writes are blocked.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <Card className="bg-card border-border p-3 max-h-[70vh] overflow-auto">
              <p className="text-xs uppercase text-muted-foreground mb-2">Tables</p>
              <ul className="space-y-1">
                {tables.map((t) => (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => browse(t.name)}
                      className={`w-full text-left text-sm px-2 py-1 rounded hover:bg-muted ${
                        selected === t.name ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      {t.name}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({t.approx_rows})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card border-border p-4 space-y-3">
                <Textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                />
                <Button onClick={runQuery} disabled={busy}>
                  {busy ? 'Running…' : 'Run query'}
                </Button>
              </Card>

              <Card className="bg-card border-border p-4 overflow-auto">
                {columns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No results yet.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th key={c} className="text-left border-b border-border px-2 py-1">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b border-border/40">
                          {columns.map((c) => (
                            <td key={c} className="px-2 py-1 align-top font-mono whitespace-pre-wrap">
                              {r[c] == null ? '' : String(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  )
}
