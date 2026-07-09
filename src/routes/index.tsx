import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Ban,
  Replace,
  FlaskConical,
  FileX,
  VolumeX,
  TrendingDown,
  SkipForward,
  Search,
  Github,
  Brain,
  Shield,
  ArrowRight,
  Terminal,
  CheckCircle2,
  Zap,
  GitBranch,
  ScrollText,
  Swords,
  BugPlay,
  FileCode,
} from "lucide-react";
import RetroGrid from "#/components/magicui/retro-grid";
import ShimmerButton from "#/components/magicui/shimmer-button";
import Marquee from "#/components/magicui/marquee";
import NumberTicker from "#/components/magicui/number-ticker";
import AnimatedGradientText from "#/components/magicui/animated-gradient-text";
import Meteors from "#/components/magicui/meteors";
import Particles from "#/components/magicui/particles";
import BeamNetwork from "#/components/magicui/beam-network";
import { scanDiff } from "#/detectors/engine";

export const Route = createFileRoute("/")({ component: App });

const detectionPatterns = [
  {
    name: "Hallucinated Assertion",
    severity: "Critical",
    color: "severity-critical",
    icon: Ban,
    codeSample: `- expect(result).toExist()       // AI-hallucinated matcher
+ expect(result).toBeDefined()  // fixed`,
    longDesc:
      "Non-existent Jest/Vitest matchers hallucinated by AI agents (e.g. .toExist(), .toBeString()). Precision: 77.8%.",
  },
  {
    name: "Assertion Tampering",
    severity: "Critical",
    color: "severity-critical",
    icon: Replace,
    codeSample: `- expect(result).toBe(42)       // original
+ expect(result).toBe(-1)       // tampered`,
    longDesc:
      "Expected value in a test changed to match broken output, with no corresponding spec change. Precision: 100%.",
  },
  {
    name: "Mock-to-Avoid-Failure",
    severity: "High",
    color: "severity-high",
    icon: FlaskConical,
    codeSample: `+ jest.mock('./api', () => ({  // NEW mock
+   fetchData: () => mockData
+ }))`,
    longDesc:
      "New mock introduced around a previously-failing real call path, with no coverage of the real path. Precision: 100%.",
  },
  {
    name: "Disabled Assertion",
    severity: "Critical",
    color: "severity-critical",
    icon: SkipForward,
    codeSample: `- // assert.equal(add(2,3), 5)  // commented out
+ assert.equal(add(2,3), 5)`,
    longDesc:
      "Test or assertion commented out, wrapped in if(false), or marked .skip() in the same diff that claims a fix. Precision: 45.5%.",
  },
  {
    name: "Silent Catch-and-Pass",
    severity: "High",
    color: "severity-high",
    icon: VolumeX,
    codeSample: `+ try {
+   riskyOperation()
+ } catch (e) {  // empty — swallows error
+   // TODO
+ }`,
    longDesc:
      "Empty catch block newly added around code that previously threw and failed a test. Precision: 33.3%.",
  },
  {
    name: "Mutation Susceptibility",
    severity: "Medium",
    color: "severity-medium",
    icon: TrendingDown,
    codeSample: `- expect(result).toBe(true)     // single assertion
+ expect(result).toBe(true)
+ expect(result.id).toBeDefined()
+ expect(result.name).toBeString()`,
    longDesc:
      "Detects fragile tests with low assertion density that can be easily mutated to pass with broken code. Precision: 30.0%.",
  },
  {
    name: "Claim-Diff Mismatch",
    severity: "Medium",
    color: "severity-medium",
    icon: FileX,
    codeSample: `> fix(auth): resolve login timeout

  src/styles.css  // only CSS changed
  src/utils.ts    // no auth-related files`,
    longDesc:
      "Commit message claims to fix behavior X, but the diff contains zero changes to files related to X.",
  },
  {
    name: "Tree-sitter AST",
    severity: "High",
    color: "severity-high",
    icon: Terminal,
    codeSample: `+ def test_add():          // Python
+   assert add(1,2) == 3
- def test_add_skip():    // skipped
-   pass`,
    longDesc:
      "Multi-language AST analysis via WASM parsers — Python, Go, Java, Ruby, Rust, and PHP detection.",
  },
  {
    name: "Historical Behavioral",
    severity: "Info",
    color: "severity-info",
    icon: Search,
    codeSample: `> Author: "bot-user-1337"
> PR #1: Score 100  (3 AM)
> PR #2: Score 95   (4 AM)
> PR #3: Score 100  (3:30 AM)`,
    longDesc:
      "Tracks author behavior patterns — style changes, odd-hour commits, score volatility, and frequency anomalies.",
  },
  {
    name: "AI-Assisted Detection",
    severity: "High",
    color: "severity-high",
    icon: Brain,
    codeSample: `> LLM analysis: pattern detected
> Test weakening: ✓
> Assertion removal: ✓
> Coverage reduction: ✓`,
    longDesc:
      "LLM-powered semantic analysis detects test weakening, assertion removal, and coverage reduction. Requires GROQ_API_KEY.",
  },
  {
    name: "AI Judge",
    severity: "Info",
    color: "severity-info",
    icon: Brain,
    codeSample: `> D6 flagged "toBeString"
> AI Judge: false positive
> → Valid custom matcher
> Finding downgraded`,
    longDesc:
      "Reviews static findings and filters false positives using LLM reasoning. Increases precision by removing invalid detections.",
  },
];

const severityFilters = ["All", "Critical", "High", "Medium", "Info"] as const;

function App() {
  const templates = {
    skip: `diff --git a/tests/math.test.ts b/tests/math.test.ts
--- a/tests/math.test.ts
+++ b/tests/math.test.ts
@@ -1,5 +1,5 @@
 describe('math', () => {
-  it('should add numbers', () => {
+  it.skip('should add numbers', () => {
     expect(1 + 1).toBe(2)
   })
 })`,
    catch: `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,6 +1,6 @@
 function process() {
+  try {
+    executeRisky()
+  } catch (e) {
+    // silent catch block
+  }
 }`,
    tampering: `diff --git a/tests/auth.test.ts b/tests/auth.test.ts
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -1,4 +1,4 @@
-  expect(auth.validate("valid")).toBe(true)
+  expect(auth.validate("invalid")).toBe(true)`,
    clean: `diff --git a/src/math.ts b/src/math.ts
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,3 @@
 export function add(a: number, b: number): number {
-  return a - b;
+  return a + b;
 }`
  };

  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [simulatorDiff, setSimulatorDiff] = useState<string>(templates.skip);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isScanningSim, setIsScanningSim] = useState(false);

  const handleSimulateScan = () => {
    setIsScanningSim(true);
    setTimeout(() => {
      try {
        const result = scanDiff(simulatorDiff);
        setScanResult(result);
      } catch (err) {
        console.error(err);
      }
      setIsScanningSim(false);
    }, 800);
  };
  const filteredPatterns =
    activeFilter === "All"
      ? detectionPatterns
      : detectionPatterns.filter((p) => p.severity === activeFilter);
  return (
    <main>
      {/* =============================================
          1. HERO SECTION — Animated with Meteors + Particles + Beam
           ============================================= */}
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-4 pb-24 pt-24">
        {/* Layer 1: Static dot background */}
        <RetroGrid className="z-0" glow={false} />

        {/* Layer 2: Meteors (shooting stars) */}
        <Meteors
          number={30}
          minDelay={0.3}
          maxDelay={2}
          minDuration={3}
          maxDuration={8}
          angle={210}
          className="z-1"
        />

        {/* Layer 3: Interactive particles */}
        <Particles
          className="absolute inset-0 z-2"
          quantity={80}
          staticity={40}
          color="#58A6FF"
          size={0.5}
        />

        {/* Layer 4: Glow effects */}
        <div className="pointer-events-none absolute -left-60 -top-60 z-3 h-150 w-150 rounded-full bg-[radial-gradient(circle,rgba(238,49,36,0.12),transparent_60%)]" />
        <div className="pointer-events-none absolute -right-60 -top-40 z-3 h-125 w-125 rounded-full bg-[radial-gradient(circle,rgba(88,166,255,0.1),transparent_60%)]" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-3 h-75 w-200 -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(238,49,36,0.05),transparent_60%)]" />

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          {/* Animated badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-severity-critical/25 bg-severity-critical/10 px-4 py-1.5 text-sm font-medium text-severity-critical"
          >
            <span className="live-dot" />
            AI Coding Agent Lie Detector
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl"
          >
            <span className="text-ink">Mantiz </span>
            <AnimatedGradientText className="ml-2 sm:ml-3">
              Hunts
            </AnimatedGradientText>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-10 max-w-2xl text-lg text-ink-muted sm:text-xl"
          >
            <strong className="text-ink">AI coding agent lie detector.</strong>
            <br className="sm:hidden" /> Scans diffs and PRs for the patterns
            agents use to fake a passing test suite.
            <br />
            <span className="italic text-ink-subdued">
              Your agent cheats. Mantiz doesn't.
            </span>
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap justify-center gap-4"
          >
            <Link to="/scan">
              <ShimmerButton
                shimmerColor="rgba(88,166,255,0.4)"
                background="rgba(88,166,255,0.15)"
                className="text-white"
                as="span"
              >
                <BugPlay className="h-4 w-4" />
                Scan a Diff
              </ShimmerButton>
            </Link>
            <ShimmerButton
              as="a"
              href="https://github.com/farhank15/mantiz"
              target="_blank"
              rel="noopener noreferrer"
              shimmerColor="rgba(255,255,255,0.1)"
              background="rgba(33,38,45,0.9)"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </ShimmerButton>
          </motion.div>
        </div>

        {/* Animated Beam Network — Multi-beam visualization */}
        <div className="relative z-10 mt-12 w-full max-w-3xl px-4">
          <BeamNetwork />
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2 text-ink-subdued">
            <span className="text-[10px] tracking-[0.2em] uppercase">
              Scroll
            </span>{" "}
            <svg
              className="h-4 w-4 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
        </motion.div>
      </section>

      {/* =============================================
          1.5 INTERACTIVE SIMULATOR (WOW FACTOR)
           ============================================= */}
      <section className="page-wrap px-4 py-16 relative">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-interactive/20 bg-interactive/8 px-4 py-1.5 text-xs font-semibold text-interactive">
              <Terminal className="h-3.5 w-3.5" />
              Live Playground
            </div>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              Try the Evasion Playground
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-muted">
              Select a cheat template or paste a diff to see how the AST scoring engine rates the code in real-time.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-12">
            {/* Input Editor */}
            <div className="panel p-5 md:col-span-7 flex flex-col justify-between">
              <div>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setSimulatorDiff(templates.skip);
                      setScanResult(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                      simulatorDiff === templates.skip
                        ? "bg-interactive/15 border-interactive text-interactive"
                        : "bg-surface-2 border-border text-ink-muted hover:text-ink"
                    }`}
                  >
                    Disabled Assertion (.skip)
                  </button>
                  <button
                    onClick={() => {
                      setSimulatorDiff(templates.catch);
                      setScanResult(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                      simulatorDiff === templates.catch
                        ? "bg-interactive/15 border-interactive text-interactive"
                        : "bg-surface-2 border-border text-ink-muted hover:text-ink"
                    }`}
                  >
                    Silent Catch Block
                  </button>
                  <button
                    onClick={() => {
                      setSimulatorDiff(templates.tampering);
                      setScanResult(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                      simulatorDiff === templates.tampering
                        ? "bg-interactive/15 border-interactive text-interactive"
                        : "bg-surface-2 border-border text-ink-muted hover:text-ink"
                    }`}
                  >
                    Assertion Tampering
                  </button>
                  <button
                    onClick={() => {
                      setSimulatorDiff(templates.clean);
                      setScanResult(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                      simulatorDiff === templates.clean
                        ? "bg-success/15 border-success/45 text-success"
                        : "bg-surface-2 border-border text-ink-muted hover:text-ink"
                    }`}
                  >
                    Clean Honest Diff
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    value={simulatorDiff}
                    onChange={(e) => setSimulatorDiff(e.target.value)}
                    className="w-full min-h-55 rounded-lg border border-border bg-canvas-dark p-4 font-mono text-xs text-ink leading-relaxed outline-hidden focus:border-interactive/50"
                    placeholder="Paste your git diff here..."
                  />
                  <div className="absolute right-3 top-3 rounded-md bg-canvas/60 px-2 py-1 text-[10px] font-mono text-ink-subdued border border-border">
                    diff-editor
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSimulateScan}
                  disabled={isScanningSim}
                  className="btn btn-primary w-full md:w-auto px-6 flex items-center justify-center gap-2"
                >
                  {isScanningSim ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Scanning AST...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Analyze Diff Live
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Live Output */}
            <div className="panel p-5 md:col-span-5 flex flex-col justify-between min-h-87.5">
              {!scanResult && !isScanningSim && (
                <div className="flex flex-1 flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-lg bg-canvas/30">
                  <Terminal className="h-10 w-10 text-ink-subdued mb-3 animate-pulse" />
                  <h4 className="text-sm font-semibold text-ink">Scan Pending</h4>
                  <p className="text-xs text-ink-muted mt-1 max-w-60">
                    Select a template and click "Analyze Diff Live" to see the engine's verdict.
                  </p>
                </div>
              )}

              {isScanningSim && (
                <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
                  <span className="relative flex h-12 w-12 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-interactive/20 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-8 w-8 bg-interactive/25 items-center justify-center">
                      <Brain className="h-4 w-4 text-interactive animate-pulse" />
                    </span>
                  </span>
                  <h4 className="text-sm font-semibold text-ink mt-4">Parsing AST Node Trees</h4>
                  <p className="text-xs text-ink-muted mt-1 animate-pulse">
                    Evaluating Weak Signal Fusion rules...
                  </p>
                </div>
              )}

              {scanResult && !isScanningSim && (
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    {/* Header Score Info */}
                    <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subdued">
                          Verdict
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                              scanResult.verdict?.label === "CLEAN"
                                ? "bg-success/15 text-success"
                                : scanResult.verdict?.label === "SUSPICIOUS"
                                  ? "bg-severity-medium/15 text-severity-medium"
                                  : "bg-severity-critical/15 text-severity-critical"
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {scanResult.verdict?.label || "CLEAN"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subdued">
                          Trust Score
                        </span>
                        <div className="text-3xl font-extrabold text-ink mt-0.5">
                          <span
                            style={{
                              color:
                                scanResult.trustScore >= 80
                                  ? "var(--success)"
                                  : scanResult.trustScore >= 50
                                    ? "var(--severity-medium)"
                                    : "var(--severity-critical)",
                            }}
                          >
                            {scanResult.trustScore}
                          </span>
                          <span className="text-sm text-ink-subdued">/100</span>
                        </div>
                      </div>
                    </div>

                    {/* Verdict description */}
                    <p className="text-xs text-ink-muted bg-surface-2 p-3 rounded-lg border border-border mb-4 italic">
                      "{scanResult.verdict?.reason}"
                    </p>

                    {/* Findings list */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subdued mb-2 block">
                        Findings ({scanResult.findings.length})
                      </span>
                      {scanResult.findings.length === 0 ? (
                        <div className="flex items-center gap-2 text-xs text-success bg-success/10 border border-success/20 p-3 rounded-lg">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>No suspicious cheating patterns found. Code is clean.</span>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-35 overflow-y-auto pr-1">
                          {scanResult.findings.map((f: any, idx: number) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-border bg-surface-2 p-2.5 flex items-start gap-2.5 transition hover:border-interactive/20"
                            >
                              <div
                                className="h-5 w-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                                style={{
                                  backgroundColor:
                                    f.confidence === "high"
                                      ? "var(--severity-critical)15"
                                      : f.confidence === "medium"
                                        ? "var(--severity-medium)15"
                                        : "var(--severity-info)15",
                                  color:
                                    f.confidence === "high"
                                      ? "var(--severity-critical)"
                                      : f.confidence === "medium"
                                        ? "var(--severity-medium)"
                                        : "var(--severity-info)",
                                }}
                              >
                                <Ban className="h-3 w-3" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-ink capitalize truncate">
                                    {f.patternType.replace(/_/g, " ")}
                                  </span>
                                  <span
                                    className="text-[9px] font-extrabold uppercase px-1 rounded border"
                                    style={{
                                      borderColor:
                                        f.confidence === "high"
                                          ? "var(--severity-critical)30"
                                          : f.confidence === "medium"
                                            ? "var(--severity-medium)30"
                                            : "var(--severity-info)30",
                                      color:
                                        f.confidence === "high"
                                          ? "var(--severity-critical)"
                                          : f.confidence === "medium"
                                            ? "var(--severity-medium)"
                                            : "var(--severity-info)",
                                    }}
                                  >
                                    {f.confidence}
                                  </span>
                                </div>
                                <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-2">
                                  {f.explanation}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-border pt-3 mt-4 flex justify-between items-center text-xs">
                    <span className="text-ink-subdued">Run complete in browser context</span>
                    <Link to="/scan" className="text-interactive hover:underline flex items-center gap-1 font-semibold">
                      Full Scanner Page <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =============================================
          2. STATS SECTION — Animated counters
           ============================================= */}
      <section className="page-wrap px-4 py-20">
        <div className="mx-auto">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Diffs Scanned", value: 488, suffix: "+" },
              { label: "Labeled PRs", value: 488, suffix: "" },
              { label: "Detection Patterns", value: 11, suffix: "" },
              { label: "Overlap Accuracy", value: 98, suffix: "%" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="panel p-6 text-center transition hover:border-interactive/30"
              >
                <div className="text-3xl font-bold text-ink sm:text-4xl">
                  <NumberTicker value={stat.value} suffix={stat.suffix} />
                </div>
                <div className="mt-2 text-sm text-ink-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =============================================
          3. MARQUEE SECTION — Detection patterns
           ============================================= */}
      <section className="relative overflow-hidden py-16">
        <div className="mb-8 px-4 text-center">
          <h2 className="text-2xl font-bold text-ink">What Mantiz Detects</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Patterns your AI agent might be using to fake a passing test suite
          </p>
        </div>

        <div className="relative">
          <Marquee pauseOnHover repeat={3} className="[--duration:40s]">
            {detectionPatterns.map((pattern, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-full border border-border bg-surface-1 px-5 py-2.5"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `var(--${pattern.color})` }}
                />
                <span className="text-sm font-medium text-ink whitespace-nowrap">
                  {pattern.name}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: `var(--${pattern.color})20`,
                    color: `var(--${pattern.color})`,
                  }}
                >
                  {pattern.severity}
                </span>
              </div>
            ))}
          </Marquee>
        </div>
      </section>

      {/* =============================================
          4. HOW IT WORKS — Flow Pipeline Visual
           ============================================= */}
      <section className="page-wrap px-4 py-20">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-interactive/20 bg-interactive/8 px-4 py-1.5 text-xs font-semibold text-interactive">
              <ScrollText className="h-3.5 w-3.5" />
              3-Step Pipeline
            </div>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              From Diff to <AnimatedGradientText>Verdict</AnimatedGradientText>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-muted">
              Paste any diff. Mantiz scans every line through 11 detection
              engines.
              <br />
              <span className="text-ink-subdued text-sm">
                No signup needed. No GitHub required.
              </span>
            </p>
          </motion.div>

          {/* Pipeline Steps — Desktop: horizontal, Mobile: vertical */}
          <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-start md:gap-0">
            {/* Connecting line (desktop: horizontal, mobile: vertical) */}
            <div className="absolute left-4.5 top-0 h-full w-px bg-linear-to-b from-interactive/40 via-severity-medium/30 to-severity-critical/40 md:left-0 md:top-12.5 md:h-px md:w-full md:bg-linear-to-r" />

            {/* Step 1: Paste Diff */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/3 md:flex-col md:pl-0 md:text-center"
            >
              {/* Step number badge */}
              <div
                aria-hidden="true"
                className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-interactive bg-canvas text-sm font-bold text-interactive md:static md:mx-auto md:mb-4"
              >
                1
              </div>
              <div className="flex-1 md:px-3">
                <div className="mb-2 flex items-center gap-2 md:justify-center">
                  <Search className="hidden h-5 w-5 text-interactive md:block" />
                  <h3 className="text-lg font-bold text-ink">Paste a Diff</h3>
                </div>
                <p className="mb-3 text-sm text-ink-muted">
                  Paste any GitHub-style diff or PR link. Mantiz parses every
                  changed line into structured hunks.
                </p>
                {/* Mini code preview */}
                <div className="overflow-hidden rounded-lg border border-border bg-surface-2 text-xs">
                  <div className="flex items-center gap-2 border-b border-border bg-surface-1 px-3 py-1.5 text-[10px] text-ink-subdued">
                    <span className="h-2 w-2 rounded-full bg-severity-critical/60" />
                    <span>diff --git a/test.js b/test.js</span>
                  </div>
                  <div className="space-y-px px-3 py-2 font-mono text-[11px] leading-5">
                    <span className="text-ink-subdued">@@ -10,7 +10,7 @@</span>
                    <br />
                    <span className="text-ink-subdued">
                      {" "}
                      function testAdd() &#123;
                    </span>
                    <br />
                    <span className="text-success">
                      + // assert.equal(add(2,3), 5)
                    </span>
                    <br />
                    <span className="text-ink-subdued"> &#125;</span>
                    <br />
                    <span className="text-severity-critical">
                      - assert.equal(add(2,3), 5)
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Arrow connector (desktop) */}
            <div className="hidden md:flex md:w-12 md:items-center md:justify-center md:pt-12.5">
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                whileInView={{ opacity: 1, scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="flex h-8 w-8 origin-center items-center justify-center"
              >
                {" "}
                <ArrowRight className="h-5 w-5 text-interactive/60" />
              </motion.div>
            </div>

            {/* Step 2: Analyze Patterns */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/3 md:flex-col md:pl-0 md:text-center"
            >
              <div
                aria-hidden="true"
                className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-severity-medium bg-canvas text-sm font-bold text-severity-medium md:static md:mx-auto md:mb-4"
              >
                2
              </div>
              <div className="flex-1 md:px-3">
                <div className="mb-2 flex items-center gap-2 md:justify-center">
                  <Brain className="hidden h-5 w-5 text-severity-medium md:block" />
                  <h3 className="text-lg font-bold text-ink">
                    11 Detection Engines
                  </h3>
                </div>
                <p className="mb-3 text-sm text-ink-muted">
                  Each line is scanned against 11 patterns. Findings are ranked
                  by confidence and severity.
                </p>
                {/* Detector badges */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "Disabled Assertion", color: "severity-critical" },
                    {
                      label: "Assertion Tampering",
                      color: "severity-critical",
                    },
                    { label: "Mock Avoid Failure", color: "severity-high" },
                    { label: "Claim-Diff Mismatch", color: "severity-medium" },
                    { label: "Silent Catch-Pass", color: "severity-high" },
                    { label: "Tree-sitter AST", color: "severity-high" },
                    { label: "Hist. Behavioral", color: "severity-info" },
                    { label: "Mutation Suscpt.", color: "severity-medium" },
                    { label: "AI-Assisted", color: "severity-high" },
                    { label: "AI Judge", color: "severity-info" },
                  ].map((d) => (
                    <span
                      key={d.label}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-105"
                      style={{
                        borderColor: `var(--${d.color})30`,
                        backgroundColor: `var(--${d.color})12`,
                        color: `var(--${d.color})`,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: `var(--${d.color})` }}
                      />
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Arrow connector (desktop) */}
            <div className="hidden md:flex md:w-12 md:items-center md:justify-center md:pt-12.5">
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                whileInView={{ opacity: 1, scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="flex h-8 w-8 origin-center items-center justify-center"
              >
                {" "}
                <ArrowRight className="h-5 w-5 text-severity-medium/60" />
              </motion.div>
            </div>

            {/* Step 3: Get Verdict */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/3 md:flex-col md:pl-0 md:text-center"
            >
              <div
                aria-hidden="true"
                className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-severity-critical bg-canvas text-sm font-bold text-severity-critical md:static md:mx-auto md:mb-4"
              >
                3
              </div>
              <div className="flex-1 md:px-3">
                <div className="mb-2 flex items-center gap-2 md:justify-center">
                  <CheckCircle2 className="hidden h-5 w-5 text-severity-critical md:block" />
                  <h3 className="text-lg font-bold text-ink">
                    Get the Verdict
                  </h3>
                </div>
                <p className="mb-3 text-sm text-ink-muted">
                  Trust score (0-100) with ranked findings and evidence excerpts
                  for every detection.
                </p>
                {/* Mini result preview */}
                <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
                  {/* Score bar */}
                  <div className="flex items-center justify-between border-b border-border bg-surface-1 px-3 py-2">
                    <span className="text-[10px] font-semibold text-ink-subdued uppercase tracking-wider">
                      Trust Score
                    </span>
                    <span className="text-sm font-bold text-severity-critical">
                      42
                    </span>
                  </div>
                  {/* Findings */}
                  <div className="divide-y divide-border">
                    {[
                      {
                        label: "Disabled Assertion",
                        severity: "HIGH",
                        color: "severity-critical",
                      },
                      {
                        label: "Assertion Tampering",
                        severity: "HIGH",
                        color: "severity-critical",
                      },
                    ].map((f) => (
                      <div
                        key={f.label}
                        className="flex items-center justify-between px-3 py-1.5"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] text-ink">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: `var(--${f.color})` }}
                          />
                          {f.label}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{
                            backgroundColor: `var(--${f.color})20`,
                            color: `var(--${f.color})`,
                          }}
                        >
                          {f.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.7 }}
            className="mt-12 text-center"
          >
            <Link to="/scan">
              <ShimmerButton
                shimmerColor="rgba(88,166,255,0.4)"
                background="rgba(88,166,255,0.12)"
                className="text-white"
                as="span"
              >
                <BugPlay className="h-4 w-4" />
                Try It Now — No Signup
              </ShimmerButton>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* =============================================
          5. DETECTION PATTERNS — Bento Grid + Filter + Code Preview
           ============================================= */}
      <section className="page-wrap px-4 py-20">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-10 text-center"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-severity-critical/20 bg-severity-critical/8 px-4 py-1.5 text-xs font-semibold text-severity-critical">
              <Swords className="h-3.5 w-3.5" />
              11 Detection Engines
            </div>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              What <AnimatedGradientText>Mantiz Detects</AnimatedGradientText>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-ink-muted">
              Every pattern is backed by AST-level analysis. No regex tricks. No
              guesswork.
            </p>
          </motion.div>

          {/* Filter Tabs */}
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {severityFilters.map((filter) => {
              const isActive = activeFilter === filter;
              const filterColor =
                filter === "Critical"
                  ? "severity-critical"
                  : filter === "High"
                    ? "severity-high"
                    : filter === "Medium"
                      ? "severity-medium"
                      : filter === "Info"
                        ? "severity-info"
                        : "interactive";
              return (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                    isActive
                      ? "text-white shadow-[0_0_12px_rgba(88,166,255,0.2)]"
                      : "text-ink-muted hover:text-ink"
                  }`}
                  style={{
                    backgroundColor: isActive
                      ? `var(--${filterColor})`
                      : "var(--surface-2)",
                    border: `1px solid ${isActive ? "transparent" : "var(--border)"}`,
                  }}
                >
                  {filter}
                  {filter !== "All" && (
                    <span className="opacity-70">
                      (
                      {
                        detectionPatterns.filter((p) => p.severity === filter)
                          .length
                      }
                      )
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pattern Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredPatterns.map((pattern, i) => {
              const Icon = pattern.icon;
              return (
                <motion.div
                  key={pattern.name}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="group relative overflow-hidden rounded-xl border border-border bg-surface-1 transition-all duration-300 hover:border-interactive/30 hover:shadow-[0_0_20px_rgba(88,166,255,0.06)]"
                >
                  {/* Hover glow */}
                  <div
                    className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(88,166,255,0.06), transparent 40%)`,
                    }}
                  />

                  <div className="relative z-10 p-5">
                    {/* Top row: Icon + Severity */}
                    <div className="mb-3 flex items-start justify-between">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: `var(--${pattern.color})15`,
                          color: `var(--${pattern.color})`,
                        }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          backgroundColor: `var(--${pattern.color})18`,
                          color: `var(--${pattern.color})`,
                          border: `1px solid var(--${pattern.color})25`,
                        }}
                      >
                        {pattern.severity}
                      </span>
                    </div>

                    {/* Pattern name */}
                    <h3 className="mb-1.5 text-base font-bold text-ink">
                      {pattern.name}
                    </h3>

                    {/* Description */}
                    <p className="mb-4 text-sm leading-relaxed text-ink-muted">
                      {pattern.longDesc}
                    </p>

                    {/* Code Sample */}
                    <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
                      <div className="flex items-center gap-1.5 border-b border-border bg-surface-1 px-3 py-1.5">
                        <FileCode className="h-3 w-3 text-ink-subdued" />
                        <span className="text-[10px] font-medium text-ink-subdued">
                          diff preview
                        </span>
                      </div>
                      <div className="px-3 py-2 font-mono text-[11px] leading-5">
                        {pattern.codeSample.split("\n").map((line, li) => {
                          const isAdd = line.startsWith("+ ");
                          const isRemove = line.startsWith("- ");
                          const isMeta = line.startsWith("> ");
                          return (
                            <div
                              key={li}
                              className={`${
                                isAdd
                                  ? "text-success bg-success/5"
                                  : isRemove
                                    ? "text-severity-critical bg-severity-critical/5"
                                    : isMeta
                                      ? "text-interactive"
                                      : "text-ink-subdued"
                              } ${isAdd || isRemove ? "-mx-3 px-3" : ""}`}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Bottom accent bar */}
                  <div
                    className="h-0.5 w-full"
                    style={{ backgroundColor: `var(--${pattern.color})` }}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Empty state */}
          {filteredPatterns.length === 0 && (
            <div className="py-16 text-center text-ink-muted">
              No patterns match this filter.
            </div>
          )}
        </div>
      </section>

      {/* =============================================
          6. HOW IT WORKS — Detection Pipeline
           ============================================= */}
      <section className="page-wrap px-4 py-20">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/8 px-4 py-1.5 text-xs font-semibold text-success">
              <Zap className="h-3.5 w-3.5" />
              Pipeline
            </div>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              How <AnimatedGradientText>Detection</AnimatedGradientText> Works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-ink-muted">
              Mantiz analyzes diffs through a multi-stage pipeline: static
              pattern matching, AST parsing, behavioral analysis, and optional
              AI-powered detection.
            </p>
          </motion.div>

          {/* Pipeline Flow Diagram */}
          <div className="relative flex flex-col items-center gap-8 md:flex-row md:items-start md:gap-0">
            <div className="absolute left-4.5 top-0 h-full w-px bg-linear-to-b from-severity-critical/30 via-interactive/40 to-success/50 md:left-0 md:top-15 md:h-px md:w-full md:bg-linear-to-r" />

            {/* Step 1: Diff Input */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/4 md:flex-col md:pl-0 md:text-center"
            >
              <div className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-severity-critical bg-canvas text-sm font-bold text-severity-critical md:static md:mx-auto md:mb-4">
                <GitBranch className="h-4 w-4" />
              </div>
              <div className="flex-1 md:px-3">
                <h3 className="mb-1.5 text-base font-bold text-ink">
                  Diff Input
                </h3>
                <p className="text-sm text-ink-muted">
                  Paste a raw git diff or provide a GitHub PR URL. Mantiz parses
                  every changed file and line.
                </p>
              </div>
            </motion.div>

            <div className="hidden md:flex md:w-8 md:items-center md:justify-center md:pt-12.5">
              <ArrowRight className="h-4 w-4 text-severity-critical/50" />
            </div>

            {/* Step 2: Static Analysis */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/4 md:flex-col md:pl-0 md:text-center"
            >
              <div className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-interactive bg-canvas text-sm font-bold text-interactive md:static md:mx-auto md:mb-4">
                <Shield className="h-4 w-4" />
              </div>
              <div className="flex-1 md:px-3">
                <h3 className="mb-1.5 text-base font-bold text-ink">
                  Static Analysis
                </h3>
                <p className="text-sm text-ink-muted">
                  11 detection engines scan every line. Findings ranked by
                  severity and confidence with per-detector calibrated weights.
                </p>
              </div>
            </motion.div>

            <div className="hidden md:flex md:w-8 md:items-center md:justify-center md:pt-12.5">
              <ArrowRight className="h-4 w-4 text-interactive/50" />
            </div>

            {/* Step 3: AI + Behavioral */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/4 md:flex-col md:pl-0 md:text-center"
            >
              <div className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-severity-medium bg-canvas text-sm font-bold text-severity-medium md:static md:mx-auto md:mb-4">
                <Terminal className="h-4 w-4" />
              </div>
              <div className="flex-1 md:px-3">
                <h3 className="mb-1.5 text-base font-bold text-ink">
                  AI + Behavioral
                </h3>
                <p className="text-sm text-ink-muted">
                  Optional LLM-powered analysis detects semantic bypass and
                  coverage reduction. Historical tracking catches author pattern
                  anomalies.
                </p>
              </div>
            </motion.div>

            <div className="hidden md:flex md:w-8 md:items-center md:justify-center md:pt-12.5">
              <ArrowRight className="h-4 w-4 text-severity-medium/50" />
            </div>

            {/* Step 4: Trust Score */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: 0.7 }}
              className="relative z-10 flex w-full flex-row gap-4 pl-10 md:w-1/4 md:flex-col md:pl-0 md:text-center"
            >
              <div className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-success bg-canvas text-sm font-bold text-success md:static md:mx-auto md:mb-4">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="flex-1 md:px-3">
                <h3 className="mb-1.5 text-base font-bold text-ink">
                  Trust Score
                </h3>
                <p className="text-sm text-ink-muted">
                  Weighted scoring: findings deduct points based on confidence
                  level. Score ≥ 80 means the code passes the honesty check.
                </p>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="mx-auto mt-12 max-w-2xl rounded-xl border border-success/20 bg-success/5 p-5 text-center"
          >
            <p className="text-sm text-ink-muted">
              <strong className="text-success">Why this matters:</strong> A loop
              without a real checker doesn't fail loudly — it hallucinates
              progress. Mantiz is the{" "}
              <strong className="text-ink">honesty detector</strong> for the
              entire pipeline.
            </p>
          </motion.div>
        </div>
      </section>

      {/* =============================================
          7. FINAL CTA SECTION
           ============================================= */}
      <section className="relative overflow-hidden py-24">
        {/* Background effect */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-150 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full bg-severity-critical/3 blur-[100px]" />
        </div>

        <div className="page-wrap px-4 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-2xl"
          >
            <AnimatedGradientText className="text-3xl font-bold sm:text-4xl">
              Don't Trust Your Agent
            </AnimatedGradientText>
            <p className="mt-4 mb-8 text-ink-muted">
              A loop without a real checker doesn't fail loudly. It hallucinates
              progress.{" "}
              <strong className="text-ink">
                Mantiz is the checker for the checker.
              </strong>
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/scan">
                <ShimmerButton
                  shimmerColor="rgba(88,166,255,0.5)"
                  background="rgba(88,166,255,0.15)"
                  className="text-white"
                  as="span"
                >
                  <BugPlay className="h-4 w-4" />
                  Scan Your First Diff
                </ShimmerButton>
              </Link>
              <Link to="/benchmark">
                <ShimmerButton
                  shimmerColor="rgba(255,255,255,0.1)"
                  background="rgba(33,38,45,0.9)"
                  as="span"
                >
                  <Zap className="h-4 w-4" />
                  View Benchmark
                </ShimmerButton>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
