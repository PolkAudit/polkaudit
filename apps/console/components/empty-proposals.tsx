import { Card } from '@/components/ui/card'
import { FileText } from 'lucide-react'

interface EmptyProposalsProps {
  compact?: boolean
}

export function EmptyProposals({ compact = false }: EmptyProposalsProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <h3 className="text-xs font-medium text-foreground">No proposals yet</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Indexing is active; proposals appear when OpenGov activity is found.
        </p>
      </div>
    )
  }

  return (
    <Card className="bg-card border-border p-12">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-lg bg-muted/30 flex items-center justify-center mb-4">
          <FileText className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">
          No governance proposals yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Blocks and extrinsics are indexing; proposals appear when OpenGov activity is found.
        </p>
      </div>
    </Card>
  )
}
