'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TimelineStepper } from '@/components/timeline-stepper'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ArrowLeft, Copy, Download, ChevronDown, Code2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { api, type ProposalDetail } from '@/lib/api'
import { useParams } from 'next/navigation'

function truncateAddress(addr: string, chars = 8): string {
  if (addr.length <= chars * 2) return addr
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

function copyToClipboard(text: string, toast: any) {
  navigator.clipboard.writeText(text)
  toast({
    description: 'Copied to clipboard',
    duration: 2000,
  })
}

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>()
  const proposalId = params?.id
  const [proposal, setProposal] = useState<ProposalDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPayloadOpen, setIsPayloadOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let mounted = true
    if (!proposalId) return
    ;(async () => {
      try {
        const data = await api.getProposalDetail(proposalId)
        if (mounted) setProposal(data)
      } catch (e) {
        toast({
          title: 'Failed to load proposal',
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
  }, [proposalId, toast])

  if (loading) {
    return (
      <DashboardLayout>
        <Header title="Proposal" showSearch={false} />
        <main className="p-6 text-sm text-muted-foreground">Loading proposal…</main>
      </DashboardLayout>
    )
  }

  if (!proposal) {
    return (
      <DashboardLayout>
        <Header title="Proposal" showSearch={false} />
        <main className="p-6">
          <Card className="bg-card border-border p-6">
            <p className="text-sm text-muted-foreground">Proposal not found or failed to load.</p>
            <div className="mt-4">
              <Link href="/proposals">
                <Button variant="outline">Back to Proposals</Button>
              </Link>
            </div>
          </Card>
        </main>
      </DashboardLayout>
    )
  }

  const timelineSteps =
    proposal.timeline?.length > 0
      ? proposal.timeline.map((step: any) => ({
          label: step.label,
          description: step.description,
          completed: !!step.completed,
          current: !!step.current,
        }))
      : [
          {
            label: 'Submitted',
            description: `Block #${proposal.block_number}`,
            completed: true,
            current: false,
          },
          {
            label: 'Voting',
            description: `${proposal.votes?.length || 0} vote(s)`,
            completed: (proposal.votes?.length || 0) > 0,
            current: true,
          },
          {
            label: 'Outcome',
            description: proposal.outcome || proposal.status || 'Pending',
            completed: ['Approved', 'Rejected'].includes(proposal.status || ''),
            current: false,
          },
        ]

  const voteColors: Record<string, string> = {
    Aye: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    Nay: 'bg-red-500/20 text-red-300 border-red-500/30',
  }

  return (
    <DashboardLayout>
      {/* Header with Back Link */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/proposals">
            <Button variant="ghost" size="sm" className="gap-1 text-accent hover:text-accent">
              <ArrowLeft className="h-4 w-4" />
              Back to Proposals
            </Button>
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Proposal #{proposal.proposal_index}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {proposal.section}.{proposal.method} • Block #{proposal.block_number}
            </p>
          </div>
          <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
            {proposal.status}
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Summary Card */}
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Summary</h2>

              <div className="space-y-6">
                {/* Proposer */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Proposer
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="text-sm font-mono bg-input px-3 py-2 rounded border border-border text-foreground">
                      {proposal.proposer}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => copyToClipboard(proposal.proposer, toast)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Created Block */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Created Block
                  </label>
                  <p className="mt-2 text-sm font-mono text-foreground">#{proposal.block_number}</p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Description
                  </label>
                  <p className="mt-2 text-sm text-foreground leading-relaxed">
                    {proposal.description || '—'}
                  </p>
                </div>
              </div>
            </Card>

            {/* Timeline */}
            <Card className="bg-card border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Timeline</h2>
              <TimelineStepper steps={timelineSteps} />
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Votes Table */}
            <Card className="bg-card border-border overflow-hidden">
              <div className="p-6 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Votes</h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-border hover:bg-transparent">
                      <TableHead className="text-xs text-muted-foreground">Voter</TableHead>
                      <TableHead className="text-xs text-muted-foreground">Vote</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(proposal.votes || []).length === 0 ? (
                      <TableRow className="border-b-border">
                        <TableCell colSpan={2} className="text-xs text-muted-foreground py-6 text-center">
                          No votes indexed for this proposal yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      (proposal.votes || []).map((vote: any, idx: number) => (
                        <TableRow key={vote.id || idx} className="border-b-border">
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono text-muted-foreground">
                                {truncateAddress(vote.voter, 6)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(vote.voter, toast)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant="outline"
                                className={voteColors[vote.vote] || 'bg-muted text-muted-foreground'}
                                size="sm"
                              >
                                {vote.vote}
                              </Badge>
                              {vote.balance && vote.balance !== '0' && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {vote.balance}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Raw Payload Collapsible */}
            <Collapsible open={isPayloadOpen} onOpenChange={setIsPayloadOpen}>
              <Card className="bg-card border-border overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full px-6 py-4 border-b border-border hover:bg-muted/50 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-2 text-foreground">
                      <Code2 className="h-4 w-4" />
                      <span className="text-sm font-semibold">View indexed payload</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        isPayloadOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-6 bg-input/50 border-t border-border">
                    <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-96 overflow-y-auto">
                      {JSON.stringify(proposal.raw || proposal, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Export Button */}
            <Button
              variant="outline"
              className="w-full border-border text-foreground hover:bg-card gap-2"
            >
              <Download className="h-4 w-4" />
              Export this proposal
            </Button>
          </div>
        </div>
      </main>
    </DashboardLayout>
  )
}
