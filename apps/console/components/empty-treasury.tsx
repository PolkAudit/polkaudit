import { Card } from '@/components/ui/card'
import { Calendar } from 'lucide-react'

interface EmptyTreasuryProps {
  compact?: boolean
}

export function EmptyTreasury({ compact = false }: EmptyTreasuryProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Calendar className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <h3 className="text-xs font-medium text-foreground">No treasury spends</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Treasury disbursements will appear as they are indexed from the blockchain.
        </p>
      </div>
    )
  }

  return (
    <Card className="bg-card border-border p-12">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-lg bg-muted/30 flex items-center justify-center mb-4">
          <Calendar className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">
          No treasury spends indexed in this range
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Treasury disbursements will appear here as they are indexed from the blockchain.
        </p>
      </div>
    </Card>
  )
}
