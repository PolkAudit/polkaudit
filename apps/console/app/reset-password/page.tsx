'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { resetPassword } from '@/lib/api'

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast.error('Missing reset token')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      await resetPassword(token, password)
      toast.success('Password updated — sign in')
      router.push('/login')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reset failed')
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm bg-card border-border p-8 space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
        <p className="text-xs text-muted-foreground">Choose a new password for your account.</p>
      </div>

      {!token ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">This link is missing a token.</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm" className="text-xs font-medium text-muted-foreground uppercase">
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full" size="lg">
            {isLoading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      )}

      <p className="text-xs text-muted-foreground text-center">
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Suspense
        fallback={
          <Card className="w-full max-w-sm bg-card border-border p-8 text-center text-sm text-muted-foreground">
            Loading…
          </Card>
        }
      >
        <ResetPasswordInner />
      </Suspense>
    </div>
  )
}
