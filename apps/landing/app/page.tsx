import Header from '@/components/header'
import Hero from '@/components/hero'
import TrustStrip from '@/components/trust-strip'
import Features from '@/components/features'
import UseCases from '@/components/use-cases'
import HowItWorks from '@/components/how-it-works'
import DemoVideo from '@/components/demo-video'
import Security from '@/components/security'
import Pricing from '@/components/pricing'
import FAQ from '@/components/faq'
import CTABanner from '@/components/cta-banner'
import Footer from '@/components/footer'

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Header />
      <Hero />
      <TrustStrip />
      <Features />
      <UseCases />
      <HowItWorks />
      <DemoVideo />
      <Security />
      <Pricing />
      <FAQ />
      <CTABanner />
      <Footer />
    </main>
  )
}
