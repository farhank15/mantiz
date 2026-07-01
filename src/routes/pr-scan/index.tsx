import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Github,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Code2,
  ExternalLink,
  Loader2,
  GitPullRequest,
  ChevronDown,
  ChevronUp,
  FileCode,
} from 'lucide-react'
import { scanPR } from '../../server/auth'
import { useAuth } from '../../lib/auth-context'
import { useEffect } from 'react'

export const Route = createFileRoute('/pr-scan/')({ component: PRScanPage })

interface PRScanResult {
  pr: {
    number: number
    title: string
    author: string
    state: string
    url: string
  }
  scan: {
    trustScore: number
    totalFindings: number
    highCount: number
    findings: Array<{
      patternType: string
      filePath: string
      lineStart: number
      confidence: string
      explanation: string
      evidenceExcerpt: string
    }>
  }
}

function PRScanPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [prUrl, setPrUrl] = useState('')
  const [result, setResult] = useState<PRScanResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())

  const toggleFinding = (idx: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  if (authLoading) {
    return (
      <div className="page-wrap flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-interactive" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  const handleScan = async () => {
    if (!prUrl.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await scanPR({ data: { prUrl: prUrl.trim() } })
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan PR. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success'
    if (score >= 50) return 'text-severity-medium'
    return 'text-severity-critical'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-success/10 border-success/20'
    if (score >= 50) return 'bg-severity-medium/10 border-severity-medium/20'
    return 'bg-severity-critical/10 border-severity-critical/20'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Clean'
    if (score >= 50) return 'Suspicious'
    return 'Cheating Detected'
  }

  const getConfidenceBadge = (c: string) => {
    switch (c) {
      case 'high': return 'text-severity-critical border-severity-critical/25 bg-severity-critical/10'
      case 'medium': return 'text-severity-high border-severity-high/25 bg-severity-high/10'
      default: return 'text-ink-muted border-border bg-surface-2'
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </Link>

        {/* Page header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-interactive/10">
            <Github className="h-7 w-7 text-interactive" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-ink">Scan a Pull Request</h1>
          <p className="text-ink-muted">
            Paste a GitHub PR URL. Mantiz fetches the diff and scans for cheating patterns.
          </p>
        </div>

        {/* PR URL Input */}
        <div className="mb-8 rounded-xl border border-border bg-surface-1 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
            <GitPullRequest className="h-4 w-4 text-interactive" />
            Pull Request URL
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              className="field-input flex-1 font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
            <button
              onClick={handleScan}
              disabled={!prUrl.trim() || isLoading}
              className="btn btn-primary whitespace-nowrap"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {isLoading ? 'Scanning...' : 'Scan'}
            </button>
          </div>

          <p className="mt-2 text-xs text-ink-subdued">
            Requires a public repository URL. Make sure you're authenticated with GitHub.
          </p>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-xl border border-severity-critical/20 bg-severity-critical/5 p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-severity-critical" />
            <p className="text-sm text-severity-critical">{error}</p>
            {error.includes('Not authenticated') && (
              <Link to="/login" className="mt-2 inline-flex items-center gap-1 text-sm text-interactive hover:underline">
                Login with GitHub →
              </Link>
            )}
          </div>
        )}

        {/* Results */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              {/* PR Info */}
              <div className="mb-4 rounded-xl border border-border bg-surface-1 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4 text-interactive" />
                    <span className="text-sm font-medium text-ink">
                      {result.pr.title}
                    </span>
                  </div>
                  <a
                    href={result.pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-interactive hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    #{result.pr.number}
                  </a>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
                  <span>by <strong className="text-ink">{result.pr.author}</strong></span>
                  <span>•</span>
                  <span>{result.pr.state}</span>
                </div>
              </div>

              {/* Trust Score */}
              <div className={`mb-6 rounded-xl border p-6 text-center ${getScoreBg(result.scan.trustScore)}`}>
                <div className="mb-2 flex items-center justify-center gap-2">
                  {result.scan.trustScore >= 80 ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : result.scan.trustScore >= 50 ? (
                    <AlertTriangle className="h-5 w-5 text-severity-medium" />
                  ) : (
                    <Shield className="h-5 w-5 text-severity-critical" />
                  )}
                  <span className={`text-3xl font-bold ${getScoreColor(result.scan.trustScore)}`}>
                    {result.scan.trustScore}
                  </span>
                </div>
                <div className={`text-sm font-semibold ${getScoreColor(result.scan.trustScore)}`}>
                  {getScoreLabel(result.scan.trustScore)}
                </div>

                {/* Score bar */}
                <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${result.scan.trustScore}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className={`h-full rounded-full ${
                      result.scan.trustScore >= 80 ? 'bg-success' :
                      result.scan.trustScore >= 50 ? 'bg-severity-medium' :
                      'bg-severity-critical'
                    }`}
                  />
                </div>
              </div>

              {/* Summary stats */}
              <div className="mb-6 grid grid-cols-3 gap-3">
                {[
                  { label: 'Findings', value: result.scan.totalFindings, color: result.scan.totalFindings > 0 ? 'text-severity-critical' : 'text-success' },
                  { label: 'High Severity', value: result.scan.highCount, color: result.scan.highCount > 0 ? 'text-severity-critical' : 'text-ink-muted' },
                  { label: 'PR Files', value: 'N/A', color: 'text-interactive' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                    <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-ink-muted">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Findings */}
              {result.scan.findings.length > 0 ? (
                <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                  <div className="border-b border-border bg-surface-2 px-4 py-3">
                    <h3 className="text-sm font-semibold text-ink">
                      Findings ({result.scan.findings.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {result.scan.findings.map((finding, idx) => {
                      const isExpanded = expandedFindings.has(idx)
                      return (
                        <div key={idx} className="transition hover:bg-surface-2/50">
                          <button
                            onClick={() => toggleFinding(idx)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                          >
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getConfidenceBadge(finding.confidence)}`}
                            >
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
                                <div className="border-t border-border px-4 py-3">
                                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-subdued">
                                    <FileCode className="h-3 w-3" />
                                    Evidence excerpt
                                  </div>
                                  <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
                                    <div className="px-3 py-2 font-mono text-[11px] leading-5 text-ink-muted">
                                      {finding.evidenceExcerpt}
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
                </div>
              ) : (
                <div className="rounded-xl border border-success/20 bg-success/5 p-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
                  <h3 className="text-lg font-bold text-ink">No Cheating Detected</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    This PR looks clean. The AI agent passed the honesty check.
                  </p>
                </div>
              )}

              {/* Scan another */}
              <div className="mt-6 text-center">
                <button
                  onClick={() => { setResult(null); setPrUrl('') }}
                  className="btn btn-secondary"
                >
                  <Code2 className="h-4 w-4" />
                  Scan Another PR
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!result && !isLoading && !error && prUrl.trim() === '' && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
            <Github className="mx-auto mb-3 h-10 w-10 text-ink-subdued" />
            <p className="text-ink-muted">
              Paste a PR URL and click <strong className="text-ink">Scan</strong> to get started.
            </p>
            <p className="mt-1 text-xs text-ink-subdued">
              Example: https://github.com/facebook/react/pull/12345
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
