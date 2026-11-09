'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { loginWithPassword, setApiKeyOverride } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'account' | 'apikey'>('account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (mode === 'account') {
        if (!email.trim() || !password) {
          toast.error('Email and password are required')
          setIsLoading(false)
          return
        }
        await loginWithPassword(email.trim(), password)
        toast.success('Signed in')
      } else {
        if (!apiKey.trim()) {
          toast.error('Please enter an API key')
          setIsLoading(false)
          return
        }
        setApiKeyOverride(apiKey.trim(), true)
        toast.success('API key saved')
      }
      router.push('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-background to-muted/50 flex-col justify-between p-8 relative overflow-hidden">
        <div className="relative z-10">
          <div className="space-y-2 mb-8">
            <h1 className="text-3xl font-bold text-foreground">PolkAudit</h1>
            <p className="text-sm text-muted-foreground">
              Governance transparency for Polkadot
            </p>
          </div>
        </div>
        <div className="relative z-10 space-y-4">
          <div className="border-t border-border/50 pt-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign in with your account, or use an API key for programmatic access.
            </p>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm bg-card border-border p-8 space-y-6">
          <div className="lg:hidden space-y-1 text-center mb-2">
            <h1 className="text-2xl font-bold text-foreground">PolkAudit</h1>
          </div>

          <div className="flex gap-2 p-1 bg-muted/40 rounded-lg">
            <button
              type="button"
              className={`flex-1 text-xs py-2 rounded-md ${mode === 'account' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setMode('account')}
            >
              Account
            </button>
            <button
              type="button"
              className={`flex-1 text-xs py-2 rounded-md ${mode === 'apikey' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setMode('apikey')}
            >
              API Key
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {mode === 'account' ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@org.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      disabled={isLoading}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9"
                      disabled={isLoading}
                      autoComplete="current-password"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label htmlFor="api-key" className="text-xs font-medium text-muted-foreground uppercase">
                  API Key
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="pk_… or demo key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pl-9"
                    disabled={isLoading}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}

            <Button type="submit" disabled={isLoading} className="w-full gap-2" size="lg">
              {isLoading ? 'Signing in…' : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            No account?{' '}
            <Link href="/signup" className="text-accent hover:underline">
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
