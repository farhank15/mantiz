#!/usr/bin/env tsx
/**
 * Deep analysis of D5 (silent catch) false positives.
 * Extracts the actual diff content for each FP PR and categorizes patterns.
 */

import * as fs from "fs";
import { parseCsvLine, standaloneScan } from "./shared-scan";

// ─── Load ground truth ─────────────────────────────────────────────

const csv = fs.readFileSync("eval/ground-truth/labeled_v1.csv", "utf-8");
const lines = csv.split("\n").filter((l) => l.trim());
const header = parseCsvLine(lines[0]);
const urlIdx = header.indexOf("pr_url");
const labelIdx = header.indexOf("ground_truth_label");

const legitUrls = new Set<string>();
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const url = cols[urlIdx]?.trim();
  const label = cols[labelIdx]?.trim().toUpperCase();
  if (url && label === "CONFIRMED_LEGIT") legitUrls.add(url);
}

// ─── Load candidates ───────────────────────────────────────────────

const candidatesRaw = fs
  .readFileSync("eval/ground-truth/raw_candidates.jsonl", "utf-8")
  .split("\n")
  .filter((l) => l.trim());

interface D5FpRecord {
  url: string;
  title: string;
  repo: string;
  lang: string;
  findings: Array<{
    pattern: string;
    confidence: string;
    evidence: string;
    filePath: string;
    lineStart: number;
  }>;
}

const d5FpPrs: D5FpRecord[] = [];
const patternCounts: Record<string, number> = {};
const fileExtCounts: Record<string, number> = {};

for (const raw of candidatesRaw) {
  try {
    const c = JSON.parse(raw);
    const url = c.pr_url;
    if (!legitUrls.has(url)) continue;

    const result = standaloneScan(c.diff_snippet, c.pr_title);
    const d5Findings = result.findings.filter(
      (f) => f.patternType === "silent_catch_and_pass"
    );
    if (d5Findings.length === 0) continue;

    // Collect file extensions involved
    for (const f of result.files) {
      const path = f.newFile || f.oldFile || "";
      const ext = path.split(".").pop() || "unknown";
      fileExtCounts[ext] = (fileExtCounts[ext] || 0) + 1;
    }

    // Categorize each finding
    const findings = d5Findings.map((f) => {
      let pattern = "empty";
      if (f.evidenceExcerpt.includes("console.")) pattern = "console_only";
      else if (f.explanation.includes("comment")) pattern = "comment_only";
      else if (f.explanation.includes("TODO")) pattern = "todo";
      else if (f.explanation.includes("return null")) pattern = "return_null";
      else if (f.explanation.includes("empty finally")) pattern = "empty_finally";
      else if (f.explanation.includes("Multi-line")) pattern = "multi_line_empty";

      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;

      return {
        pattern,
        confidence: f.confidence,
        evidence: f.evidenceExcerpt.slice(0, 150),
        filePath: f.filePath || "",
        lineStart: f.lineStart,
      };
    });

    d5FpPrs.push({
      url: url.split("/").slice(-2).join("/"),
      title: (c.pr_title || "").slice(0, 80),
      repo: c.repo || c.pr_url?.replace("https://github.com/", "").split("/").slice(0, 2).join("/") || "",
      lang: [...new Set(result.files.map((f) => (f.newFile || f.oldFile || "").split(".").pop() || ""))].join("/"),
      findings,
    });

    if (d5FpPrs.length >= 31) break;
  } catch (e) {
    // skip malformed lines
  }
}

// ─── Print Report ──────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("  D5 FALSE POSITIVE DEEP ANALYSIS");
console.log("=".repeat(70));
console.log(`\nTotal FP PRs analyzed: ${d5FpPrs.length}`);
console.log(`Total individual findings: ${Object.values(patternCounts).reduce((a, b) => a + b, 0)}`);

console.log("\n─── Pattern Distribution ───");
for (const [p, c] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p.padEnd(20)} ${c} findings`);
}

console.log("\n─── File Extension Distribution ───");
for (const [e, c] of Object.entries(fileExtCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  .${e.padEnd(10)} ${c} files`);
}

console.log("\n─── Per-PR Detail ───");
for (let i = 0; i < d5FpPrs.length; i++) {
  const pr = d5FpPrs[i];
  console.log(`\n${(i + 1).toString().padStart(2)}. ${pr.url}`);
  console.log(`   File extentions: ${pr.lang}`);
  console.log(`   Title: ${pr.title}`);

  const grouped: Record<string, typeof pr.findings> = {};
  for (const f of pr.findings) {
    if (!grouped[f.pattern]) grouped[f.pattern] = [];
    grouped[f.pattern].push(f);
  }

  for (const [pattern, patFindings] of Object.entries(grouped)) {
    console.log(`   ── ${pattern} (${patFindings.length}x, ${patFindings[0].confidence}) ──`);
    for (const f of patFindings.slice(0, 3)) {
      console.log(`      ${f.filePath}:${f.lineStart}  ${f.evidence}`);
    }
    if (patFindings.length > 3) {
      console.log(`      ... and ${patFindings.length - 3} more`);
    }
  }
}

console.log("\n─── Summary Statistics ───");
const emptyCount = d5FpPrs.filter((pr) => pr.findings.some((f) => f.pattern === "empty")).length;
const consoleCount = d5FpPrs.filter((pr) => pr.findings.some((f) => f.pattern === "console_only")).length;
const multiCount = d5FpPrs.filter((pr) => pr.findings.some((f) => f.pattern === "multi_line_empty")).length;
console.log(`  PRs with empty catches:         ${emptyCount}`);
console.log(`  PRs with console_only catches:  ${consoleCount}`);
console.log(`  PRs with multi-line empty:      ${multiCount}`);
