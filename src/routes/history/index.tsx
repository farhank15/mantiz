import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../../lib/auth-context'
import { getScanHistory } from '../../server/auth'
import { Loader2, GitPullRequest, Laptop, Calendar, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'

export const Route = createFileRoute('/history/')({ component: HistoryPage })

interface ScanHistoryItem {
  id: string
  sourceType: 'manual' | 'github_pr'
  sourceRef: string | null
  trustScore: number | null
  status: 'pending' | 'complete' | 'failed'
  createdAt: string
  repoName: string | null
}

function HistoryPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (!isAuthenticated) return

    const loadHistory = async () => {
      try {
        const data = await getScanHistory()
        setHistory(data as ScanHistoryItem[])
      } catch (err) {
        setError('Failed to load scan history')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [isAuthenticated])

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="page-wrap flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-interactive" />
          <p className="text-sm text-ink-muted">Loading scan history...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-ink-subdued'
    if (score >= 80) return 'text-success'
    if (score >= 70) return 'text-severity-medium'
    return 'text-severity-critical'
  }

  const getScoreBg = (score: number | null) => {
    if (score === null) return 'bg-surface-2 border-border'
    if (score >= 80) return 'bg-success/10 border-success/20'
    if (score >= 70) return 'bg-severity-medium/10 border-severity-medium/20'
    return 'bg-severity-critical/10 border-severity-critical/20'
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-10">
      <div className="mx-auto max-w-4xl">
        {/* Page header */}
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-ink">Scan History</h1>
          <p className="text-ink-muted mt-2">
            Track honesty trends and review past scan findings.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-severity-critical/25 bg-severity-critical/5 p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-severity-critical" />
            <p className="text-sm text-ink-muted">{error}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-16 text-center">
            <Laptop className="mx-auto mb-4 h-12 w-12 text-ink-subdued" />
            <h3 className="text-lg font-bold text-ink">No Scans Found</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Start by running a manual scan or scanning a GitHub PR.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-ink-subdued">
                    <th className="px-5 py-3.5">Scan Source</th>
                    <th className="px-5 py-3.5">Repository / Context</th>
                    <th className="px-5 py-3.5 text-center">Trust Score</th>
                    <th className="px-5 py-3.5">Verdict</th>
                    <th className="px-5 py-3.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((item) => {
                    const score = item.trustScore
                    const isPassed = score !== null && score >= 70
                    const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })

                    return (
                      <tr key={item.id} className="transition hover:bg-surface-2/30">
                        {/* Source Type */}
                        <td className="whitespace-nowrap px-5 py-4 font-medium text-ink">
                          {item.sourceType === 'github_pr' ? (
                            <span className="inline-flex items-center gap-1.5 text-interactive">
                              <GitPullRequest className="h-4 w-4" />
                              GitHub PR
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-ink-muted">
                              <Laptop className="h-4 w-4" />
                              Manual Scan
                            </span>
                          )}
                        </td>

                        {/* Repo / Source Ref */}
                        <td className="px-5 py-4 max-w-[280px] truncate text-ink-muted">
                          {item.sourceType === 'github_pr' && item.sourceRef ? (
                            <a
                              href={item.sourceRef}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-interactive hover:underline"
                            >
                              {item.repoName || item.sourceRef.split('github.com/')[1]}
                            </a>
                          ) : (
                            <span className="italic text-ink-subdued">Pasted diff text</span>
                          )}
                        </td>

                        {/* Trust Score */}
                        <td className="whitespace-nowrap px-5 py-4 text-center">
                          <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${getScoreBg(score)} ${getScoreColor(score)}`}>
                            {score !== null ? `${score}/100` : '—'}
                          </span>
                        </td>

                        {/* Verdict / Status */}
                        <td className="whitespace-nowrap px-5 py-4">
                          {score === null ? (
                            <span className="text-xs text-ink-subdued">Pending</span>
                          ) : isPassed ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                              <CheckCircle2 className="h-4 w-4" />
                              PASSED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-severity-critical">
                              <ShieldAlert className="h-4 w-4" />
                              BLOCKED
                            </span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-ink-subdued" />
                            {formattedDate}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
