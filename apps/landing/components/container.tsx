import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ContainerProps = {
  children: ReactNode
  className?: string
  /**
   * default — page shell (fills 1440–1536 with ~6% gutters; caps at 1600px)
   * narrow — FAQ / CTA / long-form readability
   * media — demo video / large media embeds
   */
  size?: 'default' | 'narrow' | 'media'
}

const sizeClass = {
  narrow: 'max-w-3xl',
  media: 'max-w-6xl',
  /** 1600px cap so 1440/1536 viewports use full width + padding gutters only */
  default: 'max-w-[1600px]',
} as const

/**
 * ~6% side gutters at 1440–1536px (5.5–6vw),
 * 16px floor on mobile, 72px ceiling so ultrawide stays composed.
 */
const gutterClass = 'px-[clamp(1rem,6vw,4.5rem)]'

export default function Container({
  children,
  className,
  size = 'default',
}: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full', gutterClass, sizeClass[size], className)}>
      {children}
    </div>
  )
}
