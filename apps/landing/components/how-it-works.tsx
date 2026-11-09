import { ArrowRight } from 'lucide-react'
import Container from '@/components/container'

export default function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Chain Data Ingestion',
      description:
        'PolkAudit connects to the Polkadot blockchain and ingests finalized blocks, extracting governance and treasury events in real time.',
    },
    {
      number: '02',
      title: 'Structured Storage & API',
      description:
        'Data is normalized and stored in a queryable database. Accessible via REST API with comprehensive filtering and search capabilities.',
    },
    {
      number: '03',
      title: 'Dashboard & Exports',
      description:
        'Visualize trends in a real-time dashboard. Export audit-ready reports in CSV or JSON format on demand.',
    },
  ]

  return (
    <section id="how-it-works" className="bg-background py-12 sm:py-16 lg:py-20 xl:py-24">
      <Container>
        <div className="text-center mb-8 sm:mb-12 lg:mb-14">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            A straightforward pipeline from blockchain to auditable insights.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 relative">
          {steps.map((step, idx) => (
            <div key={step.number} className="relative">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-lg bg-accent text-accent-foreground font-bold text-lg sm:text-xl">
                    {step.number}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground mb-2 sm:mb-3">
                    {step.title}
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden md:block absolute -right-4 top-8 transform translate-x-full">
                  <ArrowRight className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
