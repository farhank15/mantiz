import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  BugPlay,
  Shield,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Code2,
  Search,
  Terminal,
  X,
  ChevronDown,
  ChevronUp,
  Share2,
  Check,
} from "lucide-react";
import { scanDiffAsync } from "../../detectors/engine";
import type { ScanResult } from "../../detectors/engine";
import { useAuth } from "../../lib/auth-context";
import { saveManualScan } from "../../server/auth";
import { createShareLink } from "../../server/share";
import PageHeader from "../../components/PageHeader";
import ScanAnimation from "../../components/ScanAnimation";
import DiffViewer from "../../components/DiffViewer";
import AiEvidenceCard from "../../components/AiEvidenceCard";
import StatCard from "../../components/StatCard";

export const Route = createFileRoute("/scan/")({ component: ScanPage });

function ScanPage() {
  const { isAuthenticated } = useAuth();
  const [diffInput, setDiffInput] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<"idle" | "static" | "ai" | "done">(
    "idle",
  );
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(
    new Set(),
  );

  const handleScan = async () => {
    if (!diffInput.trim()) return;

    setIsScanning(true);
    setScanPhase("static");

    // Yield to React to render the animation before blocking
    await new Promise((r) => setTimeout(r, 50));

    // scanDiffAsync handles: static detectors + AI Judge + AI-assisted detection
    // All in one call, with proper fallback if AI is disabled or fails.
    try {
      const finalResult = await scanDiffAsync(diffInput);

      setScanPhase("done");
      setScanResult(finalResult);

      // Save to DB if authenticated
      if (isAuthenticated) {
        saveManualScan({
          data: {
            rawDiff: diffInput,
            trustScore: finalResult.trustScore,
            findings: finalResult.findings.map((f) => ({
              patternType: f.patternType,
              filePath: f.filePath,
              lineStart: f.lineStart,
              lineEnd: f.lineEnd,
              confidence: f.confidence,
              explanation: f.explanation,
              evidenceExcerpt: f.evidenceExcerpt,
            })),
          },
        }).catch((err) => console.error("Failed to save manual scan:", err));
      }
    } catch (err) {
      console.error("Scan failed:", err);
      setScanPhase("done");
    }
  };

  const handleScanComplete = () => {
    setIsScanning(false);
  };

  const handleClear = () => {
    setDiffInput("");
    setScanResult(null);
    setExpandedFindings(new Set());
  };

  const handleShare = async () => {
    if (!scanResult) return;

    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch { /* fallback */ }
      return;
    }

    setIsSharing(true);
    try {
      const result = await createShareLink({
        data: {
          sourceType: "manual",
          scanData: {
            trustScore: scanResult.trustScore,
            totalFindings: scanResult.summary.totalFindings,
            highCount: scanResult.summary.highCount,
            mediumCount: scanResult.summary.mediumCount,
            lowCount: scanResult.summary.lowCount,
            filesScanned: scanResult.summary.filesScanned,
            files: scanResult.summary.filesScanned,
            findings: scanResult.findings.map((f) => ({
              patternType: f.patternType,
              filePath: f.filePath,
              lineStart: f.lineStart,
              lineEnd: f.lineEnd,
              confidence: f.confidence,
              explanation: f.explanation,
              evidenceExcerpt: f.evidenceExcerpt,
            })),
            scoringBreakdown: scanResult.scoringBreakdown,
          },
        },
      });
      setShareUrl(result.url);
      await navigator.clipboard.writeText(result.url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to create share link:", err);
    } finally {
      setIsSharing(false);
    }
  };

  const toggleFinding = (idx: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 50) return "text-severity-medium";
    return "text-severity-critical";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-success/10 border-success/20";
    if (score >= 50) return "bg-severity-medium/10 border-severity-medium/20";
    return "bg-severity-critical/10 border-severity-critical/20";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Clean";
    if (score >= 50) return "Suspicious";
    return "Cheating Detected";
  };

  const isEmpty = diffInput.trim() === "";

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto">
        <PageHeader
          icon={BugPlay}
          title="Scan a Diff"
          description="Paste a GitHub-style diff below. Mantiz will scan it for cheating patterns."
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Scan Diff" }]}
          badge={{ label: "No signup needed", color: "success" }}
        />

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
            className="field-textarea mb-4 min-h-50 w-full font-mono text-sm leading-relaxed"
            spellCheck={false}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-ink-subdued">
              <Terminal className="h-3 w-3" />
              {diffInput
                ? `${diffInput.split("\n").length} lines`
                : "Paste any GitHub-style diff"}
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
 })`)
                }
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

        {/* Scan Animation */}
        <AnimatePresence>
          {isScanning && (
            <ScanAnimation
              isScanning={isScanning}
              scanPhase={scanPhase}
              lineCount={diffInput.split("\n").length}
              onComplete={handleScanComplete}
              findings={scanResult?.findings || []}
              trustScore={scanResult?.trustScore}
            />
          )}
        </AnimatePresence>

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
              <div
                className={`mb-6 rounded-xl border p-6 text-center ${getScoreBg(scanResult.trustScore)}`}
              >
                <div className="mb-2 flex items-center justify-center gap-2">
                  {scanResult.trustScore >= 80 ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : scanResult.trustScore >= 50 ? (
                    <AlertTriangle className="h-5 w-5 text-severity-medium" />
                  ) : (
                    <Shield className="h-5 w-5 text-severity-critical" />
                  )}
                  <span
                    className={`text-2xl font-bold ${getScoreColor(scanResult.trustScore)}`}
                  >
                    {scanResult.trustScore}
                  </span>
                </div>
                <div
                  className={`text-sm font-semibold ${getScoreColor(scanResult.trustScore)}`}
                >
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
                    transition={{
                      duration: 0.8,
                      delay: 0.2,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={`h-full rounded-full ${
                      scanResult.trustScore >= 80
                        ? "bg-success"
                        : scanResult.trustScore >= 50
                          ? "bg-severity-medium"
                          : "bg-severity-critical"
                    }`}
                  />
                </div>
              </div>

              {/* Summary */}
              <StatCard
                stats={[
                  {
                    label: "Files Scanned",
                    value: scanResult.summary.filesScanned,
                    color: "text-interactive",
                  },
                  {
                    label: "Findings",
                    value: scanResult.summary.totalFindings,
                    color:
                      scanResult.summary.totalFindings > 0
                        ? "text-severity-critical"
                        : "text-success",
                  },
                  {
                    label: "High",
                    value: scanResult.summary.highCount,
                    color:
                      scanResult.summary.highCount > 0
                        ? "text-severity-critical"
                        : "text-ink-muted",
                  },
                  {
                    label: "Medium",
                    value: scanResult.summary.mediumCount,
                    color:
                      scanResult.summary.mediumCount > 0
                        ? "text-severity-medium"
                        : "text-ink-muted",
                  },
                  {
                    label: "Low",
                    value: scanResult.summary.lowCount,
                    color:
                      scanResult.summary.lowCount > 0
                        ? "text-severity-info"
                        : "text-ink-muted",
                  },
                ]}
              />

              {/* Findings List — Card style */}
              {scanResult.findings.length > 0 ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink">
                      Findings ({scanResult.findings.length})
                    </h3>
                    <span className="text-xs text-ink-muted">
                      {scanResult.summary.highCount} high ·{" "}
                      {scanResult.summary.mediumCount} med ·{" "}
                      {scanResult.summary.lowCount} low
                    </span>
                  </div>
                  {scanResult.findings.map((finding, idx) => {
                    const isExpanded = expandedFindings.has(idx);
                    const isHigh = finding.confidence === "high";
                    const isAI =
                      finding.patternType === "ai_assisted_detection";
                    const borderColor = isHigh
                      ? "border-severity-critical/25"
                      : finding.confidence === "medium"
                        ? "border-severity-medium/25"
                        : "border-border";
                    const severityBadge = isHigh
                      ? "bg-severity-critical/10 text-severity-critical border-severity-critical/25"
                      : finding.confidence === "medium"
                        ? "bg-severity-medium/10 text-severity-medium border-severity-medium/25"
                        : "bg-surface-2 text-ink-muted border-border";

                    return (
                      <motion.div
                        key={idx}
                        className={`rounded-xl border ${borderColor} bg-surface-1 overflow-hidden transition hover:bg-surface-2/30`}
                      >
                        {/* Card Header — always visible */}
                        <button
                          onClick={() => toggleFinding(idx)}
                          className="flex w-full items-start gap-3 px-4 py-3.5 text-left cursor-pointer"
                        >
                          {/* Severity badge */}
                          <span
                            className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${severityBadge}`}
                          >
                            {finding.confidence}
                          </span>
                          <div className="flex-1 min-w-0">
                            {/* Title row */}
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
                            {/* File path + line */}
                            <div className="mt-1 flex items-center gap-2 text-xs text-ink-subdued font-mono">
                              <FileCode className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {finding.filePath}
                              </span>
                              <span className="shrink-0">
                                :{finding.lineStart}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 mt-0.5">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-ink-muted" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-ink-muted" />
                            )}
                          </div>
                        </button>

                        {/* Expanded Evidence */}
                        {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-border px-4 py-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-xs text-ink-subdued">
                                  <FileCode className="h-3 w-3" />
                                  {isAI ? "AI analysis" : "Evidence excerpt"}
                                  <span className="ml-auto opacity-50">
                                    {finding.patternType.replace(/_/g, " ")}
                                  </span>
                                </div>
                                {isAI ? (
                                  <AiEvidenceCard
                                    content={finding.evidenceExcerpt}
                                  />
                                ) : (
                                  <DiffViewer
                                    content={finding.evidenceExcerpt}
                                    maxHeight="200px"
                                    showHeader={false}
                                  />
                                )}
                              </div>
                            </motion.div>
                          )}
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-success/20 bg-success/5 p-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
                  <h3 className="text-lg font-bold text-ink">
                    No Cheating Detected
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    This diff looks clean. Your AI agent passed the honesty
                    check.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button onClick={handleClear} className="btn btn-secondary">
                  <Code2 className="h-4 w-4" />
                  Scan Another Diff
                </button>
                <button onClick={handleShare} disabled={isSharing} className="btn btn-secondary">
                  {isSharing ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : copySuccess ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  {isSharing ? "Generating..." : copySuccess ? "Link Copied!" : shareUrl ? "Copy Link" : "Share Results"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state (when no results yet) */}
        {!scanResult && !isEmpty && !isScanning && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-ink-subdued" />
            <p className="text-ink-muted">
              Paste a diff above and click{" "}
              <strong className="text-ink">Scan Diff</strong> to get started.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
