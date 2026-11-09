import Image from 'next/image'
import Link from 'next/link'
import { Play, ExternalLink } from 'lucide-react'
import { siteConfig } from '@/lib/site'
import { getYouTubeEmbedUrl, getYouTubeVideoId, getYouTubeWatchUrl } from '@/lib/youtube'
import Container from '@/components/container'

export default function DemoVideo() {
  const videoId = getYouTubeVideoId(siteConfig.links.demoVideo)
  const hasVideo = Boolean(videoId)

  return (
    <section id="demo" className="bg-card border-y border-border py-12 sm:py-16 lg:py-20 xl:py-24">
      <Container size="media">
        <div className="text-center mb-8 sm:mb-10 lg:mb-12">
          <p className="text-sm font-medium text-accent uppercase tracking-wide mb-2">
            Product walkthrough
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            See PolkAudit in action
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            A short demo of live Polkadot indexing, the governance dashboard, treasury views,
            and audit-ready exports — built for treasury teams, grantees, and reviewers.
          </p>
        </div>

        <div className="relative rounded-xl border border-border bg-background overflow-hidden shadow-2xl shadow-accent/5 ring-1 ring-white/5">
          {hasVideo && videoId ? (
            <>
              <div className="relative aspect-video w-full">
                <iframe
                  title="PolkAudit product demo on YouTube"
                  src={getYouTubeEmbedUrl(videoId)}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 bg-secondary/20">
                <p className="text-sm text-muted-foreground">
                  Prefer the live app? Open the dashboard and explore the same flows.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={getYouTubeWatchUrl(videoId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-primary transition-colors"
                  >
                    Watch on YouTube
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href={siteConfig.links.dashboard}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition-colors"
                  >
                    Open live dashboard
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="relative aspect-video w-full">
              <Image
                src="/overview.png"
                alt="PolkAudit dashboard preview — demo video coming soon"
                fill
                className="object-cover object-top opacity-60"
                sizes="(max-width: 896px) 100vw, 896px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-accent/40 bg-background/90 text-accent backdrop-blur-sm">
                  <Play className="h-7 w-7 fill-current ml-0.5" aria-hidden />
                </div>
                <div className="space-y-2 max-w-md">
                  <p className="text-lg font-semibold text-foreground">
                    Demo video coming soon
                  </p>
                  <p className="text-sm text-muted-foreground">
                    A 3–5 minute walkthrough will be published here. Until then, book a live
                    demo or explore the dashboard directly.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <a
                    href={`mailto:${siteConfig.links.contact}?subject=PolkAudit%20Live%20Demo%20Request`}
                    className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-primary transition-colors"
                  >
                    Book live demo
                  </a>
                  <Link
                    href={siteConfig.links.dashboard}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    Open live dashboard
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {!hasVideo && process.env.NODE_ENV === 'development' && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            After you upload to YouTube, set{' '}
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">
              NEXT_PUBLIC_DEMO_VIDEO_URL
            </code>{' '}
            in your landing env to embed the video here automatically.
          </p>
        )}
      </Container>
    </section>
  )
}
