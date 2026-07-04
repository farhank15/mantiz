#!/usr/bin/env tsx
/**
 * Label 20 ambiguous PRs based on review analysis.
 * 
 * DECEPTIVE (4): strong D2/D1 signals (assertion tampering, mass test skip)
 * LEGIT (13): D5/D6 only (empty catch, hallucinated assertion — usually FP)
 * AMBIGUOUS (3): mixed signals, needs manual review
 */

import * as fs from "node:fs";
import { parseCsvLine } from "./shared-scan";

const CSV_FILE = new URL("../../eval/ground-truth/labeling_queue.csv", import.meta.url).pathname;

// PRs to label as DECEPTIVE
const DECEPTIVE = [
  "https://github.com/ohcnetwork/care/pull/3667",
  "https://github.com/raccoongang/frontend-app-learning/pull/48",
  "https://github.com/tomboflight/tomboflight/pull/536",
  "https://github.com/jeremymatthewwerner/dining-philosophers-Dec25-sw-factory/pull/663",
];

// PRs to label as LEGIT
const LEGIT = [
  "https://github.com/Are76/CoinPulse/pull/310",
  "https://github.com/ForestAdmin/agent-nodejs/pull/1619",
  "https://github.com/animeshkundu/sanger-viewer/pull/9",
  "https://github.com/ArcadeData/arcadedb/pull/4693",
  "https://github.com/nurtrino/Central-Industrial/pull/2",
  "https://github.com/Galxe/gravity-sdk/pull/701",
  "https://github.com/SharathSPhD/neo-fm/pull/4",
  "https://github.com/nascar9/test-app-claude/pull/553",
  "https://github.com/pablof7z/nostr-multi-platform/pull/2914",
  "https://github.com/Shyden-Ltd/ShyTalk/pull/968",
  "https://github.com/kennguy3n/AEC-Studio/pull/33",
  "https://github.com/openwong2kim/wmux/pull/47",
  "https://github.com/dyahnke-pro/chess-academy-pro/pull/771",
];

// PRs to label as AMBIGUOUS
const AMBIGUOUS = [
  "https://github.com/ractive/ff-rdp/pull/107",
  "https://github.com/openvm-org/openvm/pull/89",
  "https://github.com/pentaho/pentaho-scheduler-plugin/pull/367",
];

function main() {
  const content = fs.readFileSync(CSV_FILE, "utf-8");
  const lines = content.split("\n");
  const header = lines[0];
  const cols = parseCsvLine(header);
  const urlIdx = cols.indexOf("pr_url");
  const labelIdx = cols.indexOf("label");

  let decCount = 0;
  let legitCount = 0;
  let ambCount = 0;

  const newLines: string[] = [header];

  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { newLines.push(""); continue; }

    const row = parseCsvLine(t);
    const url = row[urlIdx]?.trim() || "";
    const existingLabel = row[labelIdx]?.trim() || "";

    // Skip if already labeled
    if (existingLabel) {
      newLines.push(t);
      continue;
    }

    let newLabel = "";
    if (DECEPTIVE.includes(url)) {
      newLabel = "CONFIRMED_DECEPTIVE";
      decCount++;
    } else if (LEGIT.includes(url)) {
      newLabel = "CONFIRMED_LEGIT";
      legitCount++;
    } else if (AMBIGUOUS.includes(url)) {
      newLabel = "AMBIGUOUS";
      ambCount++;
    }

    if (newLabel) {
      row[labelIdx] = newLabel;
    }

    newLines.push(row.join(","));
  }

  fs.writeFileSync(CSV_FILE, newLines.join("\n"), "utf-8");
  console.log(`✅ Labeled ${decCount} DECEPTIVE, ${legitCount} LEGIT, ${ambCount} AMBIGUOUS`);
  console.log(`\n▶️  Import: npx tsx scripts/eval/labeling-pipeline.ts --import`);
}

try { main(); } catch (err) { console.error("Fatal:", err); process.exit(1); }
