'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  KeyRound,
  CreditCard,
  Settings,
  Menu,
  Bell,
  Users,
  FolderKanban,
  Wallet,
  Building2,
  UsersRound,
  Mail,
  Receipt,
  ExternalLink,
} from 'lucide-react'
import { ProjectSwitcher } from '@/components/project-switcher'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  fetchCurrentUser,
  fetchHealth,
  getApiBase,
  getAuthToken,
  getDashboardUrl,
} from '@/lib/api'
import { useEffect, useState } from 'react'

type NavItem = {
  label: string
  href: string
  icon: typeof Home
  adminOnly?: boolean
  external?: boolean
}

const mainNav: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'API keys', href: '/keys', icon: KeyRound },
  { label: 'Billing', href: '/billing', icon: CreditCard },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const adminNav: NavItem[] = [
  { label: 'Onboard tenant', href: '/admin/tenants', icon: Building2, adminOnly: true },
  { label: 'Memberships', href: '/admin/memberships', icon: UsersRound, adminOnly: true },
  { label: 'Users', href: '/admin/users', icon: Users, adminOnly: true },
  { label: 'Projects', href: '/admin/projects', icon: FolderKanban, adminOnly: true },
  { label: 'Platform billing', href: '/admin/billing', icon: Wallet, adminOnly: true },
  { label: 'Payments', href: '/admin/payments', icon: Receipt, adminOnly: true },
  { label: 'SMTP', href: '/admin/smtp', icon: Mail, adminOnly: true },
]

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavList({
  items,
  pathname,
}: {
  items: NavItem[]
  pathname: string
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = !item.external && isActivePath(pathname, item.href)
        return (
          <li key={item.href}>
            {item.external ? (
              <a href={item.href} target="_blank" rel="noreferrer">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-sidebar-foreground rounded-lg transition-all duration-150 relative hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm">{item.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-60" />
                </Button>
              </a>
            ) : (
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
            )}
          </li>
        )
      })}
    </ul>
  )
}

function SidebarBrand() {
  return (
    <div className="px-8 py-6 border-b border-sidebar-border">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
          PolkAudit Console
        </h1>
        <p className="text-xs text-sidebar-foreground/60 uppercase tracking-wide">
          Account &amp; Admin
        </p>
      </div>
    </div>
  )
}

function SidebarFooter({
  apiStatus,
  apiBase,
}: {
  apiStatus: 'OK' | 'DOWN' | 'UNKNOWN'
  apiBase: string
}) {
  return (
    <div className="px-8 py-6 border-t border-sidebar-border space-y-4">
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/40">
        <div
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            apiStatus === 'OK'
              ? 'bg-emerald-500 animate-pulse'
              : apiStatus === 'DOWN'
                ? 'bg-destructive'
                : 'bg-muted-foreground'
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-sidebar-foreground">API</p>
          <p className="text-xs text-sidebar-foreground/60">
            {apiStatus === 'OK' ? 'Operational' : apiStatus === 'DOWN' ? 'Down' : 'Unknown'}
          </p>
        </div>
      </div>
      <Separator className="bg-sidebar-border/60" />
      <p className="text-xs text-sidebar-foreground/50 truncate font-mono">{apiBase}</p>
    </div>
  )
}

function useConsoleNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [apiStatus, setApiStatus] = useState<'OK' | 'DOWN' | 'UNKNOWN'>('UNKNOWN')
  const apiBase = getApiBase()

  useEffect(() => {
    if (!getAuthToken()) return
    fetchCurrentUser()
      .then((u) => setIsAdmin(u.role === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [pathname])

  useEffect(() => {
    const check = async () => {
      try {
        await fetchHealth()
        setApiStatus('OK')
      } catch {
        setApiStatus('DOWN')
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [])

  const items = [
    ...mainNav,
    ...(isAdmin ? adminNav : []),
    {
      label: 'Open dashboard',
      href: getDashboardUrl(),
      icon: ExternalLink,
      external: true,
    } as NavItem,
  ]

  return { pathname, items, apiStatus, apiBase }
}

export function DesktopSidebar() {
  const { pathname, items, apiStatus, apiBase } = useConsoleNav()

  return (
    <aside className="hidden md:flex w-72 h-screen flex-col bg-sidebar border-r border-sidebar-border fixed left-0 top-0 shadow-lg">
      <SidebarBrand />
      <div className="px-4 pt-4">
        <ProjectSwitcher />
      </div>
      <nav className="flex-1 px-4 py-4 overflow-y-auto">
        <NavList items={items} pathname={pathname} />
      </nav>
      <SidebarFooter apiStatus={apiStatus} apiBase={apiBase} />
    </aside>
  )
}

export function MobileSidebar() {
  const { pathname, items, apiStatus, apiBase } = useConsoleNav()

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
          <SidebarBrand />
          <div className="px-4 pt-4">
            <ProjectSwitcher />
          </div>
          <nav className="flex-1 px-4 py-4 overflow-y-auto">
            <NavList items={items} pathname={pathname} />
          </nav>
          <SidebarFooter apiStatus={apiStatus} apiBase={apiBase} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
