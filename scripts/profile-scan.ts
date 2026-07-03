#!/usr/bin/env tsx
import { scanDiff } from '../src/detectors/engine'
import * as fs from 'fs'

const raw = fs.readFileSync('eval/ground-truth/raw_candidates.jsonl', 'utf-8')
const candidates = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))

console.log(`Total candidates: ${candidates.length}\n`)

// Time 3 candidates
for (let i = 0; i < Math.min(3, candidates.length); i++) {
  const c = candidates[i]
  const sizeKB = Math.round(c.diff_snippet.length / 1000)
  console.log(`--- Candidate ${i + 1}: ${c.repo}#${c.pr_url.split('/').pop()} (${sizeKB}KB, source=${c.source}) ---`)

  const start = Date.now()
  const result = scanDiff(c.diff_snippet, { title: c.pr_title })
  const elapsed = Date.now() - start

  console.log(`  Time: ${elapsed}ms`)
  console.log(`  Score: ${result.trustScore}, Findings: ${result.findings.length}`)
  console.log(`  Files scanned: ${result.summary.filesScanned}`)
  console.log()
}

// Summary of all candidates
const sizes = candidates.map(c => c.diff_snippet.length / 1000)
const avgSize = (sizes.reduce((a, b) => a + b, 0) / sizes.length * 10) / 10
const maxSize = Math.round(Math.max(...sizes) * 10) / 10
const over50k = candidates.filter(c => c.diff_snippet.length > 50000).length

console.log('--- Summary ---')
console.log(`Total candidates: ${candidates.length}`)
console.log(`Avg diff size: ${avgSize}KB`)
console.log(`Max diff size: ${maxSize}KB`)
console.log(`Diffs > 50KB: ${over50k}`)

// Estimate total time
const estMs = Math.round(avgSize * 20 * candidates.length)
console.log(`Estimated total (sequential): ${Math.round(estMs / 1000)}s at 20ms/KB`)
