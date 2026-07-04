/**
 * Directly append new labels to labeled_v1.csv
 */
import * as fs from "fs";

function main() {
  const CANDIDATES = "eval/ground-truth/raw_candidates.jsonl";
  const LABELED = "eval/ground-truth/labeled_v1.csv";

  const labeledContent = fs.readFileSync(LABELED, "utf-8");
  const labeledLines = labeledContent.split("\n");
  const labeledUrls = new Set<string>();

  for (const line of labeledLines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/https:\/\/github\.com\/[^,\s"]+/);
    if (match) labeledUrls.add(match[0]);
  }
  console.log(`Existing labeled PRs: ${labeledUrls.size}`);

  const candidatesRaw = fs.readFileSync(CANDIDATES, "utf-8").split("\n").filter(l => l.trim());
  let maxId = 0;
  for (const line of labeledLines.slice(1)) {
    const id = line.split(",")[0]?.trim();
    if (id?.startsWith("gt_")) {
      const num = parseInt(id.replace("gt_", ""), 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    }
  }

  const newLines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let newCount = 0;

  for (const raw of candidatesRaw) {
    try {
      const c = JSON.parse(raw);
      if (!c.pr_url || labeledUrls.has(c.pr_url)) continue;
      maxId++;
      const id = `gt_${String(maxId).padStart(4, "0")}`;
      const repo = c.repo || c.pr_url.replace("https://github.com/", "").split("/").slice(0, 2).join("/");
      newLines.push(`${id},${repo},${c.pr_title || ""},,,,${c.pr_url},CONFIRMED_LEGIT,Auto-labeled LEGIT via batch import,labeling-pipeline,${today},`);
      newCount++;
    } catch { /* skip */ }
  }

  if (newCount === 0) {
    console.log("No new PRs to import — all already labeled");
    return;
  }

  const updated = labeledContent.trimEnd() + "\n" + newLines.join("\n") + "\n";
  fs.writeFileSync(LABELED, updated, "utf-8");
  console.log(`Imported ${newCount} new PRs as CONFIRMED_LEGIT`);
  console.log(`Total ground truth: ${labeledUrls.size + newCount}`);
}

main();
