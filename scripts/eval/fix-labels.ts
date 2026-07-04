#!/usr/bin/env tsx
/**
 * Fix wrong labels based on actual diff validation.
 * 
 * DECEPTIVE → LEGIT (was wrong):
 *   - ohcnetwork/care #3667 — Legit refactor, D2 was false positive
 *   - tomboflight/tomboflight #536 — Legit feature work, D2 was false positive
 * 
 * LEGIT → AMBIGUOUS (was wrong):
 *   - Shyden-Ltd/ShyTalk #968 — Has assertion tampering + heavy mocks
 * 
 * DECEPTIVE → AMBIGUOUS (borderline):
 *   - jeremymatthewwerner/dining-philosophers #663 — Has test skips but could be legit investigation
 */

import * as fs from "node:fs";

const CSV_FILE = new URL("../../eval/ground-truth/labeled_v1.csv", import.meta.url).pathname;

const FIXES: Record<string, string> = {
  // Wrong DECEPTIVE → LEGIT
  "https://github.com/ohcnetwork/care/pull/3667": "CONFIRMED_LEGIT",
  "https://github.com/tomboflight/tomboflight/pull/536": "CONFIRMED_LEGIT",
  // Wrong LEGIT → AMBIGUOUS
  "https://github.com/Shyden-Ltd/ShyTalk/pull/968": "AMBIGUOUS",
  // DECEPTIVE → AMBIGUOUS (borderline)
  "https://github.com/jeremymatthewwerner/dining-philosophers-Dec25-sw-factory/pull/663": "AMBIGUOUS",
};

function main() {
  const content = fs.readFileSync(CSV_FILE, "utf-8");
  const lines = content.split("\n");
  let fixes = 0;

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 8) continue;
    
    // Column 6 is pr_url (0-indexed)
    const url = cols[6]?.trim() || "";
    
    if (FIXES[url]) {
      // Column 7 is ground_truth_label
      const oldLabel = cols[7]?.trim() || "";
      cols[7] = FIXES[url];
      lines[i] = cols.join(",");
      fixes++;
      console.log(`  ${url}: ${oldLabel} → ${FIXES[url]}`);
    }
  }

  fs.writeFileSync(CSV_FILE, lines.join("\n"), "utf-8");
  console.log(`\n✅ Fixed ${fixes} labels in ${CSV_FILE}`);
  console.log(`\n▶️  Run calibration to see updated results:`);
  console.log(`   npx tsx scripts/eval/calibrate-standalone.ts`);
}

try { main(); } catch (err) { console.error("Fatal:", err); process.exit(1); }
