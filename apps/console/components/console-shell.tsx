'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clearSession, getAuthToken, getDashboardUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    setSignedIn(!!getAuthToken())
  }, [pathname])

  const logout = () => {
    clearSession()
    setSignedIn(false)
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-foreground">
              PolkAudit Console
            </Link>
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link
                href="/"
                className={cn(
                  'text-muted-foreground hover:text-foreground',
                  pathname === '/' && 'text-foreground'
                )}
              >
                Home
              </Link>
              <Link
                href="/settings"
                className={cn(
                  'text-muted-foreground hover:text-foreground',
                  pathname === '/settings' && 'text-foreground'
                )}
              >
                Settings
              </Link>
              <a
                href={getDashboardUrl()}
                className="text-muted-foreground hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                Open dashboard
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Button variant="outline" size="sm" onClick={logout}>
                Sign out
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  )
}
