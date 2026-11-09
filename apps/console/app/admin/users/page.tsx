'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
  authFetch,
  fetchCurrentUser,
  getAuthToken,
  type AdminUser,
} from '@/lib/api'

const ROLES = ['admin', 'auditor', 'member', 'viewer'] as const

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number]>('viewer')
  const [creating, setCreating] = useState(false)

  const loadUsers = async () => {
    const list = await authFetch<AdminUser[]>('/api/admin/users')
    setUsers(list)
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
        await loadUsers()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load users')
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
      await authFetch<AdminUser>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          role,
          is_active: true,
        }),
      })
      toast.success('User created')
      setEmail('')
      setPassword('')
      setRole('viewer')
      await loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create user')
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <Header title="Users" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Invite-only console access. Public signup is disabled — create accounts here.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Create user</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    Email
                  </label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase">
                    Temporary password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9"
                      autoComplete="new-password"
                    />
                  </div>
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
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create user'}
                </Button>
              </form>
            </Card>

            <Card className="bg-card border-border p-6 space-y-3">
              <h2 className="text-lg font-semibold text-foreground">All users</h2>
              <ul className="space-y-2">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.email_verified_at ? 'Verified' : 'Unverified'} ·{' '}
                        {u.is_active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {u.role}
                    </Badge>
                  </li>
                ))}
                {users.length === 0 && (
                  <li className="text-xs text-muted-foreground">No users found.</li>
                )}
              </ul>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  )
}
