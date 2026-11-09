import { Database, BarChart3, Download, Lock, Globe } from 'lucide-react'
import Container from '@/components/container'

export default function Features() {
  const features = [
    {
      icon: Database,
      title: 'Live Finalized Block Indexing',
      description:
        'Continuously index and process finalized blocks from the Polkadot chain with zero data loss.',
    },
    {
      icon: BarChart3,
      title: 'Governance & Treasury Extraction',
      description:
        'Automatically extract and structure governance votes, treasury proposals, and spending activity.',
    },
    {
      icon: BarChart3,
      title: 'KPI Dashboard',
      description:
        'Visual dashboards for treasury balance trends, proposal velocity, and governance participation metrics.',
    },
    {
      icon: Download,
      title: 'CSV & JSON Exports',
      description:
        'Download comprehensive audit-ready reports in standard formats for compliance and analysis.',
    },
    {
      icon: Lock,
      title: 'API with Key-Based Access',
      description:
        'Programmatic access to governance and treasury data with secure, rotatable API keys.',
    },
    {
      icon: Globe,
      title: 'Public Demo Ready',
      description:
        'Live dashboard and API for treasury teams, auditors, and ecosystem reviewers—no local setup required.',
    },
  ]

  return (
    <section id="product" className="bg-background py-12 sm:py-16 lg:py-20 xl:py-24">
      <Container>
        <div className="text-center mb-8 sm:mb-12 lg:mb-14">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4 text-balance max-w-5xl mx-auto">
            Core Product Features
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need for governance transparency and treasury accountability.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="flex h-full flex-col p-6 sm:p-8 rounded-lg border border-border bg-card hover:border-accent/50 hover:bg-secondary/30 transition-all group"
              >
                <div className="mb-4">
                  <Icon className="w-9 h-9 sm:w-10 sm:h-10 text-accent group-hover:text-primary transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
