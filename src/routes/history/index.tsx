import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../../lib/auth-context'
import { getScanHistory, getScanDetails } from '../../server/auth'
import { Loader2, GitPullRequest, Laptop, Calendar, CheckCircle2, AlertTriangle, ShieldAlert, X, ChevronUp, ChevronDown, FileCode } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export const Route = createFileRoute('/history/')({ component: HistoryPage })

interface ScanHistoryItem {
  id: string
  sourceType: 'manual' | 'github_pr'
  sourceRef: string | null
  trustScore: number | null
  status: 'pending' | 'complete' | 'failed'
  createdAt: Date
  repoName: string | null
}

function HistoryPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Details Modal States
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [selectedScanDetails, setSelectedScanDetails] = useState<any | null>(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())
  const [showRawDiff, setShowRawDiff] = useState(false)

  const toggleModalFinding = (idx: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const loadScanDetails = async (scanId: string) => {
    setIsDetailsLoading(true)
    setDetailsError(null)
    setSelectedScanDetails(null)
    setExpandedFindings(new Set())
    setShowRawDiff(false)

    try {
      const data = await getScanDetails({ data: { scanId } })
      setSelectedScanDetails(data)
    } catch (err) {
      setDetailsError('Failed to load scan details.')
      console.error(err)
    } finally {
      setIsDetailsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedScanId) {
      loadScanDetails(selectedScanId)
    }
  }, [selectedScanId])

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

  if (!isAuthenticated) {
    return (
      <main className="page-wrap px-4 pb-16 pt-10">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl font-bold text-ink">Scan History</h1>
          <p className="text-ink-muted mt-2 mb-8">
            Track honesty trends and review past scan findings.
          </p>
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-16 max-w-md mx-auto">
            <Laptop className="mx-auto mb-4 h-12 w-12 text-ink-subdued" />
            <h3 className="text-lg font-bold text-ink">Sign In Required</h3>
            <p className="mt-1 mb-6 text-sm text-ink-muted">
              Please sign in with GitHub to view your personal scan history.
            </p>
            <button onClick={() => navigate({ to: '/login' })} className="btn btn-primary w-full">
              Sign In to Continue
            </button>
          </div>
        </div>
      </main>
    )
  }

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
                      <tr
                        key={item.id}
                        className="transition hover:bg-surface-2/40 cursor-pointer"
                        onClick={() => setSelectedScanId(item.id)}
                      >
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
                              className="hover:text-interactive hover:underline relative z-10"
                              onClick={(e) => e.stopPropagation()}
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

      <AnimatePresence>
        {selectedScanId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedScanId(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative z-10 flex flex-col w-full max-w-3xl max-h-[85vh] rounded-xl border border-border bg-surface-1 shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border bg-surface-2 px-6 py-4">
                <div>
                  <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                    {selectedScanDetails?.scan.sourceType === 'github_pr' ? (
                      <span className="inline-flex items-center gap-1.5 text-interactive">
                        <GitPullRequest className="h-5 w-5" />
                        PR Scan Details
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-ink-muted">
                        <Laptop className="h-5 w-5" />
                        Manual Scan Details
                      </span>
                    )}
                  </h3>
                  {selectedScanDetails?.scan.createdAt && (
                    <p className="text-xs text-ink-subdued mt-0.5">
                      Scanned on {new Date(selectedScanDetails.scan.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedScanId(null)}
                  className="rounded-lg p-1.5 text-ink-subdued hover:bg-surface-3 hover:text-ink transition animate-none cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isDetailsLoading && (
                  <div className="py-20 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-interactive mb-3" />
                    <p className="text-sm text-ink-muted">Fetching findings from database...</p>
                  </div>
                )}

                {detailsError && (
                  <div className="rounded-xl border border-severity-critical/20 bg-severity-critical/5 p-6 text-center">
                    <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-severity-critical" />
                    <p className="text-sm text-ink-muted">{detailsError}</p>
                  </div>
                )}

                {selectedScanDetails && (
                  <>
                    {/* Score Bar & Label */}
                    <div className={`rounded-xl border p-6 text-center ${
                      selectedScanDetails.scan.trustScore >= 80 ? 'bg-success/5 border-success/15' :
                      selectedScanDetails.scan.trustScore >= 70 ? 'bg-severity-medium/5 border-severity-medium/15' :
                      'bg-severity-critical/5 border-severity-critical/15'
                    }`}>
                      <div className="mb-2 flex items-center justify-center gap-2">
                        {selectedScanDetails.scan.trustScore >= 80 ? (
                          <CheckCircle2 className="h-6 w-6 text-success" />
                        ) : selectedScanDetails.scan.trustScore >= 70 ? (
                          <AlertTriangle className="h-6 w-6 text-severity-medium" />
                        ) : (
                          <ShieldAlert className="h-6 w-6 text-severity-critical" />
                        )}
                        <span className={`text-3xl font-bold ${
                          selectedScanDetails.scan.trustScore >= 80 ? 'text-success' :
                          selectedScanDetails.scan.trustScore >= 70 ? 'text-severity-medium' :
                          'text-severity-critical'
                        }`}>
                          {selectedScanDetails.scan.trustScore}/100
                        </span>
                      </div>
                      <div className={`text-sm font-semibold ${
                        selectedScanDetails.scan.trustScore >= 80 ? 'text-success' :
                        selectedScanDetails.scan.trustScore >= 70 ? 'text-severity-medium' :
                        'text-severity-critical'
                      }`}>
                        {selectedScanDetails.scan.trustScore >= 80 ? 'CLEAN VERDICT' : 'HIGH CHEAT RISK'}
                      </div>

                      {/* Progress Bar */}
                      <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
                        <div
                          style={{ width: `${selectedScanDetails.scan.trustScore}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${
                            selectedScanDetails.scan.trustScore >= 80 ? 'bg-success' :
                            selectedScanDetails.scan.trustScore >= 70 ? 'bg-severity-medium' :
                            'bg-severity-critical'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Findings', value: selectedScanDetails.findings.length, color: selectedScanDetails.findings.length > 0 ? 'text-severity-critical' : 'text-success' },
                        { label: 'High Severity', value: selectedScanDetails.findings.filter((f: any) => f.confidence === 'high').length, color: selectedScanDetails.findings.filter((f: any) => f.confidence === 'high').length > 0 ? 'text-severity-critical' : 'text-ink-muted' },
                        { label: 'Medium Severity', value: selectedScanDetails.findings.filter((f: any) => f.confidence === 'medium').length, color: 'text-severity-medium' },
                        { label: 'Low Severity', value: selectedScanDetails.findings.filter((f: any) => f.confidence === 'low').length, color: 'text-severity-info' },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-lg border border-border bg-surface-2 p-3 text-center">
                          <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                          <div className="text-[10px] uppercase tracking-wider text-ink-subdued mt-0.5">{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Findings list */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-ink">Detected Violations ({selectedScanDetails.findings.length})</h4>
                      {selectedScanDetails.findings.length > 0 ? (
                        <div className="rounded-xl border border-border bg-surface-2 overflow-hidden divide-y divide-border">
                          {selectedScanDetails.findings.map((finding: any, idx: number) => {
                            const isExpanded = expandedFindings.has(idx)
                            const confidenceColor = 
                              finding.confidence === 'high' ? 'bg-severity-critical/10 text-severity-critical border-severity-critical/20' :
                              finding.confidence === 'medium' ? 'bg-severity-medium/10 text-severity-medium border-severity-medium/20' :
                              'bg-severity-info/10 text-severity-info border-severity-info/20'

                            return (
                              <div key={finding.id || idx} className="bg-surface-1 transition hover:bg-surface-2/20">
                                <button
                                  onClick={() => toggleModalFinding(idx)}
                                  className="flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer"
                                >
                                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${confidenceColor}`}>
                                    {finding.confidence}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-ink truncate">
                                      {finding.explanation}
                                    </div>
                                    <div className="text-xs text-ink-subdued mt-0.5">
                                      {finding.filePath}:{finding.lineStart}
                                    </div>
                                  </div>
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-ink-muted" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-muted" />
                                  )}
                                </button>
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="border-t border-border px-4 py-3 bg-surface-2/50">
                                        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-subdued">
                                          <FileCode className="h-3 w-3" />
                                          Evidence excerpt
                                        </div>
                                        <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
                                          <div className="px-3 py-2 font-mono text-[11px] leading-5">
                                            {finding.evidenceExcerpt.split('\n').map((line: string, li: number) => {
                                              const isAdd = line.startsWith('+') && !line.startsWith('+++')
                                              const isRemove = line.startsWith('-') && !line.startsWith('---')
                                              const isMeta = line.startsWith('@@') || line.startsWith('Index:') || line.startsWith('diff --git')
                                              return (
                                                <div
                                                  key={li}
                                                  className={`${
                                                    isAdd ? 'text-success bg-success/5' :
                                                    isRemove ? 'text-severity-critical bg-severity-critical/5' :
                                                    isMeta ? 'text-interactive' :
                                                    'text-ink-muted'
                                                  } ${isAdd || isRemove ? '-mx-3 px-3' : ''}`}
                                                >
                                                  {line}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-success/20 bg-success/5 p-8 text-center">
                          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
                          <h4 className="text-md font-bold text-ink">Honest Code Detected</h4>
                          <p className="mt-1 text-xs text-ink-muted">No cheating patterns were found in this historical scan.</p>
                        </div>
                      )}
                    </div>

                    {/* Raw Diff Accordion */}
                    {selectedScanDetails.scan.rawDiff && (
                      <div className="rounded-xl border border-border overflow-hidden bg-surface-2">
                        <button
                          onClick={() => setShowRawDiff(!showRawDiff)}
                          className="flex w-full items-center justify-between px-4 py-3 bg-surface-2 hover:bg-surface-3 transition text-left cursor-pointer"
                        >
                          <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                            <FileCode className="h-4 w-4 text-ink-subdued" />
                            Review Raw Diff ({selectedScanDetails.scan.rawDiff.split('\n').length} lines)
                          </span>
                          {showRawDiff ? (
                            <ChevronUp className="h-4 w-4 text-ink-subdued" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-ink-subdued" />
                          )}
                        </button>
                        <AnimatePresence>
                          {showRawDiff && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-border p-4 bg-surface-1">
                                <pre className="font-mono text-[10px] text-ink-muted bg-surface-2 p-3 rounded-lg border border-border overflow-x-auto max-h-[300px]">
                                  {selectedScanDetails.scan.rawDiff}
                                </pre>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
