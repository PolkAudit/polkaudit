'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Copy, Search } from 'lucide-react'
import { EmptyProposals } from '@/components/empty-proposals'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/breadcrumb'
import { api, type Proposal as ApiProposal } from '@/lib/api'

type ProposalStatus = 'Active' | 'Approved' | 'Rejected' | 'Unknown'

const statusColors: Record<ProposalStatus, string> = {
  Active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
  Unknown: 'bg-muted text-muted-foreground border-border',
}

function truncateAddress(addr: string, chars = 8): string {
  if (addr.length <= chars * 2) return addr
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<ApiProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All')
  const { toast } = useToast()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await api.getProposals()
        if (mounted) setProposals(data)
      } catch (e) {
        toast({
          title: 'Failed to load proposals',
          description: e instanceof Error ? e.message : 'Unknown error',
          variant: 'destructive',
        })
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [toast])

  const filteredProposals = proposals.filter((proposal) => {
    const matchesSearch =
      proposal.proposal_index.toString().includes(searchQuery) ||
      `${proposal.section}.${proposal.method}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proposal.proposer.toLowerCase().includes(searchQuery.toLowerCase())

    if (filterStatus === 'All') return matchesSearch
    if (filterStatus === 'Active') return matchesSearch && proposal.status === 'Active'
    if (filterStatus === 'Closed')
      return matchesSearch && (proposal.status === 'Approved' || proposal.status === 'Rejected')
    return matchesSearch
  })

  const isEmpty = !loading && filteredProposals.length === 0 && proposals.length === 0

  return (
    <DashboardLayout>
      <Header title="Proposals" showSearch={false} />
      <main className="p-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb items={[{ label: 'Proposals' }]} className="px-2" />

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by index, proposer, method..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-input border border-border text-foreground placeholder:text-muted-foreground rounded-lg focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 flex-wrap">
          {(['All', 'Active', 'Closed'] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className={cn(
                'transition-all duration-150 text-sm font-medium',
                filterStatus === status
                  ? 'bg-accent text-accent-foreground border-accent shadow-md'
                  : 'border-border bg-card text-foreground hover:bg-muted/50'
              )}
            >
              {status}
            </Button>
          ))}
        </div>

        {/* Table or Empty State */}
        <Card className="border border-border rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading proposals…</div>
          ) : isEmpty ? (
            <EmptyProposals />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 border-b border-border hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Index
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Section.Method
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Proposer
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Block
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-3 px-6">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProposals.map((proposal, idx) => (
                    <TableRow
                      key={proposal.id}
                      className={cn(
                        'border-b border-border transition-colors duration-150 cursor-pointer',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                        'hover:bg-muted/40'
                      )}
                      onClick={() => {
                        window.location.href = `/proposals/${proposal.id}`
                      }}
                    >
                      <TableCell className="font-mono text-sm text-foreground py-3 px-6">
                        #{proposal.proposal_index}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground py-3 px-6">
                        {proposal.section}.{proposal.method}
                      </TableCell>
                      <TableCell className="text-sm py-3 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">
                            {truncateAddress(proposal.proposer)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-accent transition-colors duration-150"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyToClipboard(proposal.proposer)
                              toast({
                                description: 'Address copied to clipboard',
                                duration: 2000,
                              })
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground py-3 px-6">
                        {proposal.block_number}
                      </TableCell>
                      <TableCell className="py-3 px-6">
                        <Badge
                          variant="outline"
                          className={statusColors[((proposal.status as ProposalStatus) || 'Unknown')]}
                        >
                          {proposal.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>
    </DashboardLayout>
  )
}
