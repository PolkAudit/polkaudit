import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { siteConfig } from '@/lib/site'
import Container from '@/components/container'

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-background py-10 sm:py-12 lg:py-14 xl:py-16"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(900px,120vw)] h-[480px] bg-gradient-to-b from-accent/20 via-accent/5 to-transparent rounded-full blur-3xl opacity-50" />
      </div>

      <Container className="relative">
        <div className="grid items-center gap-7 sm:gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-10 xl:gap-12">
          <div className="space-y-4 sm:space-y-5 text-center lg:text-left order-1">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] xl:text-5xl font-bold tracking-tight text-balance leading-[1.12]">
              Governance Transparency for Polkadot Teams
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed">
              Index finalized blocks in real time. Extract governance and treasury activity.
              Export comprehensive audit reports. Built for teams that need accountability and
              evidence.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-0.5 justify-center lg:justify-start">
              <a
                href={`mailto:${siteConfig.links.contact}`}
                className="inline-flex min-h-11 items-center justify-center px-6 py-3 text-base font-medium rounded-lg bg-accent text-accent-foreground hover:bg-primary transition-colors"
              >
                Book Demo
                <ArrowRight className="ml-2 w-5 h-5" />
              </a>
              <a
                href={siteConfig.links.dashboard}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center px-6 py-3 text-base font-medium rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors"
              >
                Open Live Dashboard
              </a>
            </div>
          </div>

          <div className="relative order-2 w-full min-w-0 rounded-xl border border-border bg-card shadow-2xl shadow-accent/10 overflow-hidden ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 sm:px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" aria-hidden />
              <span className="ml-2 text-xs font-mono text-muted-foreground truncate">
                app.polkaudit.xyz — Overview
              </span>
            </div>
            <div className="relative aspect-[16/10] w-full">
              <Image
                src="/overview.png"
                alt="PolkAudit dashboard showing live blocks indexed, extrinsics, and governance KPIs"
                fill
                priority
                className="object-cover object-top"
                sizes="(max-width: 1024px) 100vw, (max-width: 1600px) 58vw, 900px"
              />
            </div>
            <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 rounded-full border border-accent/30 bg-background/90 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-accent backdrop-blur-sm">
              Live product screenshot
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
