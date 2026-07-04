#!/usr/bin/env tsx
/**
 * Mantiz Calibration Pipeline v1 — standalone scanner
 *
 * Bypasses engine.ts (which imports @tanstack/react-start that breaks in CLI)
 * by importing detectors + diff parser directly.
 */

import * as fs from "node:fs";
import * as path from "node:path";
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

// ─── Config ─────────────────────────────────────────────────────────

const EVAL_DIR = path.resolve(import.meta.dirname, "../../eval/ground-truth");
const RAW_CANDIDATES = path.join(EVAL_DIR, "raw_candidates.jsonl");
const LABELED_CSV = path.join(EVAL_DIR, "labeled_v1.csv");
const REPORTS_DIR = path.join(EVAL_DIR, "reports");
const CALIBRATION_OUT = path.join(REPORTS_DIR, "calibration-v2.json");

const ALL_PATTERN_TYPES: PatternType[] = [
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

const MAX_PENALTY = 15;
const MIN_PENALTY = 0;

// ─── Per-Detector Penalty Weights (mirrors engine.ts) ──────────────

const DETECTOR_PENALTIES: Record<string, { high: number; medium: number; low: number }> = {
  disabled_assertion:      { high: 8,  medium: 4, low: 2 },
  assertion_tampering:     { high: 8,  medium: 4, low: 1 },
  mock_to_avoid_failure:   { high: 8,  medium: 4, low: 1 },
  claim_diff_mismatch:     { high: 0,  medium: 0, low: 0 },
  silent_catch_and_pass:   { high: 3,  medium: 1, low: 0 },
  hallucinated_assertion:  { high: 6,  medium: 3, low: 1 },
  ai_assisted_detection:   { high: 10, medium: 5, low: 2 },
  historical_behavioral:   { high: 5,  medium: 3, low: 1 },
  mutation_susceptibility: { high: 2,  medium: 1, low: 0 },
  agent_instruction_scan:  { high: 10, medium: 5, low: 2 },
};

const IMPORTANCE_MULTIPLIER: Record<string, number> = {
  core: 1, test: 1, source: 1, config: 0.5, docs: 0.3, artifact: 0.05,
};

// ─── CLI Args ───────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const QUICK = args.includes("--quick");

// ─── Types ──────────────────────────────────────────────────────────

interface GroundTruthEntry {
  pr_url: string;
  ground_truth_label: "CONFIRMED_DECEPTIVE" | "CONFIRMED_LEGIT" | "AMBIGUOUS";
  id: string;
}

interface ConfusionCell { tp: number; fp: number; tn: number; fn: number }

interface CalibrationResult {
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

interface ScanRecord {
  pr_url: string;
  repo: string;
  pr_title: string;
  trustScore: number;
  findings: Finding[];
  findingCounts: Record<string, number>;
  groundTruth?: GroundTruthEntry;
}

// ─── Standalone Scan (bypasses engine.ts) ──────────────────────────

function standaloneScan(rawDiff: string, prTitle?: string): {
  files: ParsedDiff[];
  findings: Finding[];
  trustScore: number;
} {
  const files = parseRawDiff(rawDiff);
  if (files.length === 0) return { files, findings: [], trustScore: 100 };

  const functionalFiles = files.filter(f => !isNonFunctional(f.newFile || f.oldFile || ""));

  // Run ALL synchronous detectors (same order as engine.ts)
  const d1 = detectDisabledAssertions(functionalFiles);
  const d2 = detectAssertionTampering(functionalFiles);
  const d3 = detectMockToAvoid(functionalFiles);
  const d4 = detectClaimDiffMismatch(files, { title: prTitle });
  const d5 = detectSilentCatch(functionalFiles);
  const d6 = detectHallucinatedAssertions(functionalFiles);
  const d10 = detectMutationSusceptibility(functionalFiles);
  const d11 = detectAgentInstructions(files);

  let findings: Finding[] = [...d1, ...d2, ...d3, ...d4, ...d5, ...d6, ...d10, ...d11];

  // Enrich with file importance
  for (const f of findings) {
    if (!f.fileImportance) f.fileImportance = classifyImportance(f.filePath);
  }

  // Dedup
  findings = dedupFindings(findings);

  // Calculate penalty (same formula as engine.ts)
  const penalty = calculatePenalty(findings);
  const minScore = findings.length > 0 ? 30 : 0;
  const trustScore = Math.max(minScore, 100 - Math.min(penalty, 85));

  return { files, findings, trustScore };
}

function dedupFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.filePath}:${f.lineStart}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, f); continue; }
    const weight = (c: Confidence) => c === "high" ? 3 : c === "medium" ? 2 : 1;
    if (weight(f.confidence) > weight(existing.confidence)) seen.set(key, f);
  }
  return Array.from(seen.values());
}

function calculatePenalty(findings: Finding[]): number {
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

// ─── CSV Parser ─────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
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

// ─── Load Data ──────────────────────────────────────────────────────

function loadRawCandidates(): Array<{ pr_url: string; diff: string; title: string }> {
  if (!fs.existsSync(RAW_CANDIDATES)) return [];
  const candidates: Array<{ pr_url: string; diff: string; title: string }> = [];
  for (const line of fs.readFileSync(RAW_CANDIDATES, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (entry.diff_snippet && typeof entry.diff_snippet === "string") {
        candidates.push({
          pr_url: entry.pr_url || "unknown",
          diff: entry.diff_snippet,
          title: entry.pr_title || "",
        });
      }
    } catch { /* skip */ }
  }
  return candidates;
}

function loadGroundTruth(): Map<string, GroundTruthEntry> {
  const gtMap = new Map<string, GroundTruthEntry>();
  if (!fs.existsSync(LABELED_CSV)) return gtMap;

  const lines = fs.readFileSync(LABELED_CSV, "utf-8").split("\n").slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = parseCsvLine(trimmed);
    if (cols.length < 8) continue;
    const pr_url = cols[6].trim();
    const label = cols[7].trim().toUpperCase();
    const id = cols[0].trim();
    if (!pr_url || !["CONFIRMED_DECEPTIVE", "CONFIRMED_LEGIT", "AMBIGUOUS"].includes(label)) continue;
    gtMap.set(pr_url, { pr_url, ground_truth_label: label as any, id });
  }
  return gtMap;
}

// ─── Confusion Matrix ───────────────────────────────────────────────

function computeConfusion(records: ScanRecord[], patternType: PatternType): ConfusionCell {
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

function safeDiv(a: number, b: number): number { return b === 0 ? 0 : a / b; }
function computeSuggestedWeight(f1: number): number {
  if (f1 === 0) return 0;
  return Math.max(MIN_PENALTY, Math.min(MAX_PENALTY, Math.round(f1 * 20)));
}

function distributeWeight(weight: number, hR: number, mR: number): { high: number; medium: number; low: number } {
  if (weight === 0) return { high: 0, medium: 0, low: 0 };
  const h = Math.round(weight * hR);
  const m = Math.round(weight * mR);
  const hCapped = Math.max(0, Math.min(MAX_PENALTY, h));
  const mCapped = Math.max(0, Math.min(MAX_PENALTY, m));
  return {
    high: hCapped,
    medium: mCapped,
    low: Math.max(0, weight - hCapped - mCapped),
  };
}

const CURRENT_WEIGHTS: Record<string, { high: number; medium: number; low: number }> = {
  disabled_assertion: { high: 8, medium: 4, low: 2 },
  assertion_tampering: { high: 8, medium: 4, low: 1 },
  mock_to_avoid_failure: { high: 8, medium: 4, low: 1 },
  claim_diff_mismatch: { high: 0, medium: 0, low: 0 },
  silent_catch_and_pass: { high: 3, medium: 1, low: 0 },
  hallucinated_assertion: { high: 6, medium: 3, low: 1 },
  ai_assisted_detection: { high: 10, medium: 5, low: 2 },
  historical_behavioral: { high: 5, medium: 3, low: 1 },
  mutation_susceptibility: { high: 2, medium: 1, low: 0 },
  agent_instruction_scan: { high: 10, medium: 5, low: 2 },
};

const DETECTOR_LABELS: Record<string, string> = {
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

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  🔬 MANTIZ CALIBRATION PIPELINE v1 (standalone)");
  console.log("═══════════════════════════════════════════════\n");

  const candidates = loadRawCandidates();
  const groundTruth = loadGroundTruth();
  console.log(`📂 Raw candidates: ${candidates.length}`);
  console.log(`📂 Ground truth entries: ${groundTruth.size}`);

  const limit = QUICK ? Math.min(20, candidates.length) : candidates.length;
  const toScan = candidates.slice(0, limit);

  let overlapCount = 0;
  for (const c of toScan) { if (groundTruth.has(c.pr_url)) overlapCount++; }
  console.log(`🔗 Overlap: ${overlapCount}/${toScan.length}`);
  if (QUICK) console.log(`   (QUICK mode — first ${limit})`);
  console.log("");

  // Scan
  console.log("🔍 Scanning...");
  const records: ScanRecord[] = [];
  const scanStart = Date.now();

  for (let i = 0; i < toScan.length; i++) {
    const c = toScan[i];
    const t0 = Date.now();
    const { findings, trustScore } = standaloneScan(c.diff, c.title);
    const dt = Date.now() - t0;

    const findingCounts: Record<string, number> = {};
    for (const f of findings) findingCounts[f.patternType] = (findingCounts[f.patternType] || 0) + 1;

    records.push({
      pr_url: c.pr_url,
      repo: c.pr_url.replace("https://github.com/", ""),
      pr_title: c.title.slice(0, 80),
      trustScore,
      findings,
      findingCounts,
      groundTruth: groundTruth.get(c.pr_url),
    });

    const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
    const pct = ((i + 1) / toScan.length * 100).toFixed(0);
    process.stdout.write(`\r   [${pct}%] ${i + 1}/${toScan.length} | ${dt}ms/call | total: ${elapsed}s`);
  }
  console.log("\n");

  // Labeled records (for confusion matrix)
  const labeledRecords = records.filter(r =>
    r.groundTruth && r.groundTruth.ground_truth_label !== "AMBIGUOUS"
  );

  // Compute calibration
  const calibrations: CalibrationResult[] = [];
  for (const patternType of ALL_PATTERN_TYPES) {
    const confusion = computeConfusion(labeledRecords, patternType);
    const { tp, fp, fn } = confusion;
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    const dCount = labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_DECEPTIVE").length;
    const lCount = labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_LEGIT").length;
    const sw = computeSuggestedWeight(f1);
    const curr = CURRENT_WEIGHTS[patternType] || { high: 5, medium: 3, low: 1 };
    const t = curr.high + curr.medium + curr.low;
    calibrations.push({
      detector: patternType, label: DETECTOR_LABELS[patternType] || patternType,
      confusion, precision, recall, f1, supportDeceptive: dCount, supportLegit: lCount,
      suggestedWeight: distributeWeight(sw, t > 0 ? curr.high / t : 0.6, t > 0 ? curr.medium / t : 0.3),
      currentWeight: curr,
    });
  }

  // Print calibration table
  console.log("📊 Calibration Results:\n");
  console.log(`| Detector               | TP | FP | TN | FN | Prec   | Rec    | F1     | Support | Curr | Sugg |`);
  console.log(`|------------------------|:--:|:--:|:--:|:--:|:------:|:------:|:------:|:-------:|:----:|:----:|`);
  for (const cal of calibrations) {
    const c = cal.confusion;
    console.log(
      `| ${cal.label.padEnd(22)} | ${String(c.tp).padStart(2)} | ${String(c.fp).padStart(2)} | ${String(c.tn).padStart(2)} | ${String(c.fn).padStart(2)} | ` +
      `${(cal.precision * 100).toFixed(0).padStart(4)}% | ${(cal.recall * 100).toFixed(0).padStart(4)}% | ${(cal.f1 * 100).toFixed(0).padStart(4)} | ` +
      `${cal.supportDeceptive}/${cal.supportLegit} | ${cal.currentWeight.high}/${cal.currentWeight.medium}/${cal.currentWeight.low} | ${cal.suggestedWeight.high}/${cal.suggestedWeight.medium}/${cal.suggestedWeight.low} |`,
    );
  }

  // Score distribution
  const scores = records.map(r => r.trustScore);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const clean = scores.filter(s => s >= 80).length;
  const susp = scores.filter(s => s >= 50 && s < 80).length;
  const dec = scores.filter(s => s < 50).length;
  const totalTime = ((Date.now() - scanStart) / 1000).toFixed(1);

  console.log(`\n📈 Score Distribution (${records.length} candidates, ${totalTime}s):`);
  console.log(`   Avg: ${avg.toFixed(1)}/100 | CLEAN: ${clean} (${(clean / records.length * 100).toFixed(1)}%) | SUSP: ${susp} (${(susp / records.length * 100).toFixed(1)}%) | DEC: ${dec} (${(dec / records.length * 100).toFixed(1)}%)`);

  // Write reports
  if (!DRY_RUN) {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

    const json = calibrations.map(c => ({
      detector: c.detector, label: c.label, confusion: c.confusion,
      precision: +(c.precision * 100).toFixed(1), recall: +(c.recall * 100).toFixed(1),
      f1: +(c.f1 * 100).toFixed(1), supportDeceptive: c.supportDeceptive, supportLegit: c.supportLegit,
      suggestedWeight: c.suggestedWeight, currentWeight: c.currentWeight,
    }));

    fs.writeFileSync(CALIBRATION_OUT, JSON.stringify({
      version: "v2", generated_at: new Date().toISOString(),
      total_candidates: records.length, labeled_overlap: labeledRecords.length,
      deceptive_count: labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_DECEPTIVE").length,
      legit_count: labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_LEGIT").length,
      detectors: json,
      score_distribution: { avg: +avg.toFixed(1), clean, suspicious: susp, deceptive: dec },
    }, null, 2), "utf-8");

    console.log(`\n✅ Reports written:`);
    console.log(`   📄 ${CALIBRATION_OUT}`);
  } else {
    console.log(`\n✅ DRY-RUN`);
  }
}

main().catch((err) => { console.error("\n❌ Fatal:", err); process.exit(1); });
