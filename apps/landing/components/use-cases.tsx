import { TrendingUp, CheckCircle, Search, Eye } from 'lucide-react'
import Container from '@/components/container'

export default function UseCases() {
  const useCases = [
    {
      icon: TrendingUp,
      title: 'Treasury Reporting',
      description:
        'Automated monthly reports on treasury balance, spending patterns, and fund allocation to stakeholders.',
    },
    {
      icon: CheckCircle,
      title: 'Grantee Accountability',
      description:
        'Track grant disbursements, milestones, and spending verification with auditable records.',
    },
    {
      icon: Search,
      title: 'Auditor Due Diligence',
      description:
        'Comprehensive governance and financial data for third-party audits and compliance reviews.',
    },
    {
      icon: Eye,
      title: 'Ecosystem Intelligence',
      description:
        'Understand governance trends and treasury health across the Polkadot ecosystem.',
    },
  ]

  return (
    <section id="use-cases" className="bg-card border-y border-border py-12 sm:py-16 lg:py-20 xl:py-24">
      <Container>
        <div className="text-center mb-8 sm:mb-12 lg:mb-14">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Use Cases
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Designed for diverse stakeholders in the Polkadot ecosystem.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {useCases.map((useCase) => {
            const Icon = useCase.icon
            return (
              <div
                key={useCase.title}
                className="flex h-full flex-col p-5 sm:p-6 rounded-lg bg-background border border-border hover:border-accent/50 transition-colors"
              >
                <Icon className="w-8 h-8 text-accent mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {useCase.description}
                </p>
              </div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
