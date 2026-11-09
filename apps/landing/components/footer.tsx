import { GitBranch, Mail, ExternalLink } from 'lucide-react'
import { siteConfig } from '@/lib/site'
import Container from '@/components/container'

export default function Footer() {
  return (
    <footer className="bg-card border-t border-border py-10 sm:py-12">
      <Container>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10 sm:mb-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="text-lg font-bold text-foreground mb-4">PolkAudit</div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Governance transparency for the Polkadot ecosystem.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="#product"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="#security"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Security
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href={siteConfig.links.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                >
                  Documentation <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.links.api}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                >
                  API Reference <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
                >
                  GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href={`mailto:${siteConfig.links.contact}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact Us
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.links.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.links.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              © 2026 PolkAudit. Built for Polkadot governance transparency.
            </p>
            <div className="flex items-center gap-6">
              <a
                href={siteConfig.links.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <GitBranch className="w-5 h-5" />
              </a>
              <a
                href={`mailto:${siteConfig.links.contact}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Email"
              >
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  )
}
