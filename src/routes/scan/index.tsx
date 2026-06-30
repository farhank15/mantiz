import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/scan/')({ component: ScanPage })

function ScanPage() {
  return (
    <main className="page-wrap px-4 pb-16 pt-10">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-severity-critical/10">
          <svg className="h-8 w-8 text-severity-critical" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h1 className="mb-3 text-3xl font-bold text-ink">Scan a Diff</h1>
        <p className="mb-8 text-ink-muted">
          Paste a GitHub-style diff below or connect your GitHub account to scan a PR.
        </p>

        {/* Coming Soon State */}
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-severity-medium/15 px-4 py-1.5 text-sm font-medium text-severity-medium">
            <span className="h-2 w-2 rounded-full bg-severity-medium" />
            Day 1 — Scaffold Complete
          </div>
          <p className="text-ink-muted">
            The scan interface is being built. Come back on Day 2 for manual diff paste →
            parse → scan → results.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-ink-subdued">
            <span className="rounded-full border border-border px-3 py-1">
              Day 2: Paste form
            </span>
            <span className="rounded-full border border-border px-3 py-1">
              Day 3: 5 detectors
            </span>
            <span className="rounded-full border border-border px-3 py-1">
              Day 4: GitHub OAuth
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
