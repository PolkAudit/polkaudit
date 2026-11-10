'use client'

import { useState } from 'react'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileSpreadsheet, FileJson, FileText, Download } from 'lucide-react'
import { toast } from 'sonner'
import { downloadOverviewJson, downloadProposalsCsv, downloadTreasuryCsv } from '@/lib/api'

export default function ExportsPage() {
  const [loadingState, setLoadingState] = useState<Record<string, boolean>>({})

  const handleDownload = async (exportId: string) => {
    setLoadingState((prev) => ({ ...prev, [exportId]: true }))

    try {
      if (exportId === 'proposals-csv') {
        await downloadProposalsCsv()
        toast.success('Proposals CSV downloaded')
      } else if (exportId === 'overview-json') {
        await downloadOverviewJson()
        toast.success('Overview JSON downloaded')
      } else if (exportId === 'treasury-csv') {
        await downloadTreasuryCsv()
        toast.success('Treasury CSV downloaded')
      } else {
        throw new Error('Unknown export')
      }
    } catch (error) {
      toast.error(
        `Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      setLoadingState((prev) => ({ ...prev, [exportId]: false }))
    }
  }

  const exports = [
    {
      id: 'proposals-csv',
      title: 'Proposals CSV',
      description: 'Export all indexed proposals for audit and analysis',
      icon: FileSpreadsheet,
      format: 'CSV',
      fields: ['id', 'index', 'block', 'section', 'method', 'proposer', 'status'],
      badge: null,
      enabled: true,
    },
    {
      id: 'overview-json',
      title: 'Overview JSON',
      description: 'Summary of current indexing state and governance metrics',
      icon: FileJson,
      format: 'JSON',
      fields: ['blocks', 'extrinsics', 'proposals', 'votes', 'treasury'],
      badge: null,
      enabled: true,
    },
    {
      id: 'treasury-csv',
      title: 'Treasury CSV',
      description: 'Export all treasury spends and beneficiaries',
      icon: FileText,
      format: 'CSV',
      fields: ['id', 'block', 'beneficiary', 'amount_raw', 'asset_symbol', 'decimals', 'amount_display', 'display_status'],
      badge: null,
      enabled: true,
    },
  ]

  return (
    <DashboardLayout>
      <Header title="Exports" showSearch={false} />
      <main className="p-6 space-y-8">
        {/* Intro Text */}
        <div className="max-w-2xl">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Download governance and indexing data for reports, grants, and offline analysis.
          </p>
        </div>

        {/* Export Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exports.map((exp) => {
            const IconComponent = exp.icon
            const isLoading = loadingState[exp.id]

            return (
              <Card
                key={exp.id}
                className="bg-card border-border p-6 flex flex-col justify-between space-y-4"
              >
                {/* Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-muted/50 rounded-lg">
                        <IconComponent className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {exp.title}
                        </h3>
                        {exp.badge && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {exp.badge}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {exp.description}
                  </p>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                      {exp.format}
                    </span>
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Fields:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {exp.fields.map((field, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-xs font-mono text-foreground bg-muted/30 border-border"
                      >
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Download Button */}
                <Button
                  onClick={() => handleDownload(exp.id)}
                  disabled={!exp.enabled || isLoading}
                  className="w-full gap-2"
                  size="sm"
                >
                  <Download className="h-4 w-4" />
                  {isLoading ? 'Downloading...' : 'Download'}
                </Button>
              </Card>
            )
          })}
        </div>
      </main>
    </DashboardLayout>
  )
}

