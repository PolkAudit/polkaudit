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

export default function CompliancePage() {
  const router = useRouter()
  const [violations, setViolations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('Max treasury spend')
  const [ruleType, setRuleType] = useState('treasury_cap')

  const load = async () => {
    setViolations(await authFetch<any[]>('/api/v1/compliance/violations'))
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
      <Header title="Compliance" showSearch={false} />
      <main className="p-6 max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Policies and violations for the current workspace.
        </p>
        <Card className="bg-card border-border p-4 space-y-3">
          <h2 className="font-semibold">Create policy</h2>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Input value={ruleType} onChange={(e) => setRuleType(e.target.value)} />
          <Button
            onClick={async () => {
              try {
                await authFetch('/api/v1/compliance/policies', {
                  method: 'POST',
                  body: JSON.stringify({
                    name,
                    rule_type: ruleType,
                    config: { max: 1000000000000 },
                    severity: 'warning',
                  }),
                })
                toast.success('Policy created')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed')
              }
            }}
          >
            Create
          </Button>
        </Card>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Card className="bg-card border-border p-4 space-y-2">
            <h2 className="font-semibold">Violations</h2>
            {violations.length === 0 && (
              <p className="text-sm text-muted-foreground">No violations.</p>
            )}
            {violations.map((v, i) => (
              <pre key={i} className="text-xs bg-muted/40 p-2 rounded overflow-auto">
                {JSON.stringify(v, null, 2)}
              </pre>
            ))}
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
