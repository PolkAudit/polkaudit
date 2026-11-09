'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, ExternalLink, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { getConsoleUrl, setApiKeyOverride } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const consoleUrl = getConsoleUrl()
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleApiKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      toast.error('Please enter an API key')
      return
    }
    setIsLoading(true)
    try {
      setApiKeyOverride(apiKey.trim(), true)
      toast.success('API key saved')
      router.push('/')
    } catch {
      toast.error('Authentication failed')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-sm bg-card border-border p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-foreground">PolkAudit</h1>
          <p className="text-xs text-muted-foreground">
            Governance dashboard — accounts live in Console
          </p>
        </div>

        <Button asChild className="w-full gap-2" size="lg">
          <a href={`${consoleUrl}/login`}>
            Sign in with account
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          No account?{' '}
          <a href={`${consoleUrl}/signup`} className="text-accent hover:underline">
            Create one in Console
          </a>
        </p>

        <div className="border-t border-border pt-4 space-y-4">
          <p className="text-xs text-muted-foreground text-center uppercase tracking-wide">
            Or use an API key
          </p>
          <form onSubmit={handleApiKeyLogin} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="api-key"
                className="text-xs font-medium text-muted-foreground uppercase"
              >
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
            <Button type="submit" disabled={isLoading} variant="outline" className="w-full gap-2">
              {isLoading ? (
                'Saving…'
              ) : (
                <>
                  Continue with key
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
