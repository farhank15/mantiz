import { Link } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { motion } from 'framer-motion'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface PageHeaderProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  breadcrumbs: BreadcrumbItem[]
  badge?: {
    label: string
    color: 'interactive' | 'success' | 'severity-critical' | 'severity-medium' | 'severity-high'
  }
}

export default function PageHeader({ icon: Icon, title, description, breadcrumbs, badge }: PageHeaderProps) {
  return (
    <div className="mb-8">
      {/* Breadcrumb navigation */}
      <nav className="mb-5 flex items-center gap-1 text-xs font-medium">
        {breadcrumbs.map((item, idx) => (
          <span key={idx} className="flex items-center gap-1">
            {idx === 0 ? (
              <Link
                to={item.to || '/'}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <Home className="h-3 w-3" />
                {item.label}
              </Link>
            ) : (
              <>
                <ChevronRight className="h-3 w-3 text-ink-subdued" />
                {item.to ? (
                  <Link
                    to={item.to}
                    className="rounded-lg px-2 py-1 text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="rounded-lg px-2 py-1 text-ink font-semibold">
                    {item.label}
                  </span>
                )}
              </>
            )}
          </span>
        ))}
      </nav>

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-xl border border-border bg-surface-1 p-6 sm:p-8"
      >
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-5">
          {/* Icon */}
          <div className="mb-4 sm:mb-0 sm:mt-0.5 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-interactive/10">
            <Icon className="h-7 w-7 text-interactive" />
          </div>

          <div className="flex-1">
            {/* Title row with optional badge */}
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
              <h1 className="text-2xl font-bold text-ink sm:text-3xl">
                {title}
              </h1>
              {badge && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    borderColor: `var(--${badge.color})25`,
                    backgroundColor: `var(--${badge.color})10`,
                    color: `var(--${badge.color})`,
                  }}
                >
                  {badge.label}
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-sm text-ink-muted sm:text-base">
              {description}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
