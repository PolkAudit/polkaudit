import { ReactNode } from 'react'
import { DesktopSidebar } from '@/components/sidebar'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DesktopSidebar />
      <div className="md:ml-72">
        <div className="pt-20">
          {children}
        </div>
      </div>
    </div>
  )
}
