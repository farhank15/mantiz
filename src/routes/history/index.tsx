import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/history/')({ component: HistoryPage })

function HistoryPage() {
  return (
    <main className="page-wrap px-4 pb-16 pt-10">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-interactive/10">
          <svg className="h-8 w-8 text-interactive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
          </svg>
        </div>
        <h1 className="mb-3 text-3xl font-bold text-ink">Scan History</h1>
        <p className="mb-8 text-ink-muted">
          View past scans, track trust score trends, and review findings.
        </p>

        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12">
          <p className="text-ink-muted">
            No scans yet. Start by scanning a diff on Day 2.
          </p>
        </div>
      </div>
    </main>
  )
}
