import type {
  Finding,
  ParsedDiff,
  Confidence,
  ScoringBreakdown,
  Verdict,
  VerdictResult,
  BehavioralFlag,
} from "./types";
import { parseRawDiff } from "./diff-parser";
import { detectDisabledAssertions } from "./disabled-assertion";
import { detectAssertionTampering } from "./assertion-tampering";
import { detectMockToAvoid } from "./mock-to-avoid";
import {
  detectClaimDiffMismatch,
  isNonFunctional,
  classifyImportance,
} from "./claim-mismatch";
import { detectSilentCatch } from "./silent-catch";
import { detectHallucinatedAssertions } from "./hallucination";
import { detectWithAI } from "./ai-assisted";
import { evaluateFindings, isAIJudgeEnabled } from "./ai-judge";
import {
  registerCustomMatchersFromDiff,
  resetCustomMatchers,
  scanInstalledMatcherPackages,
  initJestDomMatchers,
} from "./custom-matchers";
import { detectMutationSusceptibility } from "./mutation-susceptibility";
import { detectAgentInstructions } from "./agent-instruction";
import { ensureCredits, deductCredits, CREDIT_COSTS } from "../server/credits";
import { createIsomorphicFn } from "@tanstack/react-start";

// Lazy imports for browser-safe detection
// ast-analyzer and tree-sitter-analyzer may use Node-only dependencies (@swc/core)
let _detectWithAST: typeof import("./ast-analyzer").detectWithAST | null = null;
let _detectWithTreeSitter:
  typeof import("./tree-sitter-analyzer").detectWithTreeSitter | null = null;
function getASTDetectors() {
  if (!_detectWithAST) {
    try {
      const astMod = require("./ast-analyzer");
      _detectWithAST = astMod.detectWithAST;
      const tsMod = require("./tree-sitter-analyzer");
      _detectWithTreeSitter = tsMod.detectWithTreeSitter;
    } catch {
      /* not available in browser */
    }
  }
  return {
    detectWithAST: _detectWithAST,
    detectWithTreeSitter: _detectWithTreeSitter,
  };
}

// ─── Debug Logging ───────────────────────────────────────────────

const DEBUG =
  typeof process !== "undefined" && process.env.MANTIZ_DEBUG === "true";

function debug(...args: unknown[]) {
  if (DEBUG) console.log("[Mantiz]", ...args);
}

// ─── Types ───────────────────────────────────────────────────────

export interface FixInstruction {
  patternType: string;
  instruction: string;
}

export interface ScanResult {
  files: ParsedDiff[];
  findings: Finding[];
  trustScore: number;
  summary: {
    totalFindings: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    filesScanned: number;
  };
  fixInstructions: FixInstruction[];
  scoringBreakdown?: ScoringBreakdown;
  /** Categorical verdict — derived from evidenceScore, more honest than raw number */
  verdict?: VerdictResult;
}

// ─── File Importance Multiplier ───────────────────────────────
// Findings in config/docs/artifact files contribute less penalty
const IMPORTANCE_MULTIPLIER: Record<string, number> = {
  core: 1,
  test: 1,
  source: 1,
  config: 0.5,
  docs: 0.3,
  artifact: 0.05,
};

// ─── Per-Detector Penalty Calibration (v4 — 354 overlap, 18 DECEPTIVE) ─
// Calibrated by calibrate-standalone.ts against 374 raw candidates
// with 354 ground-truth-labeled overlaps (18 DECEPTIVE, 336 LEGIT).
// Weight formula: round(F1 * 20), distributed by current ratio, capped at 15.
//
// D4 disabled (0% precision). D8 reverted to data-collection only (0 TP, 2 FP). D11 0 TP.
// D9 disabled (0 TP — no historical data to calibrate against).
//
// Key changes from v3 (346 overlap):
//   D5: FP 31→21 — \b word boundary fix + Rust .unwrap/.expect removal
//   D6: F1 45→25 — FP 30→3 from NON_ASSERTION_METHODS filter (but recall dropped)
//   D8: 0→{1,1,0} — first activation after prompt tuning (1 TP, 0 FP in calibration)
const DETECTOR_PENALTIES: Record<
  string,
  { high: number; medium: number; low: number }
> = {
  disabled_assertion: { high: 3, medium: 2, low: 0 }, // F1=23  — TP=3, FP=5, FN=15
  assertion_tampering: { high: 2, medium: 1, low: 0 }, // F1=22  — TP=3, FP=6, FN=15 — LOW=0: assertion change alone = no penalty
  mock_to_avoid_failure: { high: 5, medium: 2, low: 1 }, // F1=39  — TP=7, FP=11, FN=11
  claim_diff_mismatch: { high: 0, medium: 0, low: 0 }, // F1=0   — Precision 0%, data collection only
  silent_catch_and_pass: { high: 1, medium: 1, low: 0 }, // F1=10  — TP=2, FP=21, FN=16
  hallucinated_assertion: { high: 3, medium: 2, low: 0 }, // F1=25  — TP=3, FP=3, FN=15 (suggested)
  ai_assisted_detection: { high: 8, medium: 4, low: 1 }, // F1=0   — 0 TP, 2 FP in calibration, but findings must affect score
  historical_behavioral: { high: 0, medium: 0, low: 0 }, // Disabled — 0 TP in calibration
  mutation_susceptibility: { high: 8, medium: 3, low: 0 }, // F1=55  — TP=13, FP=16, FN=5
  agent_instruction_scan: { high: 0, medium: 0, low: 0 }, // 0 TP — needs labeled data
};

/**
 * Deduplicate findings: same file + same line = keep highest confidence.
 * Prevents double-counting from multiple detectors flagging the same line.
 */
function dedupFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.filePath}:${f.lineStart}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, f);
    } else {
      const weight = (c: Confidence) =>
        c === "high" ? 3 : c === "medium" ? 2 : 1;
      if (weight(f.confidence) > weight(existing.confidence)) {
        seen.set(key, f);
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Calculate penalty with Weak Signal Fusion.
 * Uses per-detector penalty (from calibration) × file importance multiplier.
 *
 * Weak Signal Fusion: multiple LOW/MEDIUM findings in the SAME file
 * should NOT stack linearly. Instead:
 *   - 1st finding: full penalty
 *   - 2nd-5th finding: 50% penalty
 *   - 6th+: 25% penalty
 * This prevents "28 findings from 1 file = 28× penalty" false positives.
 *
 * Same diff always gets same score (critical for "lie detector").
 */
function calculatePenalty(findings: Finding[]): number {
  let total = 0;

  // Group findings by (file, patternType) for cluster-aware discounting
  const clusters = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.filePath}::${f.patternType}`;
    const group = clusters.get(key) || [];
    group.push(f);
    clusters.set(key, group);
  }

  for (const group of clusters.values()) {
    for (let i = 0; i < group.length; i++) {
      const f = group[i];
      const detectorPenalty = DETECTOR_PENALTIES[f.patternType];
      let base = detectorPenalty
        ? f.confidence === "high"
          ? detectorPenalty.high
          : f.confidence === "medium"
            ? detectorPenalty.medium
            : detectorPenalty.low
        : f.confidence === "high"
          ? 10
          : f.confidence === "medium"
            ? 5
            : 2;

      // Weak Signal Fusion: discount subsequent findings in same file+detector
      if (i >= 1 && f.confidence !== "high") {
        if (i < 5) {
          base = Math.round(base * 0.5); // 2nd-5th: 50%
        } else {
          base = Math.round(base * 0.25); // 6th+: 25%
        }
      }

      const mult = IMPORTANCE_MULTIPLIER[f.fileImportance ?? "source"] ?? 1;
      total += base * mult;
    }
  }

  return Math.max(0, Math.round(total));
}

export function scanDiff(
  rawDiff: string,
  prContext?: { title?: string; author?: string },
  options?: { minScore?: number },
): ScanResult {
  const files = parseRawDiff(rawDiff);

  if (files.length === 0) {
    return {
      files: [],
      findings: [],
      trustScore: 100,
      summary: {
        totalFindings: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        filesScanned: 0,
      },
      fixInstructions: [],
    };
  }

  const functionalFiles = files.filter(
    (f) => !isNonFunctional(f.newFile || f.oldFile || ""),
  );

  // Register custom matchers from:
  // 1. Reset per-scan to prevent context leaking
  // 2. Re-scan node_modules packages (jest-dom, jest-extended, etc.)
  // 3. Re-init static jest-dom fallback
  // 4. Extract from expect.extend() calls in the diff
  resetCustomMatchers();
  scanInstalledMatcherPackages();
  initJestDomMatchers();
  registerCustomMatchersFromDiff(files);

  debug(
    `🔍 Parsing ${files.length} files (${functionalFiles.length} functional) from diff`,
  );

  const startTime = Date.now();

  const d1 = detectDisabledAssertions(functionalFiles);
  debug(
    `  Detector 1 [Disabled Assertion]: ${d1.length} finding${d1.length !== 1 ? "s" : ""}`,
  );

  const d2 = detectAssertionTampering(functionalFiles);
  debug(
    `  Detector 2 [Assertion Tampering]: ${d2.length} finding${d2.length !== 1 ? "s" : ""}`,
  );

  const d3 = detectMockToAvoid(functionalFiles);
  debug(
    `  Detector 3 [Mock-to-Avoid]: ${d3.length} finding${d3.length !== 1 ? "s" : ""}`,
  );

  const d4 = detectClaimDiffMismatch(files, prContext);
  debug(
    `  Detector 4 [Claim-Diff Mismatch]: ${d4.length} finding${d4.length !== 1 ? "s" : ""}`,
  );

  const d5 = detectSilentCatch(functionalFiles);
  debug(
    `  Detector 5 [Silent Catch]: ${d5.length} finding${d5.length !== 1 ? "s" : ""}`,
  );

  const d6 = detectHallucinatedAssertions(functionalFiles);
  debug(
    `  Detector 6 [Hallucinated Assertion]: ${d6.length} finding${d6.length !== 1 ? "s" : ""}`,
  );

  // ─── Layer 7a: AST Analysis (Babel for JS/TS) ────────────────────
  // PERFORMANCE: @babel/parser is SLOW (~10-50ms per call). For large diffs (6000+ lines),
  // this can take MINUTES. Auto-skip if >5 files (MANTIZ_SKIP_AST env to override).
  // D1/D2/D5 regex already catch most patterns D7a/D7b look for.
  const _skipAstEnv =
    typeof process !== "undefined" && process.env.MANTIZ_SKIP_AST;
  const SKIP_AST =
    _skipAstEnv === "true" ||
    (_skipAstEnv !== "false" && functionalFiles.length > 5);
  let d7a: Finding[] = [];
  let d7b: Finding[] = [];
  if (!SKIP_AST) {
    const { detectWithAST: dAST, detectWithTreeSitter: dTS } =
      getASTDetectors();
    if (dAST) d7a = dAST(functionalFiles);
    if (dTS) d7b = dTS(functionalFiles);
  }
  debug(
    `  Detector 7a [AST Analysis - JS/TS]: ${d7a.length} finding${d7a.length !== 1 ? "s" : ""}${SKIP_AST ? " (SKIPPED)" : ""}`,
  );
  debug(
    `  Detector 7b [Tree-sitter ML]: ${d7b.length} finding${d7b.length !== 1 ? "s" : ""}${SKIP_AST ? " (SKIPPED)" : ""}`,
  );

  // ─── Layer 10: Mutation Susceptibility ───────────────────────────
  const d10 = detectMutationSusceptibility(functionalFiles);
  debug(
    `  Detector 10 [Mutation Susceptibility]: ${d10.length} finding${d10.length !== 1 ? "s" : ""}`,
  );

  // ─── Layer 11: Agent Instruction Scanner ─────────────────────────
  const d11 = detectAgentInstructions(files);
  debug(
    `  Detector 11 [Agent Instruction Scan]: ${d11.length} finding${d11.length !== 1 ? "s" : ""}`,
  );

  const findings: Finding[] = [
    ...d1,
    ...d2,
    ...d3,
    ...d4,
    ...d5,
    ...d6,
    ...d7a,
    ...d7b,
    ...d10,
    ...d11,
  ];

  // ─── Enrich with file importance for weighted scoring ────────
  for (const finding of findings) {
    if (!finding.fileImportance) {
      finding.fileImportance = classifyImportance(finding.filePath);
    }
  }

  // ─── Dedup: same file + same line = 1 finding (highest confidence) ─
  const dedupedFindings = dedupFindings(findings);

  // ─── Deterministic Scoring ─────────────────────────────────
  const penalty = calculatePenalty(dedupedFindings);
  const engineFloor = dedupedFindings.length > 0 ? 30 : 0;
  const customFloor = options?.minScore ?? 0;
  const minScore = Math.max(engineFloor, customFloor);
  let trustScore = Math.max(minScore, 100 - Math.min(penalty, 85)); // cap at 85 so score >= 15

  // ─── Ceiling Rule ──────────────────────────────────────────
  // High-severity findings cap the maximum possible score.
  // This prevents "2 High findings but Clean 97" paradox.
  const highCount = dedupedFindings.filter(
    (f) => f.confidence === "high",
  ).length;
  const mediumCount = dedupedFindings.filter(
    (f) => f.confidence === "medium",
  ).length;
  if (highCount >= 2) {
    trustScore = Math.min(trustScore, 40);
  } else if (highCount >= 1) {
    trustScore = Math.min(trustScore, 60);
  } else if (mediumCount >= 3) {
    trustScore = Math.min(trustScore, 70);
  }

  const elapsed = Date.now() - startTime;
  debug(
    `✓ Scan complete in ${elapsed}ms — Score: ${trustScore}/100, ${dedupedFindings.length} total findings (${findings.length} raw)`,
  );

  const summary = {
    totalFindings: dedupedFindings.length,
    highCount: dedupedFindings.filter((f) => f.confidence === "high").length,
    mediumCount: dedupedFindings.filter((f) => f.confidence === "medium")
      .length,
    lowCount: dedupedFindings.filter((f) => f.confidence === "low").length,
    filesScanned: files.length,
  };

  const fixInstructions =
    trustScore < 80 ? generateFixInstructions(dedupedFindings) : [];

  return {
    files,
    findings: dedupedFindings,
    trustScore,
    summary,
    fixInstructions,
    scoringBreakdown: {
      staticScore: trustScore,
      rawFindings: findings.length,
      dedupedFindings: dedupedFindings.length,
      aiJudgeFiltered: 0,
      aiAssistedFindings: 0,
    },
    verdict: deriveVerdict(
      trustScore,
      dedupedFindings.filter((f) => f.confidence === "high").length,
    ),
  };
}

/**
 * Scan a diff with AI-assisted detection.
 * Runs static detectors first (sync), then fires AI detection.
 * Falls back gracefully if AI fails or times out.
 * prContext is passed to claim-diff mismatch detector for bot/honest-title awareness.
 * ragContext contains retrieved code definitions (from Qdrant) — injected into AI prompt
 * to reduce false positives on custom matchers/functions that exist in the repo.
 */
export async function scanDiffAsync(
  rawDiff: string,
  prContext?: { title?: string; author?: string },
  ragContext?: string,
  options?: { minScore?: number },
): Promise<ScanResult> {
  // Allow ragContext to flow through to AI detectors via prContext
  // (extends prContext with ragContext for the detectWithAI call)
  const extendedContext = ragContext ? { ...prContext, ragContext } : prContext;
  const baseResult = scanDiff(rawDiff, prContext, options);

  console.log(
    "[Mantiz] AI_DETECTION_ENABLED:",
    typeof process !== "undefined" ? process.env.AI_DETECTION_ENABLED : "N/A",
    "| AI_JUDGE_ENABLED:",
    typeof process !== "undefined" ? process.env.AI_JUDGE_ENABLED : "N/A",
    "| GROQ:",
    typeof process !== "undefined" && process.env.GROQ_API_KEY
      ? "SET"
      : "NOT SET",
  );

  const aiEnabled =
    typeof process !== "undefined" &&
    process.env.AI_DETECTION_ENABLED === "true";

  let allFindings = [...baseResult.findings];
  let currentScore = baseResult.trustScore;
  let currentSummary = {
    ...baseResult.summary,
    totalFindings: allFindings.length,
  };

  // Auth for credit checks (optional — null if not logged in)
  const getAuth = createIsomorphicFn()
    .server(async () => {
      const { tryAuth } = await import("../server/auth-utils.server");
      return tryAuth();
    })
    .client(() => null);
  const auth = await getAuth();

  // ─── AI Judge: Review Static Findings ────────────────────────────
  // Runs AFTER static detectors but BEFORE AI-assisted discovery.
  // Filters false positives and downgrades contextual findings.
  // Requires credits (cost: 2) — static-only users skip this.
  if (isAIJudgeEnabled() && baseResult.findings.length > 0) {
    let canAfford = true;
    if (auth) {
      try {
        await ensureCredits(auth.userId, CREDIT_COSTS.ai_judge);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Insufficient credits";
        debug(`  AI Judge: skipped — ${msg}`);
        canAfford = false;
      }
    }

    if (canAfford) {
      debug("  AI Judge: reviewing static findings...");
      try {
        const aiContext = prContext
          ? {
              title: prContext.title,
              description: prContext.author
                ? `Author: ${prContext.author}`
                : undefined,
            }
          : undefined;
        const judgeFindings = await evaluateFindings(
          allFindings,
          baseResult.files,
          aiContext,
        );

        if (auth) {
          await deductCredits(auth.userId, "ai_judge", {
            findingCount: judgeFindings.length,
          }).catch(() => {});
        }

        if (judgeFindings.length < allFindings.length) {
          debug(
            `  AI Judge: filtered ${allFindings.length - judgeFindings.length} false positives`,
          );
        }

        const changed =
          judgeFindings.length !== allFindings.length ||
          judgeFindings.some(
            (f, i) =>
              f.confidence !== allFindings[i]?.confidence ||
              f.aiVerdict !== allFindings[i]?.aiVerdict,
          );

        if (changed) {
          const penalty = calculatePenalty(judgeFindings);
          const judgeFloor = judgeFindings.length > 0 ? 30 : 0;
          const customFloor = options?.minScore ?? 0;
          const minScore = Math.max(judgeFloor, customFloor);
          currentScore = Math.max(minScore, 100 - Math.min(penalty, 85));

          // Apply ceiling rule for recalculated score
          const jHighCount = judgeFindings.filter(
            (f) => f.confidence === "high",
          ).length;
          const jMediumCount = judgeFindings.filter(
            (f) => f.confidence === "medium",
          ).length;
          if (jHighCount >= 2) {
            currentScore = Math.min(currentScore, 40);
          } else if (jHighCount >= 1) {
            currentScore = Math.min(currentScore, 60);
          } else if (jMediumCount >= 3) {
            currentScore = Math.min(currentScore, 70);
          }
          currentSummary = {
            totalFindings: judgeFindings.length,
            highCount: judgeFindings.filter((f) => f.confidence === "high")
              .length,
            mediumCount: judgeFindings.filter((f) => f.confidence === "medium")
              .length,
            lowCount: judgeFindings.filter((f) => f.confidence === "low")
              .length,
            filesScanned: baseResult.summary.filesScanned,
          };
          allFindings = judgeFindings;
          debug(
            `  AI Judge: adjusted — ${judgeFindings.filter((f) => f.aiVerdict === "VALID").length} valid, ${judgeFindings.filter((f) => f.aiVerdict === "CONTEXTUAL").length} contextual`,
          );
        } else {
          debug("  AI Judge: all findings confirmed as valid");
        }
      } catch (err) {
        debug("  AI Judge: failed —", err);
      }
    }
  }

  // ─── Layer 8: AI-Assisted Detection ───────────────────────────────
  // Requires credits (cost: 2) — static-only users skip this.
  if (aiEnabled) {
    let canAfford = true;
    if (auth) {
      try {
        await ensureCredits(auth.userId, CREDIT_COSTS.ai_assisted);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Insufficient credits";
        debug(`  Detector 8 [AI-Assisted Detection]: skipped — ${msg}`);
        canAfford = false;
      }
    }

    if (canAfford) {
      debug("  Detector 8 [AI-Assisted Detection]: analyzing via AI...");
      try {
        // Build AI context with PR info + RAG context (if available)
        const aiContext: {
          title?: string;
          description?: string;
          ragContext?: string;
        } = {};
        if (extendedContext?.title) aiContext.title = extendedContext.title;
        if (extendedContext?.author)
          aiContext.description = `Author: ${extendedContext.author}`;
        if (extendedContext && "ragContext" in extendedContext) {
          const rc = (extendedContext as any).ragContext as string | undefined;
          if (rc) aiContext.ragContext = rc;
        }
        const aiFindings = await detectWithAI(
          baseResult.files,
          Object.keys(aiContext).length > 0 ? aiContext : undefined,
        );

        if (auth) {
          await deductCredits(auth.userId, "ai_assisted", {
            findingCount: aiFindings.length,
          }).catch(() => {});
        }

        if (aiFindings.length > 0) {
          debug(
            `  Detector 8 [AI-Assisted Detection]: ${aiFindings.length} finding${aiFindings.length !== 1 ? "s" : ""}`,
          );
          allFindings = [...allFindings, ...aiFindings];

          const penalty = calculatePenalty(allFindings);
          const aiFloor = allFindings.length > 0 ? 30 : 0;
          const customFloor = options?.minScore ?? 0;
          const minScore = Math.max(aiFloor, customFloor);
          currentScore = Math.max(minScore, 100 - Math.min(penalty, 85));

          // Apply ceiling rule for recalculated score
          const aiHighCount = allFindings.filter(
            (f) => f.confidence === "high",
          ).length;
          const aiMediumCount = allFindings.filter(
            (f) => f.confidence === "medium",
          ).length;
          if (aiHighCount >= 2) {
            currentScore = Math.min(currentScore, 40);
          } else if (aiHighCount >= 1) {
            currentScore = Math.min(currentScore, 60);
          } else if (aiMediumCount >= 3) {
            currentScore = Math.min(currentScore, 70);
          }
          currentSummary = {
            totalFindings: allFindings.length,
            highCount: allFindings.filter((f) => f.confidence === "high")
              .length,
            mediumCount: allFindings.filter((f) => f.confidence === "medium")
              .length,
            lowCount: allFindings.filter((f) => f.confidence === "low").length,
            filesScanned: baseResult.summary.filesScanned,
          };
        } else {
          debug(
            "  Detector 8 [AI-Assisted Detection]: 0 findings (clean AI verdict)",
          );
        }
      } catch (err) {
        debug("  Detector 8 [AI-Assisted Detection]: failed —", err);
      }
    }
  }

  // ─── Layer 7b: Multi-Language AST (Tree-sitter async) ─────────────
  // Only runs in async mode — Tree-sitter WASM needs async loading.
  // Falls back to heuristic if WASM is unavailable.
  if (baseResult.files.length > 0) {
    try {
      const { detectWithTreeSitterAsync } =
        await import("./tree-sitter-analyzer");
      const d7bAsync = await detectWithTreeSitterAsync(baseResult.files);
      if (d7bAsync.length > 0) {
        debug(
          `  Detector 7b [Tree-sitter ASYNC]: ${d7bAsync.length} finding${d7bAsync.length !== 1 ? "s" : ""}`,
        );
        allFindings = [...allFindings, ...d7bAsync];
      } else {
        debug(
          "  Detector 7b [Tree-sitter ASYNC]: 0 findings (heuristic or clean)",
        );
      }
    } catch (err) {
      debug("  Detector 7b [Tree-sitter ASYNC]: failed —", err);
    }
  }

  // ─── Layer 9: Historical Behavioral Analysis ─────────────────────
  let behavioralFlags: BehavioralFlag[] = [];

  if (prContext?.author) {
    debug(
      `  Detector 9 [Historical Behavioral]: analyzing ${prContext.author}...`,
    );

    try {
      const { analyzeHistoricalBehavior } =
        await import("./historical-scoring");
      const historical = await analyzeHistoricalBehavior({
        author: prContext.author,
        title: prContext.title,
        trustScore: currentScore,
        totalFindings: allFindings.length,
        filesChanged: baseResult.files.length,
        files: baseResult.files,
      });

      if (historical.findings.length > 0) {
        debug(
          `  Detector 9 [Historical Behavioral]: ${historical.findings.length} finding${historical.findings.length !== 1 ? "s" : ""} (modifier: ${historical.modifier})`,
        );

        // Build behavioral flags from historical findings directly.
        // NOT added to allFindings — flags do NOT affect evidence score.
        // This prevents confusion: "5 findings but Score 100" is now impossible.
        behavioralFlags = historical.findings.map((f) => ({
          type:
            f.explanation.replace("📊 [Historical] ", "").split(". ")[0] ||
            f.explanation,
          confidence: f.confidence,
          note: f.evidenceExcerpt.substring(0, 150),
        }));
      } else {
        debug(
          `  Detector 9 [Historical Behavioral]: 0 findings (no behavioral anomalies)`,
        );
      }
    } catch (err) {
      debug("  Detector 9 [Historical Behavioral]: failed —", err);
    }
  }

  const fixInstructions =
    currentScore < 80 ? generateFixInstructions(allFindings) : [];

  debug(
    `✓ Full scan complete — Score: ${currentScore}/100, ${allFindings.length} total findings`,
  );

  return {
    ...baseResult,
    findings: allFindings,
    trustScore: currentScore,
    summary: currentSummary,
    fixInstructions,
    scoringBreakdown: {
      staticScore: baseResult.scoringBreakdown?.staticScore ?? currentScore,
      rawFindings: baseResult.scoringBreakdown?.rawFindings ?? 0,
      dedupedFindings:
        baseResult.scoringBreakdown?.dedupedFindings ?? allFindings.length,
      aiJudgeFiltered: Math.max(
        0,
        (baseResult.scoringBreakdown?.dedupedFindings ?? 0) -
          allFindings.length,
      ),
      aiAssistedFindings: 0,
      behavioralFlags: behavioralFlags.length > 0 ? behavioralFlags : undefined,
    },
    verdict: deriveVerdict(
      currentScore,
      allFindings.filter((f) => f.confidence === "high").length,
    ),
  };
}

// ─── Verdict Derivation ────────────────────────────────────────────
// Transforms numeric evidenceScore into categorical verdict + confidence band.
// Thresholds:
//   ≥ 80  → CLEAN
//   ≥ 50  → SUSPICIOUS
//   < 50  → LIKELY_DECEPTIVE
// Confidence is derived from distance from threshold boundaries.
function deriveVerdict(score: number, highCount?: number): VerdictResult {
  if (score >= 80 && (!highCount || highCount === 0)) {
    return {
      label: "CLEAN" as Verdict,
      confidence:
        score >= 95
          ? ("high" as const)
          : score >= 88
            ? ("medium" as const)
            : ("low" as const),
      reason: `Evidence score ${score}/100 — no significant cheating patterns detected`,
    };
  }
  // If high findings exist but score is high due to dilution, force SUSPICIOUS
  if (score >= 80 && highCount && highCount > 0) {
    return {
      label: "SUSPICIOUS" as Verdict,
      confidence: "high" as const,
      reason: `Evidence score ${score}/100 but ${highCount} high-severity finding(s) detected — manual review recommended`,
    };
  }
  if (score >= 50) {
    return {
      label: "SUSPICIOUS" as Verdict,
      confidence: score <= 60 ? ("high" as const) : ("medium" as const),
      reason: `Evidence score ${score}/100 — suspicious patterns found, manual review recommended`,
    };
  }
  return {
    label: "LIKELY_DECEPTIVE" as Verdict,
    confidence: score <= 30 ? ("high" as const) : ("medium" as const),
    reason: `Evidence score ${score}/100 — strong indicators of test manipulation detected`,
  };
}

function generateFixInstructions(findings: Finding[]): FixInstruction[] {
  const instructions: FixInstruction[] = [];
  const seen = new Set<string>();

  for (const f of findings) {
    if (seen.has(f.patternType)) continue;
    seen.add(f.patternType);

    switch (f.patternType) {
      case "disabled_assertion":
        instructions.push({
          patternType: "disabled_assertion",
          instruction: `Remove '.skip()', 'if(false)' wrappers, or restore commented-out assertions. If a test fails, fix the source logic instead of disabling the assertion.`,
        });
        break;
      case "assertion_tampering":
        instructions.push({
          patternType: "assertion_tampering",
          instruction: `Restore the original assertion expected value and update the source logic to match. The expected value changed without a corresponding source change.`,
        });
        break;
      case "mock_to_avoid_failure":
        instructions.push({
          patternType: "mock_to_avoid_failure",
          instruction: `Remove unnecessary mock and add real-path test coverage. Mocks should only isolate external dependencies, not bypass internal logic.`,
        });
        break;
      case "claim_diff_mismatch":
        instructions.push({
          patternType: "claim_diff_mismatch",
          instruction: `Update the commit message to accurately describe the changes, or add the expected test/source changes. The current diff doesn't match the claim.`,
        });
        break;
      case "silent_catch_and_pass":
        instructions.push({
          patternType: "silent_catch_and_pass",
          instruction: `Add proper error handling in the catch block. Empty catch blocks silently swallow errors and should include logging, fallback logic, or re-throw with context.`,
        });
        break;
      case "hallucinated_assertion":
        instructions.push({
          patternType: "hallucinated_assertion",
          instruction: `Replace the unknown assertion matcher with a valid Jest/Vitest matcher. Use the whitelist of valid matchers. If this is a custom matcher, ensure it's properly defined with expect.extend().`,
        });
        break;
      case "agent_instruction_scan":
        instructions.push({
          patternType: "agent_instruction_scan",
          instruction: `Remove any instructions that encourage deceptive test practices. Agent configuration files should promote ethical testing, not evasion or concealment. Review the flagged patterns and align with honest testing principles.`,
        });
        break;
      case "mutation_susceptibility":
        instructions.push({
          patternType: "mutation_susceptibility",
          instruction: `Improve test specificity: add more precise assertions, reduce generic matchers, include negative/error test cases, and reduce mock dependency. This increases mutation resistance.`,
        });
        break;
    }
  }

  return instructions;
}
