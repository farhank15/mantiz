#!/usr/bin/env tsx
/**
 * Mantiz Calibration Pipeline v1
 *
 * Scans ALL raw candidates with current detectors (D1-D11, multi-language),
 * compares results against labeled ground truth (where available),
 * and generates:
 *
 *   1. Trust score distribution (histogram)
 *   2. Per-detector confusion matrix (TP/FP/TN/FN) — when labels exist
 *   3. Precision / Recall / F1 per detector
 *   4. Suggested weight adjustments based on precision-recall tradeoff
 *
 * Usage:
 *   npx tsx scripts/eval/calibrate-pipeline.ts              # full pipeline
 *   npx tsx scripts/eval/calibrate-pipeline.ts --dry-run     # no file writes
 *   npx tsx scripts/eval/calibrate-pipeline.ts --quick       # scan first 20 only
 *
 * Output:
 *   eval/ground-truth/reports/calibration-v2.json
 *   eval/ground-truth/reports/calibration-v2-report.md
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { scanDiff } from "../../src/detectors/engine";
import type { PatternType } from "../../src/detectors/types";

// ─── Config ─────────────────────────────────────────────────────────

const EVAL_DIR = path.resolve(import.meta.dirname, "../../eval/ground-truth");
const RAW_CANDIDATES = path.join(EVAL_DIR, "raw_candidates.jsonl");
const LABELED_CSV = path.join(EVAL_DIR, "labeled_v1.csv");
const REPORTS_DIR = path.join(EVAL_DIR, "reports");
const CALIBRATION_OUT = path.join(REPORTS_DIR, "calibration-v2.json");
const REPORT_OUT = path.join(REPORTS_DIR, "calibration-v2-report.md");

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

interface ConfusionCell {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

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

interface RawCandidate {
  pr_url: string;
  repo: string;
  pr_title: string;
  pr_author: string;
  source: string;
  diff_snippet: string;
  diff_length_chars: number;
}

// ─── CSV Parser (handles double-quoted fields) ──────────────────────

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

function loadRawCandidates(): RawCandidate[] {
  if (!fs.existsSync(RAW_CANDIDATES)) {
    console.log(`  ⚠️  ${RAW_CANDIDATES} not found — 0 raw candidates`);
    return [];
  }

  const lines = fs.readFileSync(RAW_CANDIDATES, "utf-8").split("\n");
  const candidates: RawCandidate[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (entry.diff_snippet && typeof entry.diff_snippet === "string") {
        candidates.push({
          pr_url: entry.pr_url || "unknown",
          repo: entry.repo || "unknown",
          pr_title: entry.pr_title || "",
          pr_author: entry.pr_author || "",
          source: entry.source || "unknown",
          diff_snippet: entry.diff_snippet,
          diff_length_chars: entry.diff_length_chars || entry.diff_snippet.length,
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  return candidates;
}

function loadGroundTruth(): Map<string, GroundTruthEntry> {
  const gtMap = new Map<string, GroundTruthEntry>();

  if (!fs.existsSync(LABELED_CSV)) {
    console.log(`  ⚠️  ${LABELED_CSV} not found — no ground truth`);
    return gtMap;
  }

  const lines = fs.readFileSync(LABELED_CSV, "utf-8").split("\n");
  const dataLines = lines.slice(1); // skip header

  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cols = parseCsvLine(trimmed);
    if (cols.length < 8) continue;

    const pr_url = cols[6].trim();
    const label = cols[7].trim().toUpperCase();
    const id = cols[0].trim();

    if (!pr_url || !["CONFIRMED_DECEPTIVE", "CONFIRMED_LEGIT", "AMBIGUOUS"].includes(label)) continue;

    gtMap.set(pr_url, {
      pr_url,
      ground_truth_label: label as GroundTruthEntry["ground_truth_label"],
      id,
    });
  }

  return gtMap;
}

// ─── Scanning ───────────────────────────────────────────────────────

interface ScanRecord {
  pr_url: string;
  repo: string;
  pr_title: string;
  source: string;
  trustScore: number;
  verdict: string;
  totalFindings: number;
  findingCounts: Record<string, number>;
  confidenceCounts: Record<string, number>;
  groundTruth?: GroundTruthEntry;
  diffLength: number;
}

function scanCandidate(candidate: RawCandidate, groundTruth?: GroundTruthEntry): ScanRecord {
  const result = scanDiff(candidate.diff_snippet);

  const findingCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = { high: 0, medium: 0, low: 0 };

  for (const f of result.findings) {
    findingCounts[f.patternType] = (findingCounts[f.patternType] || 0) + 1;
    confidenceCounts[f.confidence] = (confidenceCounts[f.confidence] || 0) + 1;
  }

  return {
    pr_url: candidate.pr_url,
    repo: candidate.repo,
    pr_title: candidate.pr_title.slice(0, 80),
    source: candidate.source,
    trustScore: result.trustScore,
    verdict: result.verdict?.label || "UNKNOWN",
    totalFindings: result.summary.totalFindings,
    findingCounts,
    confidenceCounts,
    groundTruth,
    diffLength: candidate.diff_length_chars,
  };
}

// ─── Confusion Matrix ───────────────────────────────────────────────

function computeConfusion(
  records: ScanRecord[],
  patternType: PatternType,
): ConfusionCell {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const r of records) {
    if (!r.groundTruth) continue;
    if (r.groundTruth.ground_truth_label === "AMBIGUOUS") continue;

    const triggered = (r.findingCounts[patternType] || 0) > 0;
    const isDeceptive = r.groundTruth.ground_truth_label === "CONFIRMED_DECEPTIVE";

    if (triggered && isDeceptive) tp++;
    else if (triggered && !isDeceptive) fp++;
    else if (!triggered && !isDeceptive) tn++;
    else if (!triggered && isDeceptive) fn++;
  }

  return { tp, fp, tn, fn };
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/**
 * Compute suggested weight for a detector based on its F1 score.
 * Higher F1 → higher weight (more trust in the detector).
 * Formula: weight = round(F1 * 20) — scaled to 0-20 range.
 * Then cap at MAX_PENALTY (15).
 */
function computeSuggestedWeight(f1: number): number {
  if (f1 === 0) return 0;
  const weight = Math.round(f1 * 20);
  return Math.max(MIN_PENALTY, Math.min(MAX_PENALTY, weight));
}

function distributeWeight(
  weight: number,
  highRatio: number,
  mediumRatio: number,
): { high: number; medium: number; low: number } {
  if (weight === 0) return { high: 0, medium: 0, low: 0 };

  const totalRatio = highRatio + mediumRatio + (1 - highRatio - mediumRatio);
  const h = Math.round(weight * (highRatio / totalRatio));
  const m = Math.round(weight * (mediumRatio / totalRatio));
  const l = weight - h - m;

  return {
    high: Math.max(0, Math.min(MAX_PENALTY, h)),
    medium: Math.max(0, Math.min(MAX_PENALTY, m)),
    low: Math.max(0, Math.min(MAX_PENALTY, l)),
  };
}

// ─── Current Weights (from engine.ts) ──────────────────────────────

const CURRENT_WEIGHTS: Record<string, { high: number; medium: number; low: number }> = {
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

// ─── Detector Labels ────────────────────────────────────────────────

const DETECTOR_LABELS: Record<string, string> = {
  disabled_assertion:      "D1_DisabledAssertion",
  assertion_tampering:     "D2_AssertionTampering",
  mock_to_avoid_failure:   "D3_MockToAvoid",
  claim_diff_mismatch:     "D4_ClaimDiffMismatch",
  silent_catch_and_pass:   "D5_SilentCatch",
  hallucinated_assertion:  "D6_HallucinatedAssertion",
  ai_assisted_detection:   "D8_AIAssisted",
  historical_behavioral:   "D9_Historical",
  mutation_susceptibility: "D10_MutationSusceptibility",
  agent_instruction_scan:  "D11_AgentInstruction",
};

// ─── Report Generation ──────────────────────────────────────────────

function generateReport(
  records: ScanRecord[],
  labeledRecords: ScanRecord[],
  calibrations: CalibrationResult[],
): string {
  const total = records.length;
  const labeled = labeledRecords.length;
  const deceptive = labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_DECEPTIVE").length;
  const legit = labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_LEGIT").length;

  // Score distribution
  const scores = records.map(r => r.trustScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];
  const scoreBuckets = [0, 20, 40, 60, 80, 90, 95, 100];

  // Most common findings
  const findingFrequency: Record<string, number> = {};
  for (const r of records) {
    for (const [pattern, count] of Object.entries(r.findingCounts)) {
      findingFrequency[pattern] = (findingFrequency[pattern] || 0) + count;
    }
  }

  const topFindings = Object.entries(findingFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const lines: string[] = [];
  lines.push("# Mantiz Calibration Report v2");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Detector version:** Current (D1-D11, multi-language)`);
  lines.push(`**Total raw candidates:** ${total}`);
  lines.push(`**Labeled entries (overlap):** ${labeled} (${deceptive} DECEPTIVE, ${legit} LEGIT, ${labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "AMBIGUOUS").length} AMBIGUOUS)`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 1. Trust Score Distribution");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Average score | ${avgScore.toFixed(1)}/100 |`);
  lines.push(`| Median score | ${medianScore}/100 |`);
  lines.push(`| Min score | ${Math.min(...scores)}/100 |`);
  lines.push(`| Max score | ${Math.max(...scores)}/100 |`);
  lines.push(`| Std Dev | ${Math.sqrt(scores.reduce((sq, s) => sq + (s - avgScore) ** 2, 0) / scores.length).toFixed(1)} |`);
  lines.push("");

  lines.push("### Score Histogram");
  lines.push("");
  lines.push("| Score Range | Count | Bar |");
  lines.push("|-------------|------:|-----|");
  const bucketLabels = ["0", "≤20", "≤40", "≤60", "≤80", "≤90", "≤95", "≤100"];
  for (let i = 0; i < bucketLabels.length; i++) {
    const upperBound = scoreBuckets[i];
    const count = i === 0
      ? scores.filter(s => s === 0).length
      : scores.filter(s => s > scoreBuckets[i - 1] && s <= upperBound).length;
    if (count > 0 || bucketLabels[i] === "≤100") {
      const bar = count > 0 ? "█".repeat(Math.max(1, Math.round(count / total * 40))) : "";
      lines.push(`| ${bucketLabels[i]} | ${count} | ${bar} |`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## 2. Most Common Findings");
  lines.push("");
  lines.push("| Rank | Detector | Count | % of Candidates |");
  lines.push("|------|----------|------:|:---------------:|");
  const maxCount = topFindings.length > 0 ? topFindings[0][1] : 1;
  for (const [i, [pattern, count]] of topFindings.entries()) {
    const label = DETECTOR_LABELS[pattern] || pattern;
    const pct = (count / total * 100).toFixed(1);
    const bar = "█".repeat(Math.max(1, Math.round(count / maxCount * 20)));
    lines.push(`| ${i + 1} | ${label} | ${count} | ${pct}% ${bar} |`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## 3. Per-Detector Calibration");
  lines.push("");
  lines.push(`| Detector | TP | FP | TN | FN | Precision | Recall | F1 | Support(D/L) | Current | Suggested |`);
  lines.push(`|----------|:--:|:--:|:--:|:--:|:---------:|:------:|:--:|:------------:|:-------:|:----------:|`);

  for (const cal of calibrations) {
    const c = cal.confusion;
    const curr = cal.currentWeight;
    const sugg = cal.suggestedWeight;
    lines.push(
      `| ${cal.label} | ${c.tp} | ${c.fp} | ${c.tn} | ${c.fn} | ` +
      `${(cal.precision * 100).toFixed(1)}% | ${(cal.recall * 100).toFixed(1)}% | ` +
      `${(cal.f1 * 100).toFixed(1)} | ${cal.supportDeceptive}/${cal.supportLegit} | ` +
      `${curr.high}/${curr.medium}/${curr.low} | ${sugg.high}/${sugg.medium}/${sugg.low} |`,
    );
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## 4. Suggested Weight Changes");
  lines.push("");
  lines.push("```diff");
  for (const cal of calibrations) {
    const curr = cal.currentWeight;
    const sugg = cal.suggestedWeight;
    if (curr.high !== sugg.high || curr.medium !== sugg.medium || curr.low !== sugg.low) {
      lines.push(`  '${cal.detector}':      { high: ${curr.high},  medium: ${curr.medium}, low: ${curr.low} },`);
      lines.push(`+ '${cal.detector}':      { high: ${sugg.high},  medium: ${sugg.medium}, low: ${sugg.low} },`);
    }
  }
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 5. Source Distribution");
  lines.push("");
  const sourceDist: Record<string, number> = {};
  for (const r of records) {
    sourceDist[r.source] = (sourceDist[r.source] || 0) + 1;
  }
  lines.push("| Source | Count |");
  lines.push("|--------|------:|");
  for (const [src, count] of Object.entries(sourceDist).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${src} | ${count} |`);
  }
  lines.push("");

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════");
  console.log("  🔬 MANTIZ CALIBRATION PIPELINE v1");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Load data
  console.log("📂 Loading data...");
  const candidates = loadRawCandidates();
  const groundTruth = loadGroundTruth();
  console.log(`   Raw candidates: ${candidates.length}`);
  console.log(`   Ground truth entries: ${groundTruth.size}\n`);

  const limit = QUICK ? Math.min(20, candidates.length) : candidates.length;
  const toScan = candidates.slice(0, limit);

  // 2. Find overlap
  let overlapCount = 0;
  for (const c of toScan) {
    if (groundTruth.has(c.pr_url)) overlapCount++;
  }
  console.log(`🔗 Overlap with ground truth: ${overlapCount}/${toScan.length}`);
  if (QUICK) console.log(`   (QUICK mode — scanning first ${limit})`);
  console.log("");

  // 3. Scan each candidate
  console.log("🔍 Scanning candidates...");
  const records: ScanRecord[] = [];

  for (let i = 0; i < toScan.length; i++) {
    const candidate = toScan[i];
    const gt = groundTruth.get(candidate.pr_url);
    const record = scanCandidate(candidate, gt);
    records.push(record);

    if ((i + 1) % 10 === 0 || i === toScan.length - 1) {
      const pct = ((i + 1) / toScan.length * 100).toFixed(0);
      process.stdout.write(`\r   Progress: ${i + 1}/${toScan.length} (${pct}%)`);
    }
  }
  console.log("\n");

  // 4. Labeled records (non-ambiguous only)
  const labeledRecords = records.filter(r =>
    r.groundTruth !== undefined && r.groundTruth.ground_truth_label !== "AMBIGUOUS"
  );

  // 5. Compute per-detector calibration from labeled records
  const calibrations: CalibrationResult[] = [];

  for (const patternType of ALL_PATTERN_TYPES) {
    const confusion = computeConfusion(labeledRecords, patternType);
    const { tp, fp, fn } = confusion;
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    const supportDeceptive = labeledRecords.filter(
      r => r.groundTruth?.ground_truth_label === "CONFIRMED_DECEPTIVE"
    ).length;
    const supportLegit = labeledRecords.filter(
      r => r.groundTruth?.ground_truth_label === "CONFIRMED_LEGIT"
    ).length;

    const suggestedWeightVal = computeSuggestedWeight(f1);
    const current = CURRENT_WEIGHTS[patternType] || { high: 5, medium: 3, low: 1 };

    const totalCurr = current.high + current.medium + current.low;
    const highRatio = totalCurr > 0 ? current.high / totalCurr : 0.6;
    const mediumRatio = totalCurr > 0 ? current.medium / totalCurr : 0.3;

    calibrations.push({
      detector: patternType,
      label: DETECTOR_LABELS[patternType] || patternType,
      confusion,
      precision,
      recall,
      f1,
      supportDeceptive,
      supportLegit,
      suggestedWeight: distributeWeight(suggestedWeightVal, highRatio, mediumRatio),
      currentWeight: current,
    });
  }

  // 6. Print summary table
  console.log("📊 Calibration Results:\n");
  console.log(`| Detector               | TP | FP | TN | FN | Prec   | Rec    | F1     | Support | Curr     | Sugg     |`);
  console.log(`|------------------------|:--:|:--:|:--:|:--:|:------:|:------:|:------:|:-------:|:--------:|:--------:|`);
  for (const cal of calibrations) {
    const c = cal.confusion;
    console.log(
      `| ${cal.label.padEnd(22)} | ${String(c.tp).padStart(2)} | ${String(c.fp).padStart(2)} | ` +
      `${String(c.tn).padStart(2)} | ${String(c.fn).padStart(2)} | ` +
      `${(cal.precision * 100).toFixed(0).padStart(4)}% | ${(cal.recall * 100).toFixed(0).padStart(4)}% | ` +
      `${(cal.f1 * 100).toFixed(0).padStart(4)} | ` +
      `${cal.supportDeceptive}/${cal.supportLegit} | ` +
      `${cal.currentWeight.high}/${cal.currentWeight.medium}/${cal.currentWeight.low} | ` +
      `${cal.suggestedWeight.high}/${cal.suggestedWeight.medium}/${cal.suggestedWeight.low} |`,
    );
  }

  // 7. Score distribution
  const scores = records.map(r => r.trustScore);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const cleanCount = scores.filter(s => s >= 80).length;
  const suspiciousCount = scores.filter(s => s >= 50 && s < 80).length;
  const deceptiveCount = scores.filter(s => s < 50).length;

  console.log(`\n📈 Score Distribution (${records.length} candidates):`);
  console.log(`   Average: ${avg.toFixed(1)}/100`);
  console.log(`   CLEAN (>=80): ${cleanCount} (${(cleanCount / records.length * 100).toFixed(1)}%)`);
  console.log(`   SUSPICIOUS (50-79): ${suspiciousCount} (${(suspiciousCount / records.length * 100).toFixed(1)}%)`);
  console.log(`   LIKELY_DECEPTIVE (<50): ${deceptiveCount} (${(deceptiveCount / records.length * 100).toFixed(1)}%)`);

  // 8. Write report files
  if (!DRY_RUN) {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    const calibrationJson = calibrations.map(c => ({
      detector: c.detector,
      label: c.label,
      confusion: c.confusion,
      precision: +(c.precision * 100).toFixed(1),
      recall: +(c.recall * 100).toFixed(1),
      f1: +(c.f1 * 100).toFixed(1),
      supportDeceptive: c.supportDeceptive,
      supportLegit: c.supportLegit,
      suggestedWeight: c.suggestedWeight,
      currentWeight: c.currentWeight,
    }));

    fs.writeFileSync(CALIBRATION_OUT, JSON.stringify({
      version: "v2",
      generated_at: new Date().toISOString(),
      total_candidates: records.length,
      labeled_overlap: labeledRecords.length,
      deceptive_count: labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_DECEPTIVE").length,
      legit_count: labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_LEGIT").length,
      detectors: calibrationJson,
      score_distribution: {
        avg: +avg.toFixed(1),
        clean: cleanCount,
        suspicious: suspiciousCount,
        deceptive: deceptiveCount,
      },
    }, null, 2), "utf-8");

    const report = generateReport(records, labeledRecords, calibrations);
    fs.writeFileSync(REPORT_OUT, report, "utf-8");

    console.log(`\n✅ Reports written:`);
    console.log(`   📄 ${CALIBRATION_OUT}`);
    console.log(`   📄 ${REPORT_OUT}`);
  } else {
    console.log(`\n✅ DRY-RUN — no files written`);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
