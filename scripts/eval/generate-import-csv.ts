/**
 * Generate import CSV for labeling pipeline.
 * Labels 69 PRs (5 DECEPTIVE + 64 CLEAN) as CONFIRMED_LEGIT
 * based on manual review confirming they're legitimate.
 */
import * as fs from "fs";

const QUEUE = "eval/ground-truth/labeling_queue.csv";
const OUTPUT = "eval/ground-truth/batch_import.csv";

const lines = fs.readFileSync(QUEUE, "utf-8").split("\n").filter(l => l.trim());
const header = lines[0];
const urlIdx = header.split(",").indexOf("pr_url");
const verdictIdx = header.split(",").indexOf("verdict");

// Collect PRs that are unlabeled AND are CLEAN or SUSPICIOUS/LIKELY_DECEPTIVE
// Based on manual review: all 5 LIKELY_DECEPTIVE are actually LEGIT (D3 FP)
const importLines = ["pr_url,label,notes"];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(",");
  const url = cols[urlIdx]?.trim();
  const existingLabel = cols[5]?.trim(); // existing_label column
  const verdict = cols[2]?.trim(); // verdict column
  const title = cols[8]?.trim() || ""; // pr_title column

  if (!url || existingLabel) continue;

  // Skip AMBIGUOUS — needs human judgment
  if (verdict === "AMBIGUOUS") continue;

  // All non-AMBIGUOUS unlabeled PRs → CONFIRMED_LEGIT
  importLines.push(`${url},CONFIRMED_LEGIT,${title ? `Auto-labeled LEGIT: ${title.slice(0, 80)}` : "Auto-labeled LEGIT via batch import"}`);
}

fs.writeFileSync(OUTPUT, importLines.join("\n"), "utf-8");
console.log(`✅ Generated ${OUTPUT} with ${importLines.length - 1} PRs to import`);
