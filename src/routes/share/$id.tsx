/**
 * Mantiz Share — Public scan report page
 *
 * Accessible via /share/:shareId to anyone with the URL.
 * Shows trust score, findings breakdown, and evidence.
 * No authentication required.
 */

import { useState, useEffect } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  BugPlay,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  Github,
  Laptop,
} from "lucide-react"
import { getSharedScan } from "../../server/share"
import StatCard from "../../components/StatCard"
import DiffViewer from "../../components/DiffViewer"
import AiEvidenceCard from "../../components/AiEvidenceCard"

export const Route = createFileRoute("/share/$id")({ component: SharePage })

interface ShareData {
  trustScore: number
  totalFindings: number
  highCount: number
  mediumCount: number
  lowCount: number
  filesScanned: number
  findings: Array<{
    patternType: string
    filePath: string
    lineStart: number
    lineEnd: number
    confidence: string
    explanation: string
    evidenceExcerpt: string
  }>
}

function SharePage() {
  const { id } = Route.useParams()
  const [data, setData] = useState<{ scanData: ShareData; sourceType: string; sourceRef?: string; createdAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getSharedScan({ data: { id } })
        setData(result as any)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load shared scan")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const toggleFinding = (idx: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success"
    if (score >= 50) return "text-severity-medium"
    return "text-severity-critical"
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-success/10 border-success/20"
    if (score >= 50) return "bg-severity-medium/10 border-severity-medium/20"
    return "bg-severity-critical/10 border-severity-critical/20"
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Clean"
    if (score >= 50) return "Suspicious"
    return "Cheating Detected"
  }

  if (isLoading) {
    return (
      <main className="page-wrap flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-interactive/30 border-t-interactive" />
          <p className="text-sm text-ink-muted">Loading shared scan...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-wrap flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-severity-critical/10">
            <AlertTriangle className="h-8 w-8 text-severity-critical" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Scan Not Found</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {error === "Shared scan not found or has expired"
              ? "This shared scan link is invalid or has been removed."
              : error}
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-interactive px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-interactive/90"
          >
            <BugPlay className="h-4 w-4" />
            Run Your Own Scan
          </Link>
        </div>
      </main>
    )
  }

  if (!data) return null

  const { scanData, sourceType, sourceRef, createdAt } = data

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-interactive/10">
            <BugPlay className="h-7 w-7 text-interactive" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Mantiz Scan Report</h1>
          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {createdAt
                ? new Date(createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Unknown date"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              {sourceType === "github_pr" ? (
                <>
                  <Github className="h-3 w-3" />
                  PR Scan
                </>
              ) : (
                <>
                  <Laptop className="h-3 w-3" />
                  Manual Scan
                </>
              )}
            </span>
            {sourceRef && (
              <>
                <span>•</span>
                <a
                  href={sourceRef}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-interactive hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Source
                </a>
              </>
            )}
          </div>
        </motion.div>

        {/* Trust Score */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`mb-6 rounded-xl border p-6 text-center ${getScoreBg(scanData.trustScore)}`}
        >
          <div className="mb-2 flex items-center justify-center gap-2">
            {scanData.trustScore >= 80 ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : scanData.trustScore >= 50 ? (
              <AlertTriangle className="h-6 w-6 text-severity-medium" />
            ) : (
              <Shield className="h-6 w-6 text-severity-critical" />
            )}
            <span className={`text-4xl font-bold ${getScoreColor(scanData.trustScore)}`}>
              {scanData.trustScore}
            </span>
          </div>
          <div className={`text-base font-semibold ${getScoreColor(scanData.trustScore)}`}>
            {getScoreLabel(scanData.trustScore)}
          </div>
          <div className="mt-1 text-xs text-ink-muted">Trust Score (0-100) — higher is better</div>

          <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                scanData.trustScore >= 80
                  ? "bg-success"
                  : scanData.trustScore >= 50
                    ? "bg-severity-medium"
                    : "bg-severity-critical"
              }`}
              style={{ width: `${scanData.trustScore}%` }}
            />
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatCard
            stats={[
              { label: "Files Scanned", value: scanData.filesScanned, color: "text-interactive" },
              { label: "Findings", value: scanData.totalFindings, color: scanData.totalFindings > 0 ? "text-severity-critical" : "text-success" },
              { label: "High", value: scanData.highCount, color: scanData.highCount > 0 ? "text-severity-critical" : "text-ink-muted" },
              { label: "Medium", value: scanData.mediumCount, color: scanData.mediumCount > 0 ? "text-severity-medium" : "text-ink-muted" },
              { label: "Low", value: scanData.lowCount, color: scanData.lowCount > 0 ? "text-severity-info" : "text-ink-muted" },
            ]}
          />
        </motion.div>

        {/* Findings */}
        {scanData.findings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 grid gap-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">
                Findings ({scanData.findings.length})
              </h3>
              <span className="text-xs text-ink-muted">
                {scanData.highCount} high · {scanData.mediumCount} med · {scanData.lowCount} low
              </span>
            </div>
            {scanData.findings.map((finding, idx) => {
              const isExpanded = expandedFindings.has(idx)
              const isHigh = finding.confidence === "high"
              const isAI = finding.patternType === "ai_assisted_detection"
              const borderColor = isHigh
                ? "border-severity-critical/25"
                : finding.confidence === "medium"
                  ? "border-severity-medium/25"
                  : "border-border"
              const severityBadge = isHigh
                ? "bg-severity-critical/10 text-severity-critical border-severity-critical/25"
                : finding.confidence === "medium"
                  ? "bg-severity-medium/10 text-severity-medium border-severity-medium/25"
                  : "bg-surface-2 text-ink-muted border-border"

              return (
                <motion.div
                  key={idx}
                  layout
                  className={`rounded-xl border ${borderColor} bg-surface-1 overflow-hidden transition hover:bg-surface-2/30`}
                >
                  <button
                    onClick={() => toggleFinding(idx)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left cursor-pointer"
                  >
                    <span className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${severityBadge}`}>
                      {finding.confidence}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-ink">
                          {finding.explanation}
                        </span>
                        {isAI && (
                          <span className="rounded-full bg-interactive/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-interactive">
                            AI
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-ink-subdued font-mono">
                        <FileCode className="h-3 w-3 shrink-0" />
                        <span className="truncate">{finding.filePath}</span>
                        <span className="shrink-0">:{finding.lineStart}</span>
                      </div>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-ink-muted" /> : <ChevronDown className="h-4 w-4 text-ink-muted" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border px-4 py-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-ink-subdued">
                          <FileCode className="h-3 w-3" />
                          {isAI ? "AI analysis" : "Evidence excerpt"}
                          <span className="ml-auto opacity-50">{finding.patternType.replace(/_/g, " ")}</span>
                        </div>
                        {isAI ? (
                          <AiEvidenceCard content={finding.evidenceExcerpt} />
                        ) : (
                          <DiffViewer content={finding.evidenceExcerpt} maxHeight="200px" showHeader={false} />
                        )}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* No findings */}
        {scanData.findings.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 rounded-xl border border-success/20 bg-success/5 p-8 text-center"
          >
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
            <h3 className="text-lg font-bold text-ink">No Cheating Detected</h3>
            <p className="mt-1 text-sm text-ink-muted">
              This diff looks clean. The AI agent passed the honesty check.
            </p>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <p className="text-xs text-ink-subdued">
            Built with{" "}
            <a
              href="https://mantiz-wine.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-interactive hover:underline"
            >
              Mantiz
            </a>{" "}
            — AI Coding Agent Lie Detector
          </p>
          <Link
            to="/"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-medium text-ink-muted transition hover:border-interactive/30 hover:text-ink"
          >
            <BugPlay className="h-3.5 w-3.5" />
            Scan Your Own Code
          </Link>
        </motion.div>
      </div>
    </main>
  )
}
