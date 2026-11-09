'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { verifyEmailToken } from '@/lib/api'

function VerifyEmailInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Missing verification token')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await verifyEmailToken(token)
        if (cancelled) return
        setStatus('ok')
        setMessage(res.message || 'Email verified')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setMessage(e instanceof Error ? e.message : 'Verification failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <Card className="w-full max-w-sm bg-card border-border p-8 space-y-4 text-center">
      <h1 className="text-xl font-bold text-foreground">Verify email</h1>
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying…
        </div>
      )}
      {status === 'ok' && (
        <div className="space-y-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild className="w-full">
            <Link href="/">Go to dashboard</Link>
          </Button>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-3">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/settings">Open settings</Link>
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Suspense
        fallback={
          <Card className="w-full max-w-sm bg-card border-border p-8 text-center text-sm text-muted-foreground">
            Loading…
          </Card>
        }
      >
        <VerifyEmailInner />
      </Suspense>
    </div>
  )
}
