'use client'

import { MobileSidebar } from './sidebar'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

interface HeaderProps {
  title: string
  showSearch?: boolean
}

export function Header({ title, showSearch = false }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 md:left-72 h-20 bg-card border-b border-border flex items-center px-8 gap-6 z-40 shadow-md">
      {/* Mobile Menu */}
      <div className="md:hidden">
        <MobileSidebar />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground flex-1 tracking-tight">
        {title}
      </h1>

      {/* Search (optional) */}
      {showSearch && (
        <div className="hidden sm:flex items-center gap-3 bg-background rounded-lg border border-border px-4 py-2.5 transition-all duration-150 hover:border-accent/50 focus-within:ring-2 focus-within:ring-ring/20">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent outline-none text-sm text-foreground placeholder-muted-foreground w-56"
          />
        </div>
      )}
    </header>
  )
}
