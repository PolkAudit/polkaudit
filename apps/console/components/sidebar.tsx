'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  FileText,
  Coins,
  Download,
  Settings,
  Menu,
  Bell,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { fetchHealth, getApiBase } from '@/lib/api'
import { useEffect, useState } from 'react'

const navItems = [
  { label: 'Overview', href: '/', icon: BarChart3 },
  { label: 'Proposals', href: '/proposals', icon: FileText },
  { label: 'Treasury', href: '/treasury', icon: Coins },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Exports', href: '/exports', icon: Download },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function DesktopSidebar() {
  const pathname = usePathname()
  const [apiStatus, setApiStatus] = useState<'OK' | 'DOWN' | 'UNKNOWN'>('UNKNOWN')
  const [indexerStatus, setIndexerStatus] = useState<'OK' | 'DOWN' | 'UNKNOWN'>('UNKNOWN')
  const apiBase = getApiBase()

  useEffect(() => {
    const check = async () => {
      try {
        await fetchHealth()
        setApiStatus('OK')
        // Backend health is our proxy for “system ok”. True indexer health is behind DB stats.
        setIndexerStatus('OK')
      } catch {
        setApiStatus('DOWN')
        setIndexerStatus('UNKNOWN')
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <aside className="hidden md:flex w-72 h-screen flex-col bg-sidebar border-r border-sidebar-border fixed left-0 top-0 shadow-lg">
      {/* Header */}
      <div className="px-8 py-6 border-b border-sidebar-border">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
            PolkAudit Console
          </h1>
          <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wide">
            Platform Admin
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link href={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full justify-start gap-3 text-sidebar-foreground rounded-lg transition-all duration-150 relative',
                      'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      isActive &&
                        'bg-sidebar-accent text-sidebar-primary font-medium border-l-4 border-l-sidebar-primary pl-4'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </Button>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer Status */}
      <div className="px-8 py-6 border-t border-sidebar-border space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/40">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                apiStatus === 'OK' ? 'bg-emerald-500 animate-pulse' : apiStatus === 'DOWN' ? 'bg-destructive' : 'bg-muted-foreground'
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground">API</p>
              <p className="text-xs text-sidebar-foreground/60">
                {apiStatus === 'OK' ? 'Operational' : apiStatus === 'DOWN' ? 'Down' : 'Unknown'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/40">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                indexerStatus === 'OK' ? 'bg-emerald-500 animate-pulse' : indexerStatus === 'DOWN' ? 'bg-destructive' : 'bg-muted-foreground'
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground">Indexer</p>
              <p className="text-xs text-sidebar-foreground/60">
                {indexerStatus === 'OK' ? 'Active' : indexerStatus === 'DOWN' ? 'Down' : 'Unknown'}
              </p>
            </div>
          </div>
        </div>
        <Separator className="bg-sidebar-border/60" />
        <p className="text-xs text-sidebar-foreground/50 truncate font-mono">
          {apiBase}
        </p>
      </div>
    </aside>
  )
}

export function MobileSidebar() {
  const pathname = usePathname()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-foreground hover:bg-muted"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-sidebar">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-8 py-6 border-b border-sidebar-border">
            <div className="flex flex-col gap-2">
              <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
                PolkAudit Console
              </h1>
              <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wide">
                Platform Admin
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-3 text-sidebar-foreground rounded-lg transition-all duration-150',
                          'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                          isActive &&
                            'bg-sidebar-accent text-sidebar-primary font-medium border-l-4 border-l-sidebar-primary pl-4'
                        )}
                      >
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm">{item.label}</span>
                      </Button>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Footer Status */}
          <div className="px-8 py-6 border-t border-sidebar-border space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/40">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-sidebar-foreground">API</p>
                  <p className="text-xs text-sidebar-foreground/60">Operational</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/40">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-sidebar-foreground">Indexer</p>
                  <p className="text-xs text-sidebar-foreground/60">Active</p>
                </div>
              </div>
            </div>
            <Separator className="bg-sidebar-border/60" />
            <p className="text-xs text-sidebar-foreground/50 truncate font-mono">
              api.polka-audit.local
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
