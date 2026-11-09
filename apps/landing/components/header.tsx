'use client'

import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { navItems, siteConfig } from '@/lib/site'
import Container from '@/components/container'

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled || menuOpen
          ? 'bg-background/95 backdrop-blur border-b border-border'
          : 'bg-transparent'
      }`}
    >
      <Container className="py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <a
            href="#hero"
            className="shrink-0 text-lg sm:text-xl font-bold tracking-tight text-foreground"
            onClick={closeMenu}
          >
            PolkAudit
          </a>

          <nav className="hidden lg:flex items-center gap-5 xl:gap-7" aria-label="Primary">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={`mailto:${siteConfig.links.contact}`}
              className="hidden sm:inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-secondary transition-colors"
            >
              Book Demo
            </a>
            <a
              href={siteConfig.links.dashboard}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg bg-accent text-accent-foreground hover:bg-primary transition-colors"
            >
              <span className="sm:hidden">Demo</span>
              <span className="hidden sm:inline">View Live Demo</span>
            </a>
            <button
              type="button"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground hover:bg-secondary transition-colors"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </Container>

      {menuOpen && (
        <div
          id="mobile-nav"
          className="lg:hidden border-t border-border bg-background/98 backdrop-blur"
        >
          <Container className="py-4">
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="rounded-lg px-3 py-3 text-base text-foreground hover:bg-secondary/60 transition-colors"
                >
                  {item.label}
                </a>
              ))}
              <a
                href={`mailto:${siteConfig.links.contact}`}
                onClick={closeMenu}
                className="mt-2 rounded-lg border border-border px-3 py-3 text-center text-sm font-medium text-foreground hover:bg-secondary transition-colors sm:hidden"
              >
                Book Demo
              </a>
            </nav>
          </Container>
        </div>
      )}
    </header>
  )
}
