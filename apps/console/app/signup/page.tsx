'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SignupDisabledPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-sm bg-card border-border p-8 space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Invite only</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            PolkAudit Console is for platform admins. Public sign-up is disabled.
            Ask an existing admin to create your account, or email{' '}
            <a className="text-accent hover:underline" href="mailto:hello@polkaudit.xyz">
              hello@polkaudit.xyz
            </a>
            .
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </Card>
    </div>
  )
}
