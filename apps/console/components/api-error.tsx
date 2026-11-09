import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface ApiErrorProps {
  title?: string
  message?: string
  onRetry?: () => void
  compact?: boolean
}

export function ApiError({
  title = 'Backend unreachable',
  message = 'Unable to connect to the indexing backend. Please check your API configuration and try again.',
  onRetry,
  compact = false,
}: ApiErrorProps) {
  if (compact) {
    return (
      <Alert className="bg-red-600/10 border-red-600/30">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <AlertDescription className="text-red-400">
          <div className="flex items-center justify-between gap-2">
            <span>{title}</span>
            {onRetry && (
              <Button
                onClick={onRetry}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
              >
                <RotateCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="bg-red-600/5 border-red-600/30 p-8">
      <div className="flex gap-4">
        <div className="h-12 w-12 rounded-lg bg-red-600/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-400 mb-1">{title}</h3>
          <p className="text-sm text-red-300/80 mb-4">{message}</p>
          {onRetry && (
            <Button
              onClick={onRetry}
              size="sm"
              variant="outline"
              className="border-red-600/30 hover:bg-red-600/10"
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Retry connection
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
