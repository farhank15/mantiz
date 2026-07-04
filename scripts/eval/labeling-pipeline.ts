#!/usr/bin/env tsx
/**
 * Mantiz Labeling Pipeline — scan → prioritize → output CSV siap-label
 *
 * Scans ALL raw candidates with current detectors, then outputs a CSV
 * sorted by trust score (ascending — most suspicious first).
 * User fills in the 'label' column: DECEPTIVE, LEGIT, or AMBIGUOUS.
 *
 * Output: eval/ground-truth/labeling_queue.csv
 *
 * Usage:
 *   npx tsx scripts/eval/labeling-pipeline.ts              # full scan
 *   npx tsx scripts/eval/labeling-pipeline.ts --quick       # first 20 only (test)
 *   npx tsx scripts/eval/labeling-pipeline.ts --output foo.csv
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
import type { Finding, Confidence } from "../../src/detectors/types";

// ─── Config ─────────────────────────────────────────────────────────

const EVAL_DIR = path.resolve(import.meta.dirname, "../../eval/ground-truth");
const RAW_CANDIDATES = path.join(EVAL_DIR, "raw_candidates.jsonl");
const LABELED_CSV = path.join(EVAL_DIR, "labeled_v1.csv");
const DEFAULT_OUTPUT = path.join(EVAL_DIR, "labeling_queue.csv");

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const outputIdx = args.indexOf("--output");
const OUTPUT_FILE = outputIdx >= 0 && outputIdx + 1 < args.length ? args[outputIdx + 1] : DEFAULT_OUTPUT;

// ─── Per-Detector Weights (mirrors engine.ts) ──────────────────────

const DETECTOR_PENALTIES: Record<string, { high: number; medium: number; low: number }> = {
  disabled_assertion:      { high: 3,  medium: 2, low: 1 },
  assertion_tampering:     { high: 4,  medium: 2, low: 1 },
  mock_to_avoid_failure:   { high: 6,  medium: 3, low: 1 },
  claim_diff_mismatch:     { high: 0,  medium: 0, low: 0 },
  silent_catch_and_pass:   { high: 4,  medium: 2, low: 0 },
  hallucinated_assertion:  { high: 8,  medium: 4, low: 1 },
  mutation_susceptibility: { high: 9,  medium: 4, low: 0 },
  agent_instruction_scan:  { high: 10, medium: 5, low: 2 },
};

const IMPORTANCE_MULTIPLIER: Record<string, number> = {
  core: 1, test: 1, source: 1, config: 0.5, docs: 0.3, artifact: 0.05,
};

// ─── Standalone Scan (same as calibrate-standalone.ts) ────────────

function standaloneScan(rawDiff: string, prTitle?: string): {
  findings: Finding[];
  trustScore: number;
  verdict: string;
} {
  const files = parseRawDiff(rawDiff);
  if (files.length === 0) return { findings: [], trustScore: 100, verdict: "CLEAN" };

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

  const verdict = trustScore >= 80 ? "CLEAN" : trustScore >= 50 ? "SUSPICIOUS" : "LIKELY_DECEPTIVE";

  return { findings, trustScore, verdict };
}

function dedup(findings: Finding[]): Finding[] {
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

function calcPenalty(findings: Finding[]): number {
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

function loadCandidates(): Array<{ pr_url: string; repo: string; title: string; diff: string }> {
  if (!fs.existsSync(RAW_CANDIDATES)) {
    console.error(`  ❌ ${RAW_CANDIDATES} not found`);
    return [];
  }
  const items: Array<{ pr_url: string; repo: string; title: string; diff: string }> = [];
  for (const line of fs.readFileSync(RAW_CANDIDATES, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (e.diff_snippet && typeof e.diff_snippet === "string") {
        items.push({ pr_url: e.pr_url || "", repo: e.repo || "", title: e.pr_title || "", diff: e.diff_snippet });
      }
    } catch { /* skip */ }
  }
  return items;
}

function loadExistingLabels(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(LABELED_CSV)) return map;
  for (const line of fs.readFileSync(LABELED_CSV, "utf-8").split("\n").slice(1)) {
    const t = line.trim();
    if (!t) continue;
    const cols = parseCsvLine(t);
    if (cols.length >= 8) {
      const url = cols[6].trim();
      const label = cols[7].trim().toUpperCase();
      if (url && ["CONFIRMED_DECEPTIVE", "CONFIRMED_LEGIT", "AMBIGUOUS"].includes(label)) {
        map.set(url, label);
      }
    }
  }
  return map;
}

// ─── Generate CSV ───────────────────────────────────────────────────

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

interface LabelRow {
  pr_url: string;
  repo: string;
  pr_title: string;
  trust_score: number;
  verdict: string;
  findings_summary: string;
  top_finding: string;
  existing_label: string;
  label: string; // empty — to be filled by user
  notes: string;
}

function generateRows(
  candidates: Array<{ pr_url: string; repo: string; title: string; diff: string }>,
  existingLabels: Map<string, string>,
): LabelRow[] {
  const rows: LabelRow[] = [];

  for (const c of candidates) {
    const { findings, trustScore, verdict } = standaloneScan(c.diff, c.title);

    // Summary: detector → count
    const counts: Record<string, number> = {};
    for (const f of findings) {
      counts[f.patternType] = (counts[f.patternType] || 0) + 1;
    }
    const summary = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${shortName(k)}:${v}`)
      .join(" ");

    // Top finding excerpt (first high-confidence or first)
    const top = findings.length > 0
      ? (findings.find(f => f.confidence === "high") || findings[0]).evidenceExcerpt.slice(0, 120)
      : "";

    const existing = existingLabels.get(c.pr_url);

    rows.push({
      pr_url: c.pr_url,
      repo: c.repo,
      pr_title: c.title.slice(0, 100),
      trust_score: trustScore,
      verdict,
      findings_summary: summary || "none",
      top_finding: top,
      existing_label: existing || "",
      label: "", // user fills this
      notes: "",
    });
  }

  // Sort by trust score ascending (most suspicious first)
  // Ties broken by finding count (more findings = higher priority)
  rows.sort((a, b) => {
    if (a.trust_score !== b.trust_score) return a.trust_score - b.trust_score;
    // More findings = more suspicious when scores are equal
    const aCount = a.findings_summary === "none" ? 0 : a.findings_summary.split(" ").reduce((s, p) => s + parseInt(p.split(":")[1] || "0"), 0);
    const bCount = b.findings_summary === "none" ? 0 : b.findings_summary.split(" ").reduce((s, p) => s + parseInt(p.split(":")[1] || "0"), 0);
    return bCount - aCount;
  });

  return rows;
}

// Short detector name
function shortName(pattern: string): string {
  const map: Record<string, string> = {
    disabled_assertion: "D1",
    assertion_tampering: "D2",
    mock_to_avoid_failure: "D3",
    claim_diff_mismatch: "D4",
    silent_catch_and_pass: "D5",
    hallucinated_assertion: "D6",
    mutation_susceptibility: "D10",
    agent_instruction_scan: "D11",
  };
  return map[pattern] || pattern;
}

// ─── CSV Output ─────────────────────────────────────────────────────

function writeCsv(rows: LabelRow[], filePath: string): void {
  const headers = [
    "pr_url",
    "trust_score",
    "verdict",
    "findings",
    "top_finding",
    "existing_label",
    "label",     // ← FILL THIS: CONFIRMED_DECEPTIVE / CONFIRMED_LEGIT / AMBIGUOUS
    "repo",
    "pr_title",
    "notes",
  ];

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      escapeCsv(r.pr_url),
      r.trust_score,
      r.verdict,
      escapeCsv(r.findings_summary),
      escapeCsv(r.top_finding),
      r.existing_label,
      r.label,
      escapeCsv(r.repo),
      escapeCsv(r.pr_title),
      escapeCsv(r.notes),
    ].join(","));
  }

  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\n"), "utf-8"); // BOM for Excel
  console.log(`   📄 ${filePath}`);
}

// ─── Summarize ──────────────────────────────────────────────────────

function printSummary(rows: LabelRow[]): void {
  const total = rows.length;
  const alreadyLabeled = rows.filter(r => r.existing_label).length;
  const needLabel = total - alreadyLabeled;
  const clean = rows.filter(r => r.verdict === "CLEAN").length;
  const susp = rows.filter(r => r.verdict === "SUSPICIOUS").length;
  const dec = rows.filter(r => r.verdict === "LIKELY_DECEPTIVE").length;

  const avgScore = rows.reduce((s, r) => s + r.trust_score, 0) / total;

  console.log(`\n📊 Labeling Queue:`);
  console.log(`   Total PRs: ${total}`);
  console.log(`   Already labeled: ${alreadyLabeled}`);
  console.log(`   Need label: ${needLabel}`);
  console.log(`   Avg score: ${avgScore.toFixed(1)}/100`);
  console.log(`   LIKELY_DECEPTIVE (<50): ${dec}`);
  console.log(`   SUSPICIOUS (50-79): ${susp}`);
  console.log(`   CLEAN (>=80): ${clean}`);

  // Top rows to review
  const topDec = rows.filter(r => !r.existing_label && r.verdict === "LIKELY_DECEPTIVE");
  if (topDec.length > 0) {
    console.log(`\n🔴 Priority — ${topDec.length} unlabeled PRs flagged as LIKELY_DECEPTIVE:`);
    for (const r of topDec.slice(0, 5)) {
      console.log(`   Score ${r.trust_score} | ${r.pr_url}`);
      console.log(`          ${r.findings_summary} | ${r.top_finding.slice(0, 80)}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  🏷️  MANTIZ LABELING PIPELINE");
  console.log("═══════════════════════════════════════════════\n");

  const candidates = loadCandidates();
  const existingLabels = loadExistingLabels();
  const limit = QUICK ? Math.min(20, candidates.length) : candidates.length;
  const toScan = candidates.slice(0, limit);

  console.log(`📂 Candidates: ${candidates.length} (scanning ${toScan.length})`);
  console.log(`📂 Already labeled: ${existingLabels.size} PRs`);
  console.log("");

  // Scan
  console.log("🔍 Scanning...");
  const t0 = Date.now();
  const rows = generateRows(toScan, existingLabels);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`   Done in ${elapsed}s`);
  printSummary(rows);

  // Write CSV
  writeCsv(rows, OUTPUT_FILE);

  console.log(`\n✅ Ready for labeling! Open the CSV and fill the 'label' column.`);
  console.log(`   Suggested workflow:`);
  console.log(`   1. Start from top (lowest trust score = most suspicious)`);
  console.log(`   2. For each PR, open the URL and review the diff`);
  console.log(`   3. Set label to: CONFIRMED_DECEPTIVE, CONFIRMED_LEGIT, or AMBIGUOUS`);
  console.log(`   4. Use 'notes' column for evidence reasoning`);
  console.log(`   5. Save the CSV — the labels will be imported in the next calibration run`);
}

main().catch((err) => { console.error("\n❌ Fatal:", err); process.exit(1); });
