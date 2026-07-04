#!/usr/bin/env tsx
/**
 * Quick test for D8 (AI-assisted detection).
 */
import { parseRawDiff } from "../../src/detectors/diff-parser";
import { detectWithAI } from "../../src/detectors/ai-assisted";
import * as fs from "node:fs";

async function main() {
  const lines = fs.readFileSync(
    new URL("../../eval/ground-truth/raw_candidates.jsonl", import.meta.url).pathname,
    "utf-8"
  ).split("\n").filter(l => l.trim());

  // Test first 3 candidates
  for (let i = 0; i < 3; i++) {
    const c = JSON.parse(lines[i]);
    const files = parseRawDiff(c.diff_snippet);
    if (files.length === 0) continue;

    console.log(`\n=== Candidate ${i}: ${c.pr_url} ===`);
    console.log(`  Title: ${c.pr_title?.slice(0, 80)}`);
    console.log(`  Files: ${files.length}`);

    const t0 = Date.now();
    const findings = await detectWithAI(files, { title: c.pr_title });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`  D8: ${findings.length} findings in ${elapsed}s`);
    for (const f of findings) {
      console.log(`    [${f.confidence}] ${f.explanation.slice(0, 100)}`);
    }
  }

  console.log("\n✅ D8 test complete");
}

main().catch((err) => {
  console.error("\n❌ D8 test failed:", err);
  process.exit(1);
});
