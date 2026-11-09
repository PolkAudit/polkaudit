'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'polkaudit_overview_banner_dismissed'

const MESSAGE =
  'Live Polkadot indexing · Data from finalized blocks · Built for governance transparency'

export function OverviewBanner() {
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setShow(localStorage.getItem(STORAGE_KEY) !== '1')
    } catch {
      setShow(true)
    }
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  if (show !== true) return null

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 rounded-md border border-border/80',
        'bg-muted/30 px-3 py-2 text-xs text-muted-foreground'
      )}
    >
      <p className="flex-1 leading-relaxed">{MESSAGE}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Dismiss banner"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
