/**
 * Shared scan utilities for Mantiz evaluation scripts.
 *
 * Extracted from calibrate-standalone.ts and labeling-pipeline.ts
 * to avoid code duplication. Update weights HERE, not in the individual scripts.
 *
 * All functions bypass engine.ts (which imports @tanstack/react-start that breaks CLI).
 */

import { parseRawDiff } from "../../src/detectors/diff-parser";
import { detectDisabledAssertions } from "../../src/detectors/disabled-assertion";
import { detectAssertionTampering } from "../../src/detectors/assertion-tampering";
import { detectMockToAvoid } from "../../src/detectors/mock-to-avoid";
import { detectClaimDiffMismatch, isNonFunctional, classifyImportance } from "../../src/detectors/claim-mismatch";
import { detectSilentCatch } from "../../src/detectors/silent-catch";
import { detectHallucinatedAssertions } from "../../src/detectors/hallucination";
import { detectMutationSusceptibility } from "../../src/detectors/mutation-susceptibility";
import { detectAgentInstructions } from "../../src/detectors/agent-instruction";
import type { Finding, PatternType, ParsedDiff, Confidence } from "../../src/detectors/types";

// ─── Weights (mirrors engine.ts — keep in sync!) ───────────────────

export const DETECTOR_PENALTIES: Record<string, { high: number; medium: number; low: number }> = {
  // Calibration v4 — 354 overlap, 18 DECEPTIVE
  disabled_assertion:      { high: 3,  medium: 2, low: 0 },  // F1=23  — sync engine.ts
  assertion_tampering:     { high: 2,  medium: 1, low: 1 },  // F1=22
  mock_to_avoid_failure:   { high: 5,  medium: 2, low: 1 },  // F1=39
  claim_diff_mismatch:     { high: 0,  medium: 0, low: 0 },  // F1=0
  silent_catch_and_pass:   { high: 1,  medium: 1, low: 0 },  // F1=10
  hallucinated_assertion:  { high: 3,  medium: 2, low: 0 },  // F1=25  — suggested from calibration
  ai_assisted_detection:   { high: 1,  medium: 1, low: 0 },  // F1=10  — 1 TP, activated gradual
  historical_behavioral:   { high: 0,  medium: 0, low: 0 },  // Disabled — 0 TP
  mutation_susceptibility: { high: 8,  medium: 3, low: 0 },  // F1=55
  agent_instruction_scan:  { high: 0,  medium: 0, low: 0 },  // 0 TP
};

export const IMPORTANCE_MULTIPLIER: Record<string, number> = {
  core: 1, test: 1, source: 1, config: 0.5, docs: 0.3, artifact: 0.05,
};

export const ALL_PATTERN_TYPES: PatternType[] = [
  "disabled_assertion",
  "assertion_tampering",
  "mock_to_avoid_failure",
  "claim_diff_mismatch",
  "silent_catch_and_pass",
  "hallucinated_assertion",
  "ai_assisted_detection",
  "historical_behavioral",
  "mutation_susceptibility",
  "agent_instruction_scan",
];

export const DETECTOR_LABELS: Record<string, string> = {
  disabled_assertion: "D1_DisabledAssertion",
  assertion_tampering: "D2_AssertionTampering",
  mock_to_avoid_failure: "D3_MockToAvoid",
  claim_diff_mismatch: "D4_ClaimDiffMismatch",
  silent_catch_and_pass: "D5_SilentCatch",
  hallucinated_assertion: "D6_HallucinatedAssertion",
  ai_assisted_detection: "D8_AIAssisted",
  historical_behavioral: "D9_Historical",
  mutation_susceptibility: "D10_MutationSusceptibility",
  agent_instruction_scan: "D11_AgentInstruction",
};

// ─── Scan ───────────────────────────────────────────────────────────

export function standaloneScan(rawDiff: string, prTitle?: string): {
  files: ParsedDiff[];
  findings: Finding[];
  trustScore: number;
} {
  const files = parseRawDiff(rawDiff);
  if (files.length === 0) return { files, findings: [], trustScore: 100 };

  const functionalFiles = files.filter(f => !isNonFunctional(f.newFile || f.oldFile || ""));

  const d1 = detectDisabledAssertions(functionalFiles);
  const d2 = detectAssertionTampering(functionalFiles);
  const d3 = detectMockToAvoid(functionalFiles);
  const d4 = detectClaimDiffMismatch(files, { title: prTitle });
  const d5 = detectSilentCatch(functionalFiles);
  const d6 = detectHallucinatedAssertions(functionalFiles);
  const d10 = detectMutationSusceptibility(functionalFiles);
  const d11 = detectAgentInstructions(files);

  let findings: Finding[] = [...d1, ...d2, ...d3, ...d4, ...d5, ...d6, ...d10, ...d11];

  for (const f of findings) {
    if (!f.fileImportance) f.fileImportance = classifyImportance(f.filePath);
  }

  findings = dedup(findings);

  const penalty = calcPenalty(findings);
  const minScore = findings.length > 0 ? 30 : 0;
  const trustScore = Math.max(minScore, 100 - Math.min(penalty, 85));

  return { files, findings, trustScore };
}

/**
 * Async version that also runs D8 (AI-assisted detection).
 * D8 is slow (~3s/call) so only runs when AI_DETECTION_ENABLED=true.
 */
export async function standaloneScanAsync(rawDiff: string, prTitle?: string): Promise<{
  files: ParsedDiff[];
  findings: Finding[];
  trustScore: number;
}> {
  const base = standaloneScan(rawDiff, prTitle);
  if (base.files.length === 0) return base;

  // Only run D8 if AI detection is enabled
  const aiEnabled = typeof process !== "undefined" && process.env.AI_DETECTION_ENABLED === "true";
  if (!aiEnabled) return base;

  try {
    const { detectWithAI } = await import("../../src/detectors/ai-assisted");
    const aiFindings = await detectWithAI(base.files, { title: prTitle });

    if (aiFindings.length === 0) return base;

    // Merge AI findings with static findings
    let allFindings: Finding[] = [...base.findings, ...aiFindings];
    allFindings = dedup(allFindings);

    const penalty = calcPenalty(allFindings);
    const minScore = allFindings.length > 0 ? 30 : 0;
    const trustScore = Math.max(minScore, 100 - Math.min(penalty, 85));

    return { files: base.files, findings: allFindings, trustScore };
  } catch (err) {
    if (typeof process !== "undefined" && process.env.MANTIZ_DEBUG === "true") {
      console.error("[D8] AI detection failed:", err);
    }
    return base;
  }
}

export function standaloneScanWithVerdict(rawDiff: string, prTitle?: string): {
  findings: Finding[];
  trustScore: number;
  verdict: string;
} {
  const result = standaloneScan(rawDiff, prTitle);
  const verdict = result.trustScore >= 80 ? "CLEAN" : result.trustScore >= 50 ? "SUSPICIOUS" : "LIKELY_DECEPTIVE";
  return { findings: result.findings, trustScore: result.trustScore, verdict };
}

// ─── Dedup ──────────────────────────────────────────────────────────

export function dedup(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.filePath}:${f.lineStart}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, f); continue; }
    const w = (c: Confidence) => c === "high" ? 3 : c === "medium" ? 2 : 1;
    if (w(f.confidence) > w(existing.confidence)) seen.set(key, f);
  }
  return Array.from(seen.values());
}

// ─── Penalty ────────────────────────────────────────────────────────

export function calcPenalty(findings: Finding[]): number {
  let total = 0;
  for (const f of findings) {
    const dp = DETECTOR_PENALTIES[f.patternType];
    const base = dp
      ? (f.confidence === "high" ? dp.high : f.confidence === "medium" ? dp.medium : dp.low)
      : (f.confidence === "high" ? 10 : f.confidence === "medium" ? 5 : 2);
    const mult = IMPORTANCE_MULTIPLIER[f.fileImportance ?? "source"] ?? 1;
    total += base * mult;
  }
  return Math.max(0, Math.round(total));
}

// ─── Calibration Helpers ───────────────────────────────────────────

export interface GroundTruthEntry {
  pr_url: string;
  ground_truth_label: "CONFIRMED_DECEPTIVE" | "CONFIRMED_LEGIT" | "AMBIGUOUS";
  id: string;
}

export interface ConfusionCell { tp: number; fp: number; tn: number; fn: number }

export interface ScanRecord {
  pr_url: string;
  repo: string;
  pr_title: string;
  trustScore: number;
  findings: Finding[];
  findingCounts: Record<string, number>;
  groundTruth?: GroundTruthEntry;
}

export interface CalibrationResult {
  detector: PatternType;
  label: string;
  confusion: ConfusionCell;
  precision: number;
  recall: number;
  f1: number;
  supportDeceptive: number;
  supportLegit: number;
  suggestedWeight: { high: number; medium: number; low: number };
  currentWeight: { high: number; medium: number; low: number };
}

export function computeConfusion(records: ScanRecord[], patternType: PatternType): ConfusionCell {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of records) {
    if (!r.groundTruth || r.groundTruth.ground_truth_label === "AMBIGUOUS") continue;
    const triggered = (r.findingCounts[patternType] || 0) > 0;
    const isDeceptive = r.groundTruth.ground_truth_label === "CONFIRMED_DECEPTIVE";
    if (triggered && isDeceptive) tp++;
    else if (triggered && !isDeceptive) fp++;
    else if (!triggered && !isDeceptive) tn++;
    else if (!triggered && isDeceptive) fn++;
  }
  return { tp, fp, tn, fn };
}

export function safeDiv(a: number, b: number): number { return b === 0 ? 0 : a / b; }

export const MAX_PENALTY = 15;
export const MIN_PENALTY = 0;

export function computeSuggestedWeight(f1: number): number {
  if (f1 === 0) return 0;
  return Math.max(MIN_PENALTY, Math.min(MAX_PENALTY, Math.round(f1 * 20)));
}

export function distributeWeight(weight: number, hR: number, mR: number): { high: number; medium: number; low: number } {
  if (weight === 0) return { high: 0, medium: 0, low: 0 };
  const h = Math.round(weight * hR);
  const m = Math.round(weight * mR);
  const hCapped = Math.max(0, Math.min(MAX_PENALTY, h));
  const mCapped = Math.max(0, Math.min(MAX_PENALTY, m));
  return { high: hCapped, medium: mCapped, low: Math.max(0, weight - hCapped - mCapped) };
}

export const CURRENT_WEIGHTS: Record<string, { high: number; medium: number; low: number }> = { ...DETECTOR_PENALTIES };

// ─── CSV Parser ─────────────────────────────────────────────────────

export function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

// ─── Load Ground Truth ──────────────────────────────────────────────

const EVAL_DIR = new URL("../../eval/ground-truth", import.meta.url).pathname;
export const RAW_CANDIDATES_FILE = `${EVAL_DIR}/raw_candidates.jsonl`;
export const LABELED_CSV_FILE = `${EVAL_DIR}/labeled_v1.csv`;
export const LABELING_QUEUE_CSV = `${EVAL_DIR}/labeling_queue.csv`;

export function loadRawCandidates(): Array<{ pr_url: string; repo: string; title: string; diff: string }> {
  try {
    const content = fs.readFileSync(RAW_CANDIDATES_FILE, "utf-8");
    const items: Array<{ pr_url: string; repo: string; title: string; diff: string }> = [];
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t);
        if (e.diff_snippet && typeof e.diff_snippet === "string") {
          items.push({ pr_url: e.pr_url || "", repo: e.repo || e.pr_url?.replace("https://github.com/", "") || "", title: e.pr_title || "", diff: e.diff_snippet });
        }
      } catch { /* skip */ }
    }
    return items;
  } catch { return []; }
}

export function loadGroundTruth(): Map<string, GroundTruthEntry> {
  const map = new Map<string, GroundTruthEntry>();
  try {
    const content = fs.readFileSync(LABELED_CSV_FILE, "utf-8");
    for (const line of content.split("\n").slice(1)) {
      const t = line.trim();
      if (!t) continue;
      const cols = parseCsvLine(t);
      if (cols.length < 8) continue;
      const url = cols[6].trim();
      const label = cols[7].trim().toUpperCase();
      const id = cols[0].trim();
      if (url && ["CONFIRMED_DECEPTIVE", "CONFIRMED_LEGIT", "AMBIGUOUS"].includes(label)) {
        map.set(url, { pr_url: url, ground_truth_label: label as any, id });
      }
    }
  } catch { /* skip */ }
  return map;
}

export function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function shortName(pattern: string): string {
  const map: Record<string, string> = {
    disabled_assertion: "D1", assertion_tampering: "D2", mock_to_avoid_failure: "D3",
    claim_diff_mismatch: "D4", silent_catch_and_pass: "D5", hallucinated_assertion: "D6",
    mutation_susceptibility: "D10", agent_instruction_scan: "D11",
  };
  return map[pattern] || pattern;
}

// Need fs for loadRawCandidates/loadGroundTruth
import * as fs from "node:fs";
