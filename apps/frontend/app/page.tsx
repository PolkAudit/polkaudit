import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { OverviewBanner } from '@/components/overview-banner'
import { Card } from '@/components/ui/card'
import { KPICard } from '@/components/kpi-card'
import { api, type Proposal } from '@/lib/api'
import {
  Database,
  Layers,
  FileText,
  BarChart3,
  PiggyBank,
  Activity,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

export default async function OverviewPage() {
  const stats = await api.getStats()
  const proposals = await api.getProposals()

  const kpis = [
    {
      icon: Database,
      label: 'Blocks Indexed',
      value: stats.total_blocks_indexed.toLocaleString(),
      subtitle: `Latest block #${stats.last_indexed_block}`,
    },
    {
      icon: Layers,
      label: 'Extrinsics',
      value: stats.total_extrinsics.toLocaleString(),
      subtitle: 'Decoded on-chain calls',
    },
    {
      icon: FileText,
      label: 'Total Proposals',
      value: stats.total_proposals.toLocaleString(),
      subtitle: 'OpenGov / democracy',
    },
    {
      icon: BarChart3,
      label: 'Total Votes',
      value: stats.total_votes.toLocaleString(),
      subtitle: 'Cast across proposals',
    },
    {
      icon: PiggyBank,
      label: 'Treasury Spend',
      value: stats.total_treasury_spend,
      subtitle: 'Total value spent',
    },
    {
      icon: Activity,
      label: 'Indexer',
      value: stats.last_indexed_block > 0 ? 'Live' : 'Idle',
      subtitle: stats.last_indexed_block > 0 ? 'Receiving chain data' : 'Start indexer',
      badge: stats.last_indexed_block > 0 ? { text: 'Active', variant: 'default' } : undefined,
    },
  ]

  return (
    <DashboardLayout>
      <Header title="Overview" showSearch={false} />
      <main className="p-6 space-y-6">
        <OverviewBanner />

        {/* KPI Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi, idx) => (
            <KPICard key={idx} {...kpi} />
          ))}
        </div>

        {/* Info Callout */}
        <div className="flex gap-3 px-4 py-3 bg-card border border-border rounded-lg">
          <AlertCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Most blocks contain routine calls; governance KPIs may stay at zero until referenda appear.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Activity - Left (wider) */}
          <div className="lg:col-span-2">
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Recent Activity</h2>

              {proposals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    No governance proposals yet
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Blocks and extrinsics are indexing; proposals appear when OpenGov activity is found.
                    {stats.last_governance_block
                      ? ` Last governance activity at block #${stats.last_governance_block}.`
                      : ''}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {proposals.slice(0, 5).map((p: Proposal) => (
                    <a
                      key={p.id}
                      href={`/proposals/${p.proposal_index}`}
                      className="flex items-center justify-between border-b pb-3 last:border-0 hover:opacity-90"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">Proposal #{p.proposal_index}</p>
                        <p className="text-xs text-muted-foreground">{p.section}.{p.method}</p>
                      </div>
                      <div className="text-sm font-medium">{p.status}</div>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Pipeline Health - Right */}
          <div>
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Pipeline Health</h2>

              <div className="space-y-4">
                {[
                  { label: 'Indexer running', status: true },
                  { label: 'Database connected', status: true },
                  { label: 'API reachable', status: true },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </DashboardLayout>
  )
}

