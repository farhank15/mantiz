import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ban,
  Replace,
  FlaskConical,
  FileX,
  VolumeX,
  Search,
  Terminal,
  Wrench,
  Sparkles,
} from "lucide-react";
import type { Finding } from "../detectors/types";

interface DetectorStep {
  id: string;
  label: string;
  icon: typeof Search;
  color: string;
}

const DETECTORS: DetectorStep[] = [
  { id: "disabled_assertion", label: "Disabled Assertion", icon: Ban, color: "var(--severity-critical)" },
  { id: "assertion_tampering", label: "Assertion Tampering", icon: Replace, color: "var(--severity-critical)" },
  { id: "mock_to_avoid_failure", label: "Mock-to-Avoid-Failure", icon: FlaskConical, color: "var(--severity-high)" },
  { id: "claim_diff_mismatch", label: "Claim-Diff Mismatch", icon: FileX, color: "var(--severity-medium)" },
  { id: "silent_catch_and_pass", label: "Silent Catch-and-Pass", icon: VolumeX, color: "var(--severity-high)" },
  { id: "hallucinated_assertion", label: "Hallucinated Assertion", icon: Wrench, color: "var(--severity-info)" },
  { id: "ai_assisted_detection", label: "AI-Assisted Detection", icon: Sparkles, color: "var(--interactive)" },
];

const SCAN_MESSAGES = [
  "Parsing diff structure...",
  "Analyzing hunk boundaries...",
  "Building AST tree...",
  "Scanning assertion patterns...",
  "Checking for .skip() bypasses...",
  "Cross-referencing old vs new values...",
  "Evaluating mock ratios...",
  "Comparing claims against diff...",
  "Inspecting catch block bodies...",
  "Detecting hallucinated matchers...",
  "Calculating weighted trust score...",
  "Generating remediation instructions...",
  "Finalizing verdict...",
];

const AI_MESSAGES = [
  "Querying AI model...",
  "Analyzing code semantics...",
  "Checking for subtle cheating patterns...",
  "Evaluating test intent vs implementation...",
  "Cross-referencing with AI knowledge...",
  "Formulating AI verdict...",
];

interface ScanAnimationProps {
  isScanning: boolean;
  lineCount: number;
  onComplete: () => void;
  findings?: Finding[];
  trustScore?: number;
  scanPhase: 'idle' | 'static' | 'ai' | 'done';
}

export default function ScanAnimation({
  isScanning,
  lineCount,
  onComplete,
  findings = [],
  trustScore,
  scanPhase,
}: ScanAnimationProps) {
  const [activeStep, setActiveStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Initializing...");
  const [linesScanned, setLinesScanned] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [scanLog, setScanLog] = useState<string[]>(["$ mantiz scan --diff"]);

  const doneCalled = useRef(false);

  // Reset state when scanning starts
  useEffect(() => {
    if (!isScanning) {
      setActiveStep(-1);
      setProgress(0);
      setLinesScanned(0);
      setElapsed(0);
      setScanLog(["$ mantiz scan --diff"]);
      doneCalled.current = false;
      return;
    }
  }, [isScanning]);

  // Drive animation based on scanPhase
  useEffect(() => {
    if (!isScanning || scanPhase === 'idle') return;

    const intervals: ReturnType<typeof setInterval>[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    if (scanPhase === 'static') {
      // --- STATIC PHASE: Rapidly step through 6 detectors ---
      setActiveStep(0);
      setProgress(5);
      setLinesScanned(0);
      setScanLog((prev) => [...prev, "→ Running 6 static detectors..."]);

      const stepInterval = setInterval(() => {
        setActiveStep((prev) => {
          if (prev >= 5) {
            clearInterval(stepInterval);
            return 5;
          }
          return prev + 1;
        });
        setProgress((prev) => Math.min(prev + 9, 55));
      }, 100);
      intervals.push(stepInterval);

      const lineInterval = setInterval(() => {
        setLinesScanned((prev) => {
          const next = prev + Math.max(1, Math.floor(lineCount / 6));
          if (next >= lineCount) {
            clearInterval(lineInterval);
            return lineCount;
          }
          return next;
        });
      }, 100);
      intervals.push(lineInterval);

      const msgInterval = setInterval(() => {
        setMessage(SCAN_MESSAGES[Math.floor(Math.random() * SCAN_MESSAGES.length)]);
      }, 200);
      intervals.push(msgInterval);

    } else if (scanPhase === 'ai') {
      // --- AI PHASE: AI detection in progress (slow) ---
      setActiveStep(6);
      setProgress(60);
      setLinesScanned(lineCount);
      setElapsed(0);
      setScanLog((prev) => [...prev, "→ AI-Assisted Detection (analyzing...)"]);

      const elapsedInterval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
      intervals.push(elapsedInterval);

      const msgInterval = setInterval(() => {
        setMessage(AI_MESSAGES[Math.floor(Math.random() * AI_MESSAGES.length)]);
      }, 2000);
      intervals.push(msgInterval);

    } else if (scanPhase === 'done') {
      // --- DONE PHASE: Show completion ---
      setActiveStep(-1);
      setProgress(100);
      setLinesScanned(lineCount);
      setMessage("Scan complete");

      // Build result log entries
      const findingsByDetector = new Map<string, Finding[]>();
      for (const f of findings) {
        const existing = findingsByDetector.get(f.patternType) || [];
        existing.push(f);
        findingsByDetector.set(f.patternType, existing);
      }

      const newEntries: string[] = [];
      for (const detector of DETECTORS) {
        const detectorFindings = findingsByDetector.get(detector.id) || [];
        const count = detectorFindings.length;
        const hasHigh = detectorFindings.some((f) => f.confidence === "high");
        const statusIcon = count > 0 ? (hasHigh ? "⚠" : "!") : "✓";
        newEntries.push(
          `${statusIcon} ${detector.label} — ${count} finding${count !== 1 ? "s" : ""}`,
        );
      }

      if (trustScore !== undefined) {
        const scoreLine =
          trustScore >= 80
            ? "✓ Trust Score: "
            : trustScore >= 50
              ? "! Trust Score: "
              : "✗ Trust Score: ";
        newEntries.push(`─────────────────────────────────`);
        newEntries.push(
          `${scoreLine}${trustScore}/100 — ${
            trustScore >= 80 ? "CLEAN" : trustScore >= 50 ? "SUSPICIOUS" : "CHEATING DETECTED"
          }`,
        );
      }
      newEntries.push(`─────────────────────────────────`);

      // Append log entries with stagger for visual effect
      newEntries.forEach((entry, i) => {
        timeouts.push(
          setTimeout(() => {
            setScanLog((prev) => [...prev, entry]);
          }, i * 80),
        );
      });

      // Call onComplete after all entries are shown + brief pause
      const totalDelay = newEntries.length * 80 + 500;
      timeouts.push(
        setTimeout(() => {
          if (!doneCalled.current) {
            doneCalled.current = true;
            onComplete();
          }
        }, Math.min(totalDelay, 2000)),
      );
    }

    return () => {
      intervals.forEach(clearInterval);
      timeouts.forEach(clearTimeout);
    };
  }, [scanPhase, isScanning]);



  const totalFindings = findings.length;
  const highCount = findings.filter((f) => f.confidence === "high").length;
  const isClean = totalFindings === 0;

  if (!isScanning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-border bg-surface-1 overflow-hidden"
    >
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-surface-2 px-5 py-3 flex items-center gap-3">
        <div className="relative flex h-6 w-6 items-center justify-center">
          {scanPhase === 'done' ? (
            isClean ? (
              <div className="h-2 w-2 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
            ) : (
              <div className="h-2 w-2 rounded-full bg-severity-critical shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
            )
          ) : (
            <>
              <div className="absolute h-full w-full animate-ping rounded-full bg-interactive/20" />
              <div className="relative h-2 w-2 rounded-full bg-interactive shadow-[0_0_6px_rgba(88,166,255,0.5)]" />
            </>
          )}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">
            {scanPhase === 'static' && "Scanning Diff"}
            {scanPhase === 'ai' && "Running AI Analysis"}
            {scanPhase === 'done' && (isClean ? "All Clear" : "Cheating Detected")}
          </div>
          <div className="text-[10px] text-ink-subdued font-mono">
            {scanPhase === 'static' && (message || "Running detectors...")}
            {scanPhase === 'ai' && `AI analyzing... (${elapsed}s elapsed)`}
            {scanPhase === 'done' && `${totalFindings} finding${totalFindings !== 1 ? "s" : ""} · ${highCount} high severity`}
          </div>
        </div>
        <div className="text-xs font-mono text-ink-muted tabular-nums min-w-[3ch] text-right">
          {scanPhase === 'done' ? "100%" : scanPhase === 'ai' ? "~70%" : `${progress}%`}
        </div>
      </div>

      {/* ─── PROGRESS BAR ────────────────────────────────────────── */}
      <div className="h-1 w-full bg-surface-2 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            scanPhase === 'done'
              ? isClean
                ? "bg-success"
                : "bg-severity-critical"
              : "bg-linear-to-r from-interactive via-severity-medium to-severity-critical"
          }`}
          animate={scanPhase === 'ai'
            ? { width: ["62%", "68%", "62%"] }
            : { width: `${progress}%` }}
          transition={scanPhase === 'ai'
            ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.15, ease: "linear" }}
        />
      </div>

      <div className="p-5 space-y-5">
        {/* ─── LINES + DETECTORS GRID ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Lines scanned */}
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subdued mb-2">
              Lines Analyzed
            </div>
            <div className="flex items-baseline gap-1">
              <motion.span
                key={linesScanned}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold text-ink tabular-nums"
              >
                {linesScanned.toLocaleString()}
              </motion.span>
              <span className="text-sm text-ink-muted">
                / {lineCount.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-1">
              <motion.div
                className="h-full rounded-full bg-interactive"
                animate={{
                  width: `${lineCount > 0 ? (linesScanned / lineCount) * 100 : 0}%`,
                }}
                transition={{ duration: 0.2 }}
              />
            </div>
          </div>

          {/* Detector summary */}
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subdued mb-2">
              Detectors
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-ink tabular-nums">
                {scanPhase === 'done'
                  ? DETECTORS.length
                  : scanPhase === 'ai'
                    ? 6  // Static done, AI in progress
                    : Math.min(activeStep + 1, 6)}
              </span>
              <span className="text-sm text-ink-muted">
                / {DETECTORS.length}
              </span>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              {DETECTORS.map((detector, idx) => {
                const detectorFindings =
                  scanPhase === 'done'
                    ? findings.filter((f) => f.patternType === detector.id).length
                    : 0;
                const isStaticDetector = idx < 6;
                const isDone =
                  scanPhase === 'done' ||
                  (scanPhase === 'ai' && isStaticDetector) ||
                  (scanPhase === 'static' && idx < activeStep);
                const isActive = idx === activeStep && (scanPhase === 'static' || (scanPhase === 'ai' && idx === 6));
                const hasIssues = detectorFindings > 0;

                return (
                  <div
                    key={detector.id}
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
                      scanPhase === 'done' && hasIssues
                        ? "bg-severity-critical/20 text-severity-critical"
                        : isDone
                          ? "bg-success/20 text-success"
                          : isActive
                            ? "bg-interactive/20 text-interactive shadow-[0_0_8px_rgba(88,166,255,0.3)]"
                            : scanPhase === 'ai' && idx === 6
                              ? "bg-interactive/10 text-interactive animate-pulse"
                              : "bg-surface-1 text-ink-subdued"
                    }`}
                    title={`${detector.label}: ${detectorFindings} finding${detectorFindings !== 1 ? "s" : ""}`}
                  >
                    {isDone ? (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    ) : (
                      <detector.icon className="h-3 w-3" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── TERMINAL LOG ───────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-black/5 dark:bg-white/5 overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <Terminal className="h-3 w-3 text-ink-subdued" />
            <span className="text-[10px] font-medium text-ink-subdued">
              scan.log
            </span>
            {scanPhase === 'done' && (
              <span className="ml-auto text-[10px] text-ink-muted">
                {totalFindings > 0 ? `${totalFindings} issue${totalFindings !== 1 ? "s" : ""}` : "No issues"}
              </span>
            )}
          </div>
          <div className="p-3 font-mono text-[11px] leading-5 max-h-40 overflow-y-auto">
            {scanLog.map((line, i) => {
              let lineClass = "text-ink-muted";
              if (line.startsWith("$")) lineClass = "text-ink-muted";
              else if (line.startsWith("→")) lineClass = "text-interactive";
              else if (line.startsWith("✓") || line.startsWith("✦")) lineClass = "text-success";
              else if (line.startsWith("! ")) lineClass = "text-severity-medium";
              else if (line.startsWith("✗") || line.startsWith("⚠")) lineClass = "text-severity-critical";
              else if (line.startsWith("─")) lineClass = "text-ink-subdued";
              else if (line.includes("Trust Score")) {
                if (line.startsWith("✓")) lineClass = "text-success font-bold";
                else if (line.startsWith("!")) lineClass = "text-severity-medium font-bold";
                else lineClass = "text-severity-critical font-bold";
              }

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className={lineClass}
                >
                  {line}
                </motion.div>
              );
            })}
            {scanPhase !== 'done' && (
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-ink-muted inline-block"
              >
                _
              </motion.div>
            )}
          </div>
        </div>

        {/* ─── RESULTS BREAKDOWN ──────────────────────────────────── */}
        <AnimatePresence>
          {scanPhase === 'done' && findings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subdued">
                Per-Detector Breakdown
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DETECTORS.map((detector) => {
                  const detectorFindings = findings.filter(
                    (f) => f.patternType === detector.id,
                  );
                  if (detectorFindings.length === 0) return null;

                  const high = detectorFindings.filter(
                    (f) => f.confidence === "high",
                  ).length;
                  const medium = detectorFindings.filter(
                    (f) => f.confidence === "medium",
                  ).length;
                  const low = detectorFindings.filter(
                    (f) => f.confidence === "low",
                  ).length;

                  return (
                    <motion.div
                      key={detector.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-lg border border-severity-critical/20 bg-severity-critical/5 p-3"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <detector.icon
                          className="h-3.5 w-3.5"
                          style={{ color: detector.color }}
                        />
                        <span className="text-xs font-semibold text-ink">
                          {detector.label}
                        </span>
                        <span className="ml-auto text-xs font-bold text-severity-critical">
                          {detectorFindings.length}
                        </span>
                      </div>
                      <div className="flex gap-2 text-[10px] text-ink-subdued">
                        {high > 0 && (
                          <span className="text-severity-critical">
                            {high} high
                          </span>
                        )}
                        {medium > 0 && (
                          <span className="text-severity-medium">
                            {medium} med
                          </span>
                        )}
                        {low > 0 && (
                          <span className="text-severity-info">{low} low</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── CURRENT DETECTOR HIGHLIGHT ─────────────────────────── */}
        <AnimatePresence mode="wait">
          {scanPhase !== 'done' && activeStep >= 0 && activeStep < DETECTORS.length && (
            <motion.div
              key={`${scanPhase}-${activeStep}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 rounded-lg border border-interactive/20 bg-interactive/5 px-4 py-2.5"
            >
              {(() => {
                const Icon = DETECTORS[activeStep].icon;
                return (
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: DETECTORS[activeStep].color }}
                  />
                );
              })()}
              <span className="text-sm font-medium text-ink flex-1">
                {scanPhase === 'ai' && activeStep === 6
                  ? `AI-Assisted Detection — analyzing... (${elapsed}s)`
                  : DETECTORS[activeStep].label}
              </span>
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-interactive"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── FOOTER ──────────────────────────────────────────────── */}
      <div className="border-t border-border bg-surface-2 px-5 py-2">
        <div className="flex items-center justify-between text-[10px] text-ink-subdued">
          <span>
            {scanPhase === 'static' && "Mode: Static Analysis · Babel AST"}
            {scanPhase === 'ai' && "Mode: AI Analysis · LLM-assisted"}
            {scanPhase === 'done' && `${totalFindings} finding${totalFindings !== 1 ? "s" : ""} · ${highCount} high severity`}
          </span>
          <span>v2.0.0</span>
        </div>
      </div>
    </motion.div>
  );
}
