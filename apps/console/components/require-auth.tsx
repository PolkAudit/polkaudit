'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getAuthToken } from '@/lib/api'
import { Loader2 } from 'lucide-react'

const PUBLIC_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email']

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isPublic = PUBLIC_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    )
    if (isPublic) {
      setReady(true)
      return
    }
    if (!getAuthToken()) {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [pathname, router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    )
  }

  return <>{children}</>
}
