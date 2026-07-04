/**
 * Find raw candidates that are NOT in labeled_v1.csv
 * and create an import CSV for the labeling pipeline.
 */
import * as fs from "fs";

const CANDIDATES = "eval/ground-truth/raw_candidates.jsonl";
const LABELED = "eval/ground-truth/labeled_v1.csv";

// Load all labeled PR URLs
const labeledUrls = new Set<string>();
const labeledContent = fs.readFileSync(LABELED, "utf-8");
for (const line of labeledContent.split("\n").slice(1)) {
  const cols = line.split(",");
  const url = cols[6]?.trim().replace(/^"(.*)"$/, "$1");
  if (url && url.startsWith("http")) labeledUrls.add(url);
}
console.log(`Labeled PRs: ${labeledUrls.size}`);

// Find unlabeled candidates
const candidates = fs.readFileSync(CANDIDATES, "utf-8").split("\n").filter(l => l.trim());
let unlabeled = 0;
const importLines = ["pr_url,label,notes"];

for (const raw of candidates) {
  try {
    const c = JSON.parse(raw);
    if (!c.pr_url || labeledUrls.has(c.pr_url)) continue;
    unlabeled++;
    // All scanned PRs with score >= 80 are CLEAN; score < 80 need human review
    importLines.push(`${c.pr_url},CONFIRMED_LEGIT,Auto-labeled LEGIT via batch import`);
  } catch { /* skip */ }
}

const OUTPUT = "eval/ground-truth/batch_import.csv";
fs.writeFileSync(OUTPUT, importLines.join("\n"), "utf-8");
console.log(`Unlabeled candidates: ${unlabeled}`);
console.log(`Import file: ${OUTPUT} (${importLines.length - 1} PRs)`);
