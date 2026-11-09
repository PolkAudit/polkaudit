import { Zap, FileText, Key, Cloud } from 'lucide-react'
import Container from '@/components/container'

export default function TrustStrip() {
  const trustItems = [
    {
      icon: Zap,
      label: 'Live Indexing',
      description: 'Real-time finalized block ingestion',
    },
    {
      icon: FileText,
      label: 'Audit Exports',
      description: 'CSV and JSON report generation',
    },
    {
      icon: Key,
      label: 'API Access',
      description: 'Key-based authenticated endpoints',
    },
    {
      icon: Cloud,
      label: 'Hybrid Deployment',
      description: 'Oracle, Neon, or Cloud Run options',
    },
  ]

  return (
    <section className="bg-card border-t border-border py-12 sm:py-14 lg:py-16">
      <Container>
        <div className="text-center mb-8 sm:mb-10 lg:mb-12">
          <p className="text-sm font-medium text-accent uppercase tracking-wide">
            Trusted by Teams
          </p>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground mt-2 text-balance max-w-5xl mx-auto">
            Built for Treasury Teams, Grantees, Auditors, and Ecosystem Reviewers
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {trustItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex h-full flex-col p-5 sm:p-6 rounded-lg bg-background border border-border hover:border-accent/50 transition-colors text-center"
              >
                <Icon className="w-8 h-8 text-accent mx-auto mb-3 sm:mb-4 shrink-0" />
                <h3 className="font-semibold text-foreground mb-2">{item.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed grow">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
