#!/usr/bin/env tsx
/**
 * Auto-fill labels in labeling_queue.csv based on trust score.
 *
 * Rules:
 *   - trust_score >= 80  → CONFIRMED_LEGIT
 *   - trust_score < 50   → CONFIRMED_DECEPTIVE
 *   - 50-79              → skip (ambiguous, needs manual review)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseCsvLine } from "./shared-scan";

const CSV_FILE = path.resolve(import.meta.dirname, "../../eval/ground-truth/labeling_queue.csv");

function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  🤖 AUTO-FILL LABELS");
  console.log("═══════════════════════════════════════════════\n");

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`  ❌ File not found: ${CSV_FILE}`);
    console.log("     Run 'npx tsx scripts/eval/labeling-pipeline.ts' first");
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_FILE, "utf-8");
  const lines = content.split("\n");
  const header = lines[0];

  // Find column indices
  const cols = parseCsvLine(header);
  const scoreIdx = cols.indexOf("trust_score");
  const labelIdx = cols.indexOf("label");
  const urlIdx = cols.indexOf("pr_url");

  if (scoreIdx === -1 || labelIdx === -1 || urlIdx === -1) {
    console.error("  ❌ CSV must have 'trust_score', 'label', and 'pr_url' columns");
    process.exit(1);
  }

  let autoLegit = 0;
  let autoDeceptive = 0;
  let skipped = 0;
  let alreadyLabeled = 0;
  const newLines: string[] = [header];

  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { newLines.push(""); continue; }

    const row = parseCsvLine(t);
    const existingLabel = row[labelIdx]?.trim() || "";
    const trustScore = parseInt(row[scoreIdx]?.trim() || "100", 10);


    // If already labeled, keep as-is
    if (existingLabel && ["CONFIRMED_DECEPTIVE", "CONFIRMED_LEGIT", "AMBIGUOUS"].includes(existingLabel)) {
      alreadyLabeled++;
      newLines.push(t);
      continue;
    }

    let newLabel = "";
    if (trustScore >= 80) {
      newLabel = "CONFIRMED_LEGIT";
      autoLegit++;
    } else if (trustScore < 50) {
      newLabel = "CONFIRMED_DECEPTIVE";
      autoDeceptive++;
    } else {
      skipped++;
    }

    row[labelIdx] = newLabel;
    newLines.push(row.join(","));
  }

  const newContent = newLines.join("\n");
  fs.writeFileSync(CSV_FILE, newContent, "utf-8");

  console.log("📊 Auto-label Summary:");
  console.log(`   ✅ CONFIRMED_LEGIT: ${autoLegit} (trust_score = 100)`);
  console.log(`   🔴 CONFIRMED_DECEPTIVE: ${autoDeceptive} (trust_score < 50)`);
  console.log(`   ⏭️  Ambiguous (skipped): ${skipped} (score 50-99)`);
  console.log(`   📌 Already labeled: ${alreadyLabeled}`);
  console.log(`\n📄 Updated: ${CSV_FILE}`);
  console.log(`\n▶️  Next: run --import to append to ground truth:`);
  console.log(`   npx tsx scripts/eval/labeling-pipeline.ts --import`);
}

try {
  main();
} catch (err: unknown) {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
}
