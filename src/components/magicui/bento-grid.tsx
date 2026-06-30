import { cn } from './utils'
import type { ReactNode } from 'react'

interface BentoGridProps {
  className?: string
  children?: ReactNode
}

interface BentoCardProps {
  name: string
  className?: string
  background?: ReactNode
  Icon?: ReactNode
  description: string
  href?: string
  cta?: string
}

export function BentoGrid({ className, children }: BentoGridProps) {
  return (
    <div
      className={cn(
        'mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function BentoCard({
  name,
  className,
  background,
  Icon,
  description,
}: BentoCardProps) {
  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--border)]',
        'bg-[var(--surface-1)]',
        'transition-all duration-300',
        'hover:border-[var(--interactive)] hover:shadow-[0_0_20px_rgba(88,166,255,0.08)]',
        className,
      )}
    >
      {/* Background layer */}
      {background && (
        <div className="pointer-events-none absolute inset-0">{background}</div>
      )}

      <div className="pointer-events-none z-10 flex flex-col gap-1 p-6">
        {Icon && (
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--interactive)]">
            {Icon}
          </div>
        )}
        <h3 className="text-base font-semibold text-[var(--ink)]">
          {name}
        </h3>
        <p className="max-w-lg text-sm text-[var(--ink-muted)]">
          {description}
        </p>
      </div>
    </div>
  )
}
