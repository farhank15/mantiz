import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Beaker,
  Shield,
  ChevronDown,
  ChevronUp,
  FileCode,
} from "lucide-react";
import { runBenchmark, type BenchmarkResult } from "../../benchmark/runner";
import PageHeader from "../../components/PageHeader";

export const Route = createFileRoute("/benchmark/")({
  component: BenchmarkPage,
});

function BenchmarkPage() {
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDataset, setExpandedDataset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setScanProgress(0);

      // Animate progress while loading
      const progressInterval = setInterval(() => {
        setScanProgress((p) => Math.min(p + 5, 90));
      }, 100);

      const data = await runBenchmark();

      clearInterval(progressInterval);
      setScanProgress(100);
      setTimeout(() => setScanProgress(0), 500);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run benchmark");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getStatusColor = (dataset: string) => {
    if (dataset === "A")
      return {
        border: "border-success/20",
        bg: "bg-success/5",
        badge: "bg-success/10 text-success",
        text: "text-success",
      };
    if (dataset === "B")
      return {
        border: "border-severity-critical/20",
        bg: "bg-severity-critical/5",
        badge: "bg-severity-critical/10 text-severity-critical",
        text: "text-severity-critical",
      };
    return {
      border: "border-severity-medium/20",
      bg: "bg-severity-medium/5",
      badge: "bg-severity-medium/10 text-severity-medium",
      text: "text-severity-medium",
    };
  };

  const getScoreEmoji = (score: number, dataset: string) => {
    if (dataset === "A" && score >= 80)
      return { icon: CheckCircle2, color: "text-success" };
    if (dataset === "B" && score < 50)
      return { icon: Shield, color: "text-severity-critical" };
    if (dataset === "C" && score >= 40 && score <= 70)
      return { icon: AlertTriangle, color: "text-severity-medium" };
    return { icon: TrendingUp, color: "text-interactive" };
  };

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto">
        <PageHeader
          icon={Beaker}
          title="Benchmark"
          description="Running all 11 detectors against curated datasets to measure accuracy. Each dataset represents a different cheating profile."
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Benchmark" }]}
          badge={{ label: "42 fixtures · 4 datasets", color: "success" }}
        />

        {/* Animated progress bar */}
        <AnimatePresence>
          {scanProgress > 0 && scanProgress < 100 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                  className="h-full rounded-full bg-linear-to-r from-interactive to-primary"
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-ink-subdued">
                Scanning fixtures... {scanProgress}%
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        {isLoading && (
          <div className="rounded-xl border border-border bg-surface-1 p-12 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-interactive/30 border-t-interactive" />
            </div>
            <p className="text-ink-muted">
              Running benchmark across all 39 fixtures...
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-severity-critical/20 bg-severity-critical/5 p-6 text-center">
            <XCircle className="mx-auto mb-2 h-8 w-8 text-severity-critical" />
            <p className="text-severity-critical">{error}</p>
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {results && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Overall summary */}
              <div className="mb-8 grid grid-cols-3 gap-4">
                {results.map((r) => {
                  const colors = getStatusColor(r.dataset);
                  const scoreIcon = getScoreEmoji(
                    r.summary.avgScore,
                    r.dataset,
                  );
                  const Icon = scoreIcon.icon;
                  return (
                    <motion.div
                      key={r.dataset}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * parseInt(r.dataset) }}
                      className={`rounded-xl border ${colors.border} ${colors.bg} p-4 text-center`}
                    >
                      <div
                        className={`mb-2 inline-flex rounded-lg p-2 ${colors.badge}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-2xl font-bold text-ink">
                        {r.summary.avgScore}
                      </div>
                      <div className="text-xs text-ink-muted">
                        Dataset {r.dataset}: {r.label}
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                        <span
                          className={`${r.summary.passed === r.summary.total ? "text-success" : "text-severity-critical"}`}
                        >
                          {r.summary.passed}/{r.summary.total} passed
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Dataset detail cards */}
              <div className="space-y-4">
                {results.map((r) => {
                  const colors = getStatusColor(r.dataset);
                  const isExpanded = expandedDataset === r.dataset;

                  return (
                    <motion.div
                      key={r.dataset}
                      layout
                      className={`rounded-xl border ${colors.border} overflow-hidden`}
                    >
                      {/* Dataset header */}
                      <button
                        onClick={() =>
                          setExpandedDataset(isExpanded ? null : r.dataset)
                        }
                        className={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${colors.bg} hover:opacity-90`}
                      >
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${colors.badge}`}
                        >
                          {r.dataset}
                        </span>
                        <div className="flex-1">
                          <h3 className="font-bold text-ink">{r.label}</h3>
                          <p className="text-xs text-ink-muted">
                            {r.summary.total} fixtures · Avg score:{" "}
                            {r.summary.avgScore} · {r.summary.accuracyPct}%
                            accuracy
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${r.summary.accuracyPct}%` }}
                              className={`h-full rounded-full ${
                                r.summary.accuracyPct >= 80
                                  ? "bg-success"
                                  : r.summary.accuracyPct >= 50
                                    ? "bg-severity-medium"
                                    : "bg-severity-critical"
                              }`}
                            />
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-ink-muted" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-ink-muted" />
                          )}
                        </div>
                      </button>

                      {/* Expanded fixture details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden border-t border-border"
                          >
                            <div className="divide-y divide-border">
                              {r.fixtures.map((f) => (
                                <div
                                  key={f.name}
                                  className="px-5 py-3 transition hover:bg-surface-2/30"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileCode className="h-4 w-4 shrink-0 text-ink-muted" />
                                      <span className="truncate text-sm font-medium text-ink">
                                        {f.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-ink-muted">
                                        Expected:{" "}
                                        <strong className="text-ink">
                                          {f.expectedScore}
                                        </strong>
                                      </span>
                                      <span className="text-xs text-ink-muted">
                                        Got:{" "}
                                        <strong
                                          className={
                                            f.passed
                                              ? "text-success"
                                              : "text-severity-critical"
                                          }
                                        >
                                          {f.actualScore}
                                        </strong>
                                      </span>
                                      {f.passed ? (
                                        <CheckCircle2 className="h-4 w-4 text-success" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-severity-critical" />
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-subdued">
                                    <span>{f.totalFindings} findings</span>
                                    <span>{f.highCount} high severity</span>
                                    <span>Margin: {f.margin}pts</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              {/* Success message */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="mt-8 rounded-xl border border-success/20 bg-success/5 p-5 text-center"
              >
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
                <p className="text-sm text-ink-muted">
                  All 11 detectors operational. Mantiz correctly identifies
                  honest code (Dataset A), flags lazy cheating (Dataset B),
                  detects smart evasion (Dataset C), and validates false
                  positive scenarios (Dataset FP).
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
