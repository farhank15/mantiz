#!/usr/bin/env tsx
/** Quick perf test — scan 1 real PR diff, time each phase */
import * as fs from 'fs'
import { scanDiff } from '../src/detectors/engine'

const lines = fs.readFileSync('eval/ground-truth/raw_candidates.jsonl', 'utf-8').split('\n').filter(Boolean)
console.log(`Loaded ${lines.length} candidates`)

// Pick the first candidate
const c = JSON.parse(lines[0])
console.log(`Testing: ${c.repo}`)
console.log(`Diff: ${c.diff_snippet.length} chars`)

const start = Date.now()
const result = scanDiff(c.diff_snippet, { title: c.pr_title, author: c.pr_author })
const elapsedSec = ((Date.now() - start) / 1000).toFixed(1)

console.log(`\nResult:`)
console.log(`  Score: ${result.trustScore}`)
console.log(`  Findings: ${result.findings.length}`)
console.log(`  Files: ${result.summary.filesScanned}`)
console.log(`  ⏱️  ${elapsedSec}s`)
console.log(`\n${parseInt(elapsedSec) < 30 ? '✅ FAST' : '❌ SLOW'}`)
