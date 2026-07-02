import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  Search,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Code2,
  ExternalLink,
  GitPullRequest,
  ChevronDown,
  ChevronUp,
  FileCode,
  Loader2,
  Share2,
  Check,
} from "lucide-react";
import { scanPR } from "../../server/auth";
import { createShareLink } from "../../server/share";
import { useAuth } from "../../lib/auth-context";
import PageHeader from "../../components/PageHeader";
import ScanAnimation from "../../components/ScanAnimation";
import DiffViewer from "../../components/DiffViewer";
import AiEvidenceCard from "../../components/AiEvidenceCard";
import StatCard from "../../components/StatCard";

export const Route = createFileRoute("/pr-scan/")({ component: PRScanPage });

interface PRScanResult {
  pr: {
    number: number;
    title: string;
    author: string;
    state: string;
    url: string;
  };
  scan: {
    trustScore: number;
    totalFindings: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    filesScanned: number;
    findings: Array<{
      patternType: string;
      filePath: string;
      lineStart: number;
      confidence: string;
      explanation: string;
      evidenceExcerpt: string;
    }>;
  };
  totalDiffLines: number;
}

function PRScanPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [prUrl, setPrUrl] = useState("");
  const [result, setResult] = useState<PRScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(
    new Set(),
  );

  // ── TanStack Query: Mutations ─────────────────────────────
  const scanPRMutation = useMutation({
    mutationFn: () => scanPR({ data: { prUrl: prUrl.trim() } }),
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => setError(err.message || "Failed to scan PR. Please try again."),
  });

  const createShareMutation = useMutation({
    mutationFn: () => {
      if (!result) throw new Error("No scan result");
      return createShareLink({
        data: {
          sourceType: "github_pr",
          sourceRef: result.pr.url,
          scanData: {
            trustScore: result.scan.trustScore,
            totalFindings: result.scan.totalFindings,
            highCount: result.scan.highCount,
            mediumCount: result.scan.mediumCount,
            lowCount: result.scan.lowCount,
            filesScanned: result.scan.filesScanned,
            files: result.scan.filesScanned,
            findings: result.scan.findings.map((f) => ({
              patternType: f.patternType,
              filePath: f.filePath,
              lineStart: f.lineStart,
              lineEnd: f.lineStart,
              confidence: f.confidence,
              explanation: f.explanation,
              evidenceExcerpt: f.evidenceExcerpt,
            })),
          },
        },
      });
    },
    onSuccess: async (shareResult) => {
      setShareUrl(shareResult.url);
      await navigator.clipboard.writeText(shareResult.url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    },
  });

  const toggleFinding = (idx: number) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (authLoading) {
    return (
      <div className="page-wrap flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-interactive" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="page-wrap px-4 pb-16 pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-ink">PR Scan</h1>
          <p className="text-ink-muted mt-2 mb-8">
            Analyze pull requests at the AST level to catch cheats and bypasses.
          </p>
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-16 max-w-md mx-auto">
            <GitPullRequest className="mx-auto mb-4 h-12 w-12 text-ink-subdued" />
            <h3 className="text-lg font-bold text-ink">Sign In Required</h3>
            <p className="mt-1 mb-6 text-sm text-ink-muted">
              Please sign in with GitHub to run automated scans on pull
              requests.
            </p>
            <button
              onClick={() => navigate({ to: "/login", search: { error: undefined } })}
              className="btn btn-primary w-full"
            >
              Sign In to Continue
            </button>
          </div>
        </div>
      </main>
    );
  }

  const handleScan = () => {
    if (!prUrl.trim()) return;
    setError(null);
    setResult(null);
    scanPRMutation.mutate();
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

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto">
        <PageHeader
          icon={Github}
          title="Scan a Pull Request"
          description="Paste a GitHub PR URL. Mantiz fetches the diff and scans for cheating patterns."
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Scan PR" }]}
          badge={{ label: "Requires auth", color: "interactive" }}
        />

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
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
            />
            <button
              onClick={handleScan}
              disabled={!prUrl.trim() || scanPRMutation.isPending}
              className="btn btn-primary whitespace-nowrap"
            >
              {scanPRMutation.isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {scanPRMutation.isPending ? "Scanning..." : "Scan"}
            </button>
          </div>

          <p className="mt-2 text-xs text-ink-subdued">
            Requires a public repository URL. Make sure you're authenticated
            with GitHub.
          </p>
        </div>

        {/* Scan Animation */}
        <AnimatePresence>
          {scanPRMutation.isPending && (
            <ScanAnimation
              isScanning={scanPRMutation.isPending}
              scanPhase="static"
              lineCount={result?.totalDiffLines || 100}
              onComplete={() => {}}
              findings={result?.scan.findings.map((f) => ({
                patternType: f.patternType as any,
                filePath: f.filePath,
                lineStart: f.lineStart,
                lineEnd: f.lineStart,
                confidence: f.confidence as any,
                explanation: f.explanation,
                evidenceExcerpt: f.evidenceExcerpt,
              })) || []}
              trustScore={result?.scan.trustScore}
            />
          )}
        </AnimatePresence>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-xl border border-severity-critical/20 bg-severity-critical/5 p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-severity-critical" />
            <p className="text-sm text-severity-critical">{error}</p>
            {error.includes("Not authenticated") && (
              <Link
                to="/login"
                search={{ error: undefined }}
                className="mt-2 inline-flex items-center gap-1 text-sm text-interactive hover:underline"
              >
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
                    <ExternalLink className="h-3 w-3" />#{result.pr.number}
                  </a>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
                  <span>
                    by <strong className="text-ink">{result.pr.author}</strong>
                  </span>
                  <span>•</span>
                  <span>{result.pr.state}</span>
                </div>
              </div>

              {/* Trust Score */}
              <div
                className={`mb-6 rounded-xl border p-6 text-center ${getScoreBg(result.scan.trustScore)}`}
              >
                <div className="mb-2 flex items-center justify-center gap-2">
                  {result.scan.trustScore >= 80 ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : result.scan.trustScore >= 50 ? (
                    <AlertTriangle className="h-5 w-5 text-severity-medium" />
                  ) : (
                    <Shield className="h-5 w-5 text-severity-critical" />
                  )}
                  <span
                    className={`text-3xl font-bold ${getScoreColor(result.scan.trustScore)}`}
                  >
                    {result.scan.trustScore}
                  </span>
                </div>
                <div
                  className={`text-sm font-semibold ${getScoreColor(result.scan.trustScore)}`}
                >
                  {getScoreLabel(result.scan.trustScore)}
                </div>

                {/* Score bar */}
                <div className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${result.scan.trustScore}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className={`h-full rounded-full ${
                      result.scan.trustScore >= 80
                        ? "bg-success"
                        : result.scan.trustScore >= 50
                          ? "bg-severity-medium"
                          : "bg-severity-critical"
                    }`}
                  />
                </div>
              </div>

              {/* Summary stats */}
              <StatCard
                stats={[
                  { label: "Findings", value: result.scan.totalFindings, color: result.scan.totalFindings > 0 ? "text-severity-critical" : "text-success" },
                  { label: "High", value: result.scan.highCount, color: result.scan.highCount > 0 ? "text-severity-critical" : "text-ink-muted" },
                  { label: "Medium", value: result.scan.mediumCount, color: result.scan.mediumCount > 0 ? "text-severity-medium" : "text-ink-muted" },
                  { label: "Low", value: result.scan.lowCount, color: result.scan.lowCount > 0 ? "text-severity-info" : "text-ink-muted" },
                  { label: "PR Files", value: result.scan.filesScanned, color: "text-interactive" },
                ]}
              />

              {/* Findings — Card style */}
              {result.scan.findings.length > 0 ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink">
                      Findings ({result.scan.findings.length})
                    </h3>
                    <span className="text-xs text-ink-muted">
                      {result.scan.highCount} high
                    </span>
                  </div>
                  {result.scan.findings.map((finding, idx) => {
                    const isExpanded = expandedFindings.has(idx);
                    const isHigh = finding.confidence === 'high';
                    const isAI = finding.patternType === 'ai_assisted_detection';
                    const borderColor = isHigh
                      ? 'border-severity-critical/25'
                      : 'border-border';
                    const severityBadge = isHigh
                      ? 'bg-severity-critical/10 text-severity-critical border-severity-critical/25'
                      : finding.confidence === 'medium'
                        ? 'bg-severity-medium/10 text-severity-medium border-severity-medium/25'
                        : 'bg-surface-2 text-ink-muted border-border';

                    return (
                      <motion.div
                        key={idx}
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
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-ink-muted" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-ink-muted" />
                            )}
                          </div>
                        </button>

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
                                  <span className="ml-auto opacity-50">{finding.patternType.replace(/_/g, ' ')}</span>
                                </div>
                                {isAI ? (
                                  <AiEvidenceCard content={finding.evidenceExcerpt} />
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
                    This PR looks clean. The AI agent passed the honesty check.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setResult(null);
                    setPrUrl("");
                  }}
                  className="btn btn-secondary"
                >
                  <Code2 className="h-4 w-4" />
                  Scan Another PR
                </button>
                <button
                  onClick={() => {
                    if (shareUrl) {
                      navigator.clipboard.writeText(shareUrl).then(() => {
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000);
                      }).catch(() => {});
                      return;
                    }
                    createShareMutation.mutate();
                  }}
                  disabled={createShareMutation.isPending}
                  className="btn btn-secondary"
                >
                  {createShareMutation.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : copySuccess ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  {createShareMutation.isPending ? "Generating..." : copySuccess ? "Link Copied!" : shareUrl ? "Copy Link" : "Share Results"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!result && !scanPRMutation.isPending && !error && prUrl.trim() === "" && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
            <Github className="mx-auto mb-3 h-10 w-10 text-ink-subdued" />
            <p className="text-ink-muted">
              Paste a PR URL and click{" "}
              <strong className="text-ink">Scan</strong> to get started.
            </p>
            <p className="mt-1 text-xs text-ink-subdued">
              Example: https://github.com/facebook/react/pull/12345
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
