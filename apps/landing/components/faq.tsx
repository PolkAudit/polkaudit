'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Container from '@/components/container'

export default function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  const faqs = [
    {
      q: 'Is this another Polkadot block explorer?',
      a: 'No. While explorers show transaction details, PolkAudit specializes in governance and treasury transparency. We extract and structure votes, proposals, treasury events, and spending patterns—not general transaction data.',
    },
    {
      q: 'Why are governance rows sometimes zero?',
      a: 'Governance rows populate only when matching OpenGov extrinsics are present in the indexed block range. During shorter windows you may see zero governance rows while total blocks and extrinsics still increase.',
    },
    {
      q: 'Is the data real-time?',
      a: 'We index finalized blocks within seconds of finalization. Finalized means irreversible on the Polkadot relay chain, ensuring data integrity for audit purposes.',
    },
    {
      q: 'Can we self-host?',
      a: 'Yes. For Enterprise customers, we provide containerized packaging (Docker) and deployment guidance for your own infrastructure.',
    },
    {
      q: 'Is this open source?',
      a: 'Yes. PolkAudit is open source under the Apache 2.0 license. Teams can self-host, while managed deployment and support are available for organizations that want a hosted option.',
    },
    {
      q: 'How do pilots work?',
      a: 'Most pilots run for 2-3 months with a fixed scope and discounted pricing. You get onboarding, shared success criteria, weekly check-ins, and a conversion option to Starter, Pro, or Enterprise.',
    },
  ]

  return (
    <section id="faq" className="bg-card border-t border-border py-12 sm:py-16 lg:py-20 xl:py-24">
      <Container size="narrow">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Frequently Asked Questions
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Common questions about PolkAudit and how it works.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={faq.q}
              className="border border-border rounded-lg overflow-hidden bg-background hover:border-accent/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-secondary/30 transition-colors"
                aria-expanded={openIdx === idx}
              >
                <h3 className="font-semibold text-foreground text-sm sm:text-base pr-2">
                  {faq.q}
                </h3>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 ${
                    openIdx === idx ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openIdx === idx && (
                <div className="px-4 sm:px-6 py-4 bg-secondary/20 border-t border-border">
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
