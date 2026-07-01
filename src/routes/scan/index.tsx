import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { BugPlay, Shield, AlertTriangle, CheckCircle2, FileCode, ArrowLeft, Code2, Search, Terminal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { scanDiff } from '../../detectors/engine'
import type { ScanResult } from '../../detectors/engine'
import { useAuth } from '../../lib/auth-context'
import { saveManualScan } from '../../server/auth'

export const Route = createFileRoute('/scan/')({ component: ScanPage })

function ScanPage() {
  const { isAuthenticated } = useAuth()
  const [diffInput, setDiffInput] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())

  const handleScan = () => {
    if (!diffInput.trim()) return
    setIsScanning(true)

    // Simulate brief processing delay for UX
    setTimeout(() => {
      const result = scanDiff(diffInput)
      setScanResult(result)
      setIsScanning(false)

      if (isAuthenticated) {
        saveManualScan({
          data: {
            rawDiff: diffInput,
            trustScore: result.trustScore,
            findings: result.findings.map((f) => ({
              patternType: f.patternType,
              filePath: f.filePath,
              lineStart: f.lineStart,
              lineEnd: f.lineEnd,
              confidence: f.confidence,
              explanation: f.explanation,
              evidenceExcerpt: f.evidenceExcerpt,
            })),
          },
        }).catch((err) => console.error('Failed to save manual scan:', err))
      }
    }, 400)
  }

  const handleClear = () => {
    setDiffInput('')
    setScanResult(null)
    setExpandedFindings(new Set())
  }

  const toggleFinding = (idx: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
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

  const getConfidenceColor = (c: string) => {
    switch (c) {
      case 'high': return 'text-severity-critical border-severity-critical/25 bg-severity-critical/10'
      case 'medium': return 'text-severity-high border-severity-high/25 bg-severity-high/10'
      case 'low': return 'text-severity-medium border-severity-medium/25 bg-severity-medium/10'
      default: return 'text-ink-muted border-border bg-surface-2'
    }
  }

  const isEmpty = diffInput.trim() === ''

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto max-w-4xl">
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
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-severity-critical/10">
            <BugPlay className="h-7 w-7 text-severity-critical" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-ink">Scan a Diff</h1>
          <p className="text-ink-muted">
            Paste a GitHub-style diff below. Mantiz will scan it for cheating patterns.
          </p>
        </div>

        {/* Diff Input Form */}
        <div className="mb-8 rounded-xl border border-border bg-surface-1 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Code2 className="h-4 w-4 text-interactive" />
              Paste Diff
            </div>
            {diffInput && (
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-ink-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          <textarea
            value={diffInput}
            onChange={(e) => setDiffInput(e.target.value)}
            placeholder={`Paste a git diff here...\n\ne.g.\ndiff --git a/test.js b/test.js\nindex abc..def 100644\n--- a/test.js\n+++ b/test.js\n@@ -10,7 +10,7 @@\n function testAdd() {\n-  assert.equal(add(2,3), 5)\n+  // assert.equal(add(2,3), 5)\n }`}
            className="field-textarea mb-4 min-h-[200px] w-full font-mono text-sm leading-relaxed"
            spellCheck={false}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-ink-subdued">
              <Terminal className="h-3 w-3" />
              {diffInput ? `${diffInput.split('\n').length} lines` : 'Paste any GitHub-style diff'}
            </div>
            <div className="flex gap-2">
              {/* Sample diff button */}
              <button
                onClick={() =>
                  setDiffInput(`diff --git a/test/auth.test.js b/test/auth.test.js
index abc123..def456 100644
--- a/test/auth.test.js
+++ b/test/auth.test.js
@@ -1,15 +1,15 @@
 import { describe, it, expect } from 'vitest'
 import { login } from '../auth'
 
-describe('Auth Flow', () => {
+describe.skip('Auth Flow', () => {
   it('should login with valid credentials', async () => {
     const result = await login('test@example.com', 'password123')
     expect(result.token).toBeDefined()
   })
 
-  it('should reject invalid password', async () => {
+  it.skip('should reject invalid password', async () => {
     const result = await login('test@example.com', 'wrong')
-    expect(result.error).toBe('Invalid credentials')
+    // expect(result.error).toBe('Invalid credentials')
   })
 })`)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-ink-muted transition hover:border-interactive/30 hover:text-ink"
              >
                Load Sample
              </button>
              <button
                onClick={handleScan}
                disabled={!diffInput.trim() || isScanning}
                className="btn btn-primary"
              >
                {isScanning ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Scan Diff
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {scanResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Trust Score */}
              <div className={`mb-6 rounded-xl border p-6 text-center ${getScoreBg(scanResult.trustScore)}`}>
                <div className="mb-2 flex items-center justify-center gap-2">
                  {scanResult.trustScore >= 80 ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : scanResult.trustScore >= 50 ? (
                    <AlertTriangle className="h-5 w-5 text-severity-medium" />
                  ) : (
                    <Shield className="h-5 w-5 text-severity-critical" />
                  )}
                  <span className={`text-2xl font-bold ${getScoreColor(scanResult.trustScore)}`}>
                    {scanResult.trustScore}
                  </span>
                </div>
                <div className={`text-sm font-semibold ${getScoreColor(scanResult.trustScore)}`}>
                  {getScoreLabel(scanResult.trustScore)}
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  Trust Score (0-100) — higher is better
                </div>

                {/* Score bar */}
                <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${scanResult.trustScore}%` }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className={`h-full rounded-full ${
                      scanResult.trustScore >= 80 ? 'bg-success' :
                      scanResult.trustScore >= 50 ? 'bg-severity-medium' :
                      'bg-severity-critical'
                    }`}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Files Scanned', value: scanResult.summary.filesScanned, color: 'text-interactive' },
                  { label: 'Findings', value: scanResult.summary.totalFindings, color: scanResult.summary.totalFindings > 0 ? 'text-severity-critical' : 'text-success' },
                  { label: 'High Severity', value: scanResult.summary.highCount, color: scanResult.summary.highCount > 0 ? 'text-severity-critical' : 'text-ink-muted' },
                  { label: 'Low Severity', value: scanResult.summary.lowCount, color: scanResult.summary.lowCount > 0 ? 'text-severity-medium' : 'text-ink-muted' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                    <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-ink-muted">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Findings List */}
              {scanResult.findings.length > 0 ? (
                <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                  <div className="border-b border-border bg-surface-2 px-4 py-3">
                    <h3 className="text-sm font-semibold text-ink">
                      Findings ({scanResult.findings.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-border">
                    {scanResult.findings.map((finding, idx) => {
                      const isExpanded = expandedFindings.has(idx)
                      return (
                        <div key={idx} className="transition hover:bg-surface-2/50">
                          <button
                            onClick={() => toggleFinding(idx)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left"
                          >
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getConfidenceColor(finding.confidence)}`}
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
                                    <div className="px-3 py-2 font-mono text-[11px] leading-5">
                                      {finding.evidenceExcerpt.split('\n').map((line, li) => {
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
                </div>
              ) : (
                <div className="rounded-xl border border-success/20 bg-success/5 p-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
                  <h3 className="text-lg font-bold text-ink">No Cheating Detected</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    This diff looks clean. Your AI agent passed the honesty check.
                  </p>
                </div>
              )}

              {/* Scan another */}
              <div className="mt-6 text-center">
                <button
                  onClick={handleClear}
                  className="btn btn-secondary"
                >
                  <Code2 className="h-4 w-4" />
                  Scan Another Diff
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state (when no results yet) */}
        {!scanResult && !isEmpty && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-ink-subdued" />
            <p className="text-ink-muted">
              Paste a diff above and click <strong className="text-ink">Scan Diff</strong> to get started.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
