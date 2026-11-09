'use client'

import { CheckCircle2, Circle } from 'lucide-react'

interface TimelineStep {
  label: string
  description?: string
  completed: boolean
  current: boolean
}

interface TimelineStepperProps {
  steps: TimelineStep[]
}

export function TimelineStepper({ steps }: TimelineStepperProps) {
  return (
    <div className="space-y-6">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1
        return (
          <div key={index} className="relative flex gap-4">
            {/* Connector Line */}
            {!isLast && (
              <div className="absolute left-5 top-10 w-0.5 h-12 bg-border" />
            )}

            {/* Icon */}
            <div className="relative z-10 flex-shrink-0">
              {step.completed ? (
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
              ) : step.current ? (
                <div className="h-10 w-10 rounded-full bg-accent/20 border border-accent/50 border-2 flex items-center justify-center animate-pulse">
                  <Circle className="h-4 w-4 text-accent" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-border border border-border/50 flex items-center justify-center">
                  <Circle className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="pt-1.5">
              <h4 className="text-sm font-semibold text-foreground">{step.label}</h4>
              {step.description && (
                <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
