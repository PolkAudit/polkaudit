import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface KPICardProps {
  icon: LucideIcon
  label: string
  value: string
  subtitle: string
  badge?: {
    text: string
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  }
  trend?: {
    direction: 'up' | 'down'
    value: string
  }
}

export function KPICard({
  icon: Icon,
  label,
  value,
  subtitle,
  badge,
  trend,
}: KPICardProps) {
  return (
    <Card className="p-6 bg-card border border-border rounded-lg shadow-md hover:shadow-lg hover:border-accent/70 transition-all duration-150">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="p-2.5 bg-accent/15 rounded-lg">
            <Icon className="h-5 w-5 text-accent" />
          </div>
          {badge && (
            <Badge variant={badge.variant || 'default'} className="text-xs font-medium">
              {badge.text}
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {trend && (
              <div
                className={`flex items-center gap-1 text-xs font-bold ${
                  trend.direction === 'up' ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {trend.direction === 'up' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend.value}
              </div>
            )}
          </div>
          <p className="text-3xl font-bold text-foreground leading-tight">{value}</p>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>
    </Card>
  )
}
