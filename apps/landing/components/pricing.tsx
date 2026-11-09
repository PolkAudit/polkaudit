import { Check } from 'lucide-react'
import { siteConfig } from '@/lib/site'
import Container from '@/components/container'

export default function Pricing() {
  const tiers = [
    {
      name: 'Pilot',
      description: 'Best for first-time design partners',
      price: '$500-$1,500',
      cadence: '/ 3 months',
      ctaLabel: 'Apply for Pilot',
      features: [
        '30-60 day onboarding support',
        '1 project workspace',
        'Live dashboard access',
        'CSV/JSON exports',
        'Monthly governance review call',
      ],
    },
    {
      name: 'Starter',
      description: 'For small treasury or grant teams',
      price: '$99-$199',
      cadence: '/ month',
      ctaLabel: 'Start Starter Plan',
      features: [
        'Live block indexing',
        '1 tenant workspace',
        'Dashboard access',
        'CSV exports',
        'API access (5k req/month)',
        'Email support',
      ],
    },
    {
      name: 'Pro',
      description: 'For active treasury teams',
      price: '$399-$799',
      cadence: '/ month',
      ctaLabel: 'Talk to Sales',
      features: [
        'Everything in Starter',
        'API access (100k req/month)',
        'Governance analytics',
        'Scheduled exports',
        'Priority support',
        'Longer data retention',
      ],
      highlighted: true,
    },
    {
      name: 'Enterprise',
      description: 'For auditors, funds, and institutions',
      price: '$2,000+',
      cadence: '/ month',
      ctaLabel: 'Book Enterprise Call',
      features: [
        'Everything in Pro',
        'Dedicated environment option',
        'SLA and incident response',
        'SSO / access controls roadmap',
        'Custom integrations',
        'Dedicated support',
      ],
    },
  ]

  const oneTimePackages = [
    {
      name: 'Governance Audit Snapshot',
      price: '$1,500-$4,000',
      description:
        'One-time backfill and reporting pack for treasury or reviewer due diligence.',
      features: [
        'Historical backfill for selected range',
        'Export pack (CSV + JSON)',
        'Read-only dashboard link',
        'Delivery summary call',
      ],
    },
    {
      name: 'Custom Chain / Data Work',
      price: '$5,000-$15,000',
      description:
        'Optional implementation services for custom indexing, integrations, or reporting.',
      features: [
        'Scope definition workshop',
        'Milestone-based delivery',
        'Integration with internal workflows',
        'Handover documentation',
      ],
    },
  ]

  return (
    <section id="pricing" className="bg-background py-12 sm:py-16 lg:py-20 xl:py-24">
      <Container>
        <div className="text-center mb-8 sm:mb-12 lg:mb-14">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
            Pricing
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Start with a pilot, then move to monthly plans. Treasury-linked teams can pay in DOT
            equivalent at invoice time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative flex h-full flex-col rounded-lg border p-6 sm:p-8 transition-all ${
                tier.highlighted
                  ? 'bg-card border-accent shadow-lg'
                  : 'bg-card border-border hover:border-accent/50'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-block px-3 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded-full whitespace-nowrap">
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-xl font-bold text-foreground mb-2">{tier.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>

              <div className="mb-6">
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {tier.price}
                  <span className="text-sm font-normal text-muted-foreground">
                    {tier.cadence}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Final quote depends on scope and usage.
                </p>
              </div>

              <a
                href={`mailto:${siteConfig.links.contact}?subject=PolkAudit%20${encodeURIComponent(tier.name)}%20Plan`}
                className={`block w-full text-center py-2.5 px-4 rounded-lg font-medium transition-colors mb-6 sm:mb-8 ${
                  tier.highlighted
                    ? 'bg-accent text-accent-foreground hover:bg-primary'
                    : 'border border-border text-foreground hover:bg-secondary/50'
                }`}
              >
                {tier.ctaLabel}
              </a>

              <ul className="mt-auto space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {oneTimePackages.map((pkg) => (
            <div key={pkg.name} className="rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{pkg.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                </div>
                <div className="sm:text-right shrink-0">
                  <p className="text-lg font-semibold text-foreground">{pkg.price}</p>
                  <p className="text-xs text-muted-foreground">one-time</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {pkg.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground px-2">
          Need a custom structure? Email{' '}
          <a
            className="underline hover:text-foreground break-all"
            href={`mailto:${siteConfig.links.contact}`}
          >
            {siteConfig.links.contact}
          </a>{' '}
          for enterprise or partnership pricing.
        </p>
      </Container>
    </section>
  )
}
