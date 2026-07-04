#!/usr/bin/env tsx
/**
 * Mantiz Calibration Pipeline v1 — standalone scanner
 *
 * Scans raw candidates with current detectors, compares against labeled
 * ground truth, and generates calibration report with per-detector
 * precision/recall/F1 and suggested weights.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  standaloneScan, standaloneScanAsync, loadRawCandidates, loadGroundTruth,
  computeConfusion, computeSuggestedWeight, distributeWeight,
  safeDiv, ALL_PATTERN_TYPES, DETECTOR_LABELS, CURRENT_WEIGHTS,
  type ScanRecord, type CalibrationResult,
} from "./shared-scan";

const REPORTS_DIR = path.resolve(import.meta.dirname, "../../eval/ground-truth/reports");
const CALIBRATION_OUT = path.join(REPORTS_DIR, "calibration-v2.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const QUICK = args.includes("--quick");
const USE_AI = args.includes("--ai");

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

  let overlap = 0;
  for (const c of toScan) { if (groundTruth.has(c.pr_url)) overlap++; }
  console.log(`🔗 Overlap: ${overlap}/${toScan.length}`);
  if (QUICK) console.log(`   (QUICK mode — first ${limit})`);
  console.log("");

  // Scan
  console.log("🔍 Scanning...");
  const records: ScanRecord[] = [];
  const scanStart = Date.now();

  for (let i = 0; i < toScan.length; i++) {
    const c = toScan[i];
    const { findings, trustScore } = USE_AI
      ? await standaloneScanAsync(c.diff, c.title)
      : standaloneScan(c.diff, c.title);

    const findingCounts: Record<string, number> = {};
    for (const f of findings) findingCounts[f.patternType] = (findingCounts[f.patternType] || 0) + 1;

    records.push({
      pr_url: c.pr_url, repo: c.repo, pr_title: c.title.slice(0, 80),
      trustScore, findings, findingCounts, groundTruth: groundTruth.get(c.pr_url),
    });

    if ((i + 1) % 10 === 0 || i === toScan.length - 1) {
      const pct = ((i + 1) / toScan.length * 100).toFixed(0);
      process.stdout.write(`\r   [${pct}%] ${i + 1}/${toScan.length}`);
    }
  }
  console.log("\n");

  // Calibration
  const labeledRecords = records.filter(r => r.groundTruth && r.groundTruth.ground_truth_label !== "AMBIGUOUS");
  const calibrations: CalibrationResult[] = [];

  for (const patternType of ALL_PATTERN_TYPES) {
    const confusion = computeConfusion(labeledRecords, patternType);
    const { tp, fp, fn } = confusion;
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    const dC = labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_DECEPTIVE").length;
    const lC = labeledRecords.filter(r => r.groundTruth?.ground_truth_label === "CONFIRMED_LEGIT").length;
    const sw = computeSuggestedWeight(f1);
    const curr = CURRENT_WEIGHTS[patternType] || { high: 5, medium: 3, low: 1 };
    const t = curr.high + curr.medium + curr.low;
    calibrations.push({
      detector: patternType, label: DETECTOR_LABELS[patternType] || patternType,
      confusion, precision, recall, f1, supportDeceptive: dC, supportLegit: lC,
      suggestedWeight: distributeWeight(sw, t > 0 ? curr.high / t : 0.6, t > 0 ? curr.medium / t : 0.3),
      currentWeight: curr,
    });
  }

  // Print table
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
  console.log(`   Avg: ${avg.toFixed(1)}/100 | CLEAN: ${clean} | SUSP: ${susp} | DEC: ${dec}`);

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
    console.log(`\n✅ Report: ${CALIBRATION_OUT}`);
  } else {
    console.log(`\n✅ DRY-RUN`);
  }
}

main().catch((err) => { console.error("\n❌ Fatal:", err); process.exit(1); });
