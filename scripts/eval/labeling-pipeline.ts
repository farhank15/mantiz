#!/usr/bin/env tsx
/**
 * Mantiz Labeling Pipeline — scan → prioritize → output CSV siap-label
 *
 * Usage:
 *   npx tsx scripts/eval/labeling-pipeline.ts                # generate CSV (350 PRs)
 *   npx tsx scripts/eval/labeling-pipeline.ts --quick        # first 20 only (test)
 *   npx tsx scripts/eval/labeling-pipeline.ts --output.csv   # custom output
 *   npx tsx scripts/eval/labeling-pipeline.ts --import       # import labels from CSV → labeled_v1.csv
 *   npx tsx scripts/eval/labeling-pipeline.ts --import foo.csv
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  standaloneScanWithVerdict, loadRawCandidates, loadGroundTruth,
  parseCsvLine, escapeCsv, shortName, LABELED_CSV_FILE,
} from "./shared-scan";

const EVAL_DIR = path.resolve(import.meta.dirname, "../../eval/ground-truth");
const DEFAULT_OUTPUT = path.join(EVAL_DIR, "labeling_queue.csv");

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const IMPORT_MODE = args.includes("--import");
const outputIdx = args.indexOf("--output");
const OUTPUT_FILE = outputIdx >= 0 && outputIdx + 1 < args.length ? args[outputIdx + 1] : DEFAULT_OUTPUT;

// ─── Import Mode ────────────────────────────────────────────────────
// Reads a filled labeling CSV and appends new labels to labeled_v1.csv

function importLabels(csvFile: string): void {
  console.log(`📂 Importing labels from: ${csvFile}`);
  console.log(`📂 Target: ${LABELED_CSV_FILE}`);

  if (!fs.existsSync(csvFile)) {
    console.error(`  ❌ File not found: ${csvFile}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(csvFile, "utf-8").split("\n");
  if (lines.length < 2) {
    console.error("  ❌ CSV file is empty or has only header");
    process.exit(1);
  }

  // Parse header to find column indices
  const header = parseCsvLine(lines[0].trim());
  const urlIdx = header.indexOf("pr_url");
  const labelIdx = header.indexOf("label");
  const notesIdx = header.indexOf("notes");

  if (urlIdx === -1 || labelIdx === -1) {
    console.error("  ❌ CSV must have 'pr_url' and 'label' columns");
    process.exit(1);
  }

  // Read existing ground truth
  const existingGt = loadGroundTruth();
  console.log(`   Existing labels: ${existingGt.size}`);

  // Parse new labels from CSV
  const newEntries: Array<{ pr_url: string; label: string; notes: string; repo: string }> = [];
  let skipped = 0;
  let invalid = 0;

  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const cols = parseCsvLine(t);
    const url = cols[urlIdx]?.trim();
    const label = cols[labelIdx]?.trim().toUpperCase();
    const notes = notesIdx >= 0 ? cols[notesIdx]?.trim() || "" : "";

    if (!url || !label) { skipped++; continue; }
    if (!["CONFIRMED_DECEPTIVE", "CONFIRMED_LEGIT", "AMBIGUOUS"].includes(label)) {
      invalid++;
      continue;
    }
    if (existingGt.has(url)) { skipped++; continue; }

    newEntries.push({ pr_url: url, label, notes, repo: cols[1] || "" });
  }

  if (newEntries.length === 0) {
    console.log("   No new labels to import (all already exist or invalid)");
    return;
  }

  console.log(`   New labels to import: ${newEntries.length}`);
  if (invalid > 0) console.log(`   ⚠️  Invalid labels (skipped): ${invalid}`);
  if (skipped > 0) console.log(`   ⏭️  Already labeled (skipped): ${skipped}`);

  // Read existing labeled CSV content
  let existingContent = "";
  if (fs.existsSync(LABELED_CSV_FILE)) {
    existingContent = fs.readFileSync(LABELED_CSV_FILE, "utf-8").trimEnd();
  }

  // Generate new IDs
  const existingIds = new Set<string>();
  for (const line of existingContent.split("\n").slice(1)) {
    const cols = parseCsvLine(line.trim());
    if (cols[0]?.trim()) existingIds.add(cols[0].trim());
  }

  let maxId = 0;
  for (const id of existingIds) {
    const num = parseInt(id.replace("gt_", ""), 10);
    if (!isNaN(num) && num > maxId) maxId = num;
  }

  // Append new entries
  const today = new Date().toISOString().slice(0, 10);
  const appended: string[] = [];

  for (const entry of newEntries) {
    maxId++;
    const newId = `gt_${String(maxId).padStart(4, "0")}`;
    const repo = entry.repo || entry.pr_url.replace("https://github.com/", "").split("/").slice(0, 2).join("/");
    // Format: id,repo,pr_title,score,verdict,findings_count,pr_url,ground_truth_label,label_evidence,labeler,labeled_at,detectors
    const csvLine = [
      newId,
      repo,
      "",   // pr_title — left blank (user can fill later)
      "",   // score — filled by next calibration run
      "",   // verdict — filled by next calibration run
      "",   // findings_count — filled by next calibration run
      entry.pr_url,
      entry.label,
      entry.notes || `Labeled via labeling pipeline on ${today}`,
      "labeling-pipeline",
      today,
      "",   // detectors — filled by next calibration run
    ].join(",");

    appended.push(csvLine);
  }

  const newContent = existingContent + "\n" + appended.join("\n") + "\n";
  fs.writeFileSync(LABELED_CSV_FILE, newContent, "utf-8");

  console.log(`   ✅ Imported ${appended.length} new labels to ${LABELED_CSV_FILE}`);
  console.log(`   📊 Total ground truth: ${existingGt.size + appended.length}`);

  // Ask user to re-run calibration
  console.log(`\n   🔄 Run calibration to update weights:`);
  console.log(`      npx tsx scripts/eval/calibrate-standalone.ts`);
}

// ─── Generate Mode ──────────────────────────────────────────────────
// Scans raw candidates and outputs a CSV ready for labeling

interface LabelRow {
  pr_url: string; repo: string; pr_title: string;
  trust_score: number; verdict: string;
  findings_summary: string; top_finding: string;
  existing_label: string; label: string; notes: string;
}

function generateRows(candidates: Array<{ pr_url: string; repo: string; title: string; diff: string }>, existingLabels: Map<string, { pr_url: string; ground_truth_label: "CONFIRMED_DECEPTIVE" | "CONFIRMED_LEGIT" | "AMBIGUOUS"; id: string }>): LabelRow[] {
  const rows: LabelRow[] = [];

  for (const c of candidates) {
    const { findings, trustScore, verdict } = standaloneScanWithVerdict(c.diff, c.title);

    const counts: Record<string, number> = {};
    for (const f of findings) counts[f.patternType] = (counts[f.patternType] || 0) + 1;
    const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${shortName(k)}:${v}`).join(" ") || "none";

    const top = findings.length > 0
      ? (findings.find(f => f.confidence === "high") || findings[0]).evidenceExcerpt.slice(0, 120)
      : "";

    rows.push({
      pr_url: c.pr_url, repo: c.repo, pr_title: c.title.slice(0, 100),
      trust_score: trustScore, verdict,
      findings_summary: summary, top_finding: top,
      existing_label: existingLabels.get(c.pr_url)?.ground_truth_label || "", label: "", notes: "",
    });
  }

  // Sort: most suspicious first
  rows.sort((a, b) => {
    if (a.trust_score !== b.trust_score) return a.trust_score - b.trust_score;
    const aC = a.findings_summary === "none" ? 0 : a.findings_summary.split(" ").reduce((s, p) => s + parseInt(p.split(":")[1] || "0"), 0);
    const bC = b.findings_summary === "none" ? 0 : b.findings_summary.split(" ").reduce((s, p) => s + parseInt(p.split(":")[1] || "0"), 0);
    return bC - aC;
  });

  return rows;
}

function writeCsv(rows: LabelRow[], filePath: string): void {
  const headers = ["pr_url", "trust_score", "verdict", "findings", "top_finding", "existing_label", "label", "repo", "pr_title", "notes"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([escapeCsv(r.pr_url), r.trust_score, r.verdict, escapeCsv(r.findings_summary), escapeCsv(r.top_finding), r.existing_label, r.label, escapeCsv(r.repo), escapeCsv(r.pr_title), escapeCsv(r.notes)].join(","));
  }
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\n"), "utf-8");
  console.log(`   📄 ${filePath}`);
}

function printSummary(rows: LabelRow[]): void {
  const total = rows.length;
  const alreadyLabeled = rows.filter(r => r.existing_label).length;
  const clean = rows.filter(r => r.verdict === "CLEAN").length;
  const susp = rows.filter(r => r.verdict === "SUSPICIOUS").length;
  const dec = rows.filter(r => r.verdict === "LIKELY_DECEPTIVE").length;
  const avgScore = rows.reduce((s, r) => s + r.trust_score, 0) / total;

  console.log(`\n📊 Labeling Queue:`);
  console.log(`   Total: ${total} | Already labeled: ${alreadyLabeled} | Need label: ${total - alreadyLabeled}`);
  console.log(`   Avg score: ${avgScore.toFixed(1)}/100`);
  console.log(`   CLEAN: ${clean} | SUSPICIOUS: ${susp} | LIKELY_DECEPTIVE: ${dec}`);

  const topDec = rows.filter(r => !r.existing_label && r.verdict === "LIKELY_DECEPTIVE");
  if (topDec.length > 0) {
    console.log(`\n🔴 ${topDec.length} unlabeled LIKELY_DECEPTIVE PRs:`);
    for (const r of topDec.slice(0, 5)) {
      console.log(`   Score ${r.trust_score} | ${r.pr_url}`);
      console.log(`          ${r.findings_summary} | ${r.top_finding.slice(0, 80)}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  if (IMPORT_MODE) {
    const importFile = outputIdx >= 0 ? OUTPUT_FILE : DEFAULT_OUTPUT;
    console.log("\n═══════════════════════════════════════════════");
    console.log("  📥 MANTIZ LABEL IMPORT");
    console.log("═══════════════════════════════════════════════\n");
    importLabels(importFile);
    return;
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  🏷️  MANTIZ LABELING PIPELINE");
  console.log("═══════════════════════════════════════════════\n");

  const candidates = loadRawCandidates();
  const existingLabels = loadGroundTruth();
  const limit = QUICK ? Math.min(20, candidates.length) : candidates.length;
  const toScan = candidates.slice(0, limit);

  console.log(`📂 Candidates: ${candidates.length} (scanning ${toScan.length})`);
  console.log(`📂 Already labeled in DB: ${existingLabels.size}`);
  console.log("");

  console.log("🔍 Scanning...");
  const t0 = Date.now();
  const rows = generateRows(toScan, existingLabels);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`   Done in ${elapsed}s`);

  printSummary(rows);
  writeCsv(rows, OUTPUT_FILE);

  console.log(`\n✅ CSV ready! Open and fill the 'label' column.`);
  console.log(`   Set label to: CONFIRMED_DECEPTIVE / CONFIRMED_LEGIT / AMBIGUOUS`);
  console.log(`   Then import: npx tsx scripts/eval/labeling-pipeline.ts --import`);
}

main().catch((err) => { console.error("\n❌ Fatal:", err); process.exit(1); });
