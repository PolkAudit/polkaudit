'use client'

import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyTreasury } from '@/components/empty-treasury'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Copy, Calendar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/breadcrumb'
import { api, type TreasurySpend } from '@/lib/api'
import { toast } from 'sonner'

export default function TreasuryPage() {
  const [_copied, setCopied] = useState(false)
  const [treasurySpends, setTreasurySpends] = useState<TreasurySpend[]>([])
  const [loading, setLoading] = useState(true)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await api.getTreasurySpends()
        if (mounted) setTreasurySpends(data)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load treasury spends')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const PLANCK = 10_000_000_000 // 1 DOT = 1e10 planck
  const formatDot = (planck: string | number) => {
    const n = Number(planck || 0)
    if (!Number.isFinite(n)) return String(planck)
    return (n / PLANCK).toLocaleString(undefined, { maximumFractionDigits: 4 })
  }
  const truncateAddr = (addr: string) =>
    addr.length <= 16 ? addr : `${addr.slice(0, 8)}…${addr.slice(-8)}`

  const totalSpends = treasurySpends.length
  const totalPlanck = treasurySpends.reduce((sum, spend) => sum + Number(spend.value || 0), 0)
  const lastSpendBlock = treasurySpends.length > 0 ? treasurySpends[0].block_number : 'N/A'

  const statCards = [
    {
      label: 'Total Spends',
      value: totalSpends.toString(),
      subtitle: 'Treasury disbursements',
    },
    {
      label: 'Total Value',
      value: formatDot(totalPlanck),
      subtitle: 'DOT (from planck)',
      suffix: ' DOT',
    },
    {
      label: 'Last Spend Block',
      value: lastSpendBlock === 'N/A' ? 'N/A' : `#${Number(lastSpendBlock).toLocaleString()}`,
      subtitle: 'Most recent spend',
    },
  ]

  return (
    <DashboardLayout>
      <Header title="Treasury" showSearch={false} />
      <main className="p-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={[{ label: 'Treasury' }]} className="px-2" />

        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((stat, idx) => (
            <Card key={idx} className="bg-card border-border p-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-semibold text-foreground">
                    {stat.value}
                  </h3>
                  {stat.suffix && (
                    <span className="text-sm text-muted-foreground">{stat.suffix}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Date Range Filter (Disabled) */}
        <div className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded-lg">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Date range filter</span>
          <Button variant="ghost" size="sm" className="ml-auto text-xs" disabled>
            Coming soon
          </Button>
        </div>

        {/* Table or Empty State */}
        {loading ? (
          <Card className="bg-card border-border p-8 text-sm text-muted-foreground">Loading treasury…</Card>
        ) : treasurySpends.length === 0 ? (
          <EmptyTreasury />
        ) : (
          <Card className="border border-border rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 border-b border-border hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      ID
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Block
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Beneficiary
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6 text-right">
                      Value
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treasurySpends.map((spend, idx) => (
                    <TableRow
                      key={spend.id}
                      className={`border-b border-border transition-colors duration-150 cursor-pointer ${
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                      } hover:bg-muted/40`}
                    >
                      <TableCell className="text-sm font-mono text-foreground py-3 px-6">
                        {spend.id}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-foreground py-3 px-6">
                        #{spend.block_number.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm py-3 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground truncate max-w-xs" title={spend.beneficiary}>
                            {truncateAddr(spend.beneficiary)}
                          </span>
                          <button
                            onClick={() => {
                              copyToClipboard(spend.beneficiary)
                              toast.success('Address copied')
                            }}
                            className="p-1 hover:bg-muted rounded transition-colors duration-150"
                            title="Copy address"
                          >
                            <Copy className="h-4 w-4 text-muted-foreground hover:text-accent" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-right text-accent py-3 px-6 font-semibold">
                        <div>{formatDot(spend.value)} DOT</div>
                        <div className="text-[10px] text-muted-foreground font-normal">{spend.value} planck</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>
    </DashboardLayout>
  )
}
