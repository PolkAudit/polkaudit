import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { OverviewBanner } from '@/components/overview-banner'
import { Card } from '@/components/ui/card'
import { KPICard } from '@/components/kpi-card'
import { api, type ActivityItem } from '@/lib/api'
import {
  Database,
  Layers,
  FileText,
  BarChart3,
  PiggyBank,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'

export default async function OverviewPage() {
  const [stats, activity] = await Promise.all([
    api.getStats(),
    api.getRecentActivity(12).catch(() => ({
      items: [] as ActivityItem[],
      last_indexed_block: 0,
      last_governance_block: 0,
    })),
  ])

  const lag = stats.governance_lag_blocks ?? 0
  const lastGov = stats.last_governance_block ?? activity.last_governance_block ?? 0

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
      subtitle: 'Sum of spend values (planck)',
    },
    {
      icon: Clock,
      label: 'Governance lag',
      value: lastGov > 0 ? lag.toLocaleString() : '—',
      subtitle:
        lastGov > 0
          ? `Last gov block #${lastGov.toLocaleString()}`
          : 'No governance events yet',
      badge:
        lastGov > 0 && lag < 5000
          ? { text: 'Fresh', variant: 'default' as const }
          : lastGov > 0
            ? { text: 'Catching up', variant: 'default' as const }
            : undefined,
    },
  ]

  const pipeline = [
    {
      label: 'Indexer advancing',
      ok: stats.last_indexed_block > 0,
      detail: stats.last_indexed_block
        ? `Block #${stats.last_indexed_block.toLocaleString()}`
        : 'Waiting for first block',
    },
    {
      label: 'Governance seen',
      ok: lastGov > 0,
      detail: lastGov
        ? `Block #${lastGov.toLocaleString()} · lag ${lag.toLocaleString()}`
        : 'Re-index a richer range if needed',
    },
    {
      label: 'API reachable',
      ok: true,
      detail: 'Stats loaded for this page',
    },
  ]

  return (
    <DashboardLayout>
      <Header title="Overview" showSearch={false} />
      <main className="p-6 space-y-6">
        <OverviewBanner />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi, idx) => (
            <KPICard key={idx} {...kpi} />
          ))}
        </div>

        <div className="flex gap-3 px-4 py-3 bg-card border border-border rounded-lg">
          <AlertCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Most blocks are routine. Governance KPIs fill when OpenGov votes, referenda, or treasury
            spends are indexed. Ops can re-scan a range with{' '}
            <code className="text-xs">deploy/alibaba/reindex-range.sh</code>.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Recent Activity</h2>

              {activity.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Activity className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    Indexing chain tip
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    No proposals, votes, or treasury spends in the current window yet.
                    {stats.last_indexed_block
                      ? ` Last indexed block #${stats.last_indexed_block.toLocaleString()}.`
                      : ''}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activity.items.map((item, idx) => (
                    <a
                      key={`${item.type}-${item.block_number}-${idx}`}
                      href={item.href}
                      className="flex items-center justify-between border-b border-border pb-3 last:border-0 hover:opacity-90"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {item.type}
                          </span>
                          <p className="text-sm font-medium leading-none text-foreground truncate">
                            {item.title}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs font-mono text-muted-foreground">
                          #{item.block_number.toLocaleString()}
                        </div>
                        {item.status && (
                          <div className="text-xs text-foreground mt-0.5">{item.status}</div>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div>
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Pipeline Health</h2>
              <div className="space-y-4">
                {pipeline.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2
                      className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                        item.ok ? 'text-emerald-500' : 'text-muted-foreground/40'
                      }`}
                    />
                    <div>
                      <span className="text-sm text-foreground block">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.detail}</span>
                    </div>
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
