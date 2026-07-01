/**
 * StatCard — reusable stat card grid component
 *
 * Renders a responsive grid of stat cards with value + label.
 * Replaces duplicated stat grid code across scan, pr-scan, and history pages.
 */

import type { ReactNode } from "react"

export interface StatItem {
  label: string
  value: ReactNode
  color: string
}

interface StatCardProps {
  stats: StatItem[]
}

export default function StatCard({ stats }: StatCardProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-border bg-surface-1 p-3 text-center"
        >
          <div className={`text-xl font-bold ${stat.color}`}>
            {stat.value}
          </div>
          <div className="text-xs text-ink-muted">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
