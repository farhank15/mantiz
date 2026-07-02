#!/usr/bin/env tsx
/** Find which part of scanDiff is catastrophically slow on real PR diffs */
import * as fs from 'fs'
import { parseRawDiff } from '../src/detectors/diff-parser'
import { isNonFunctional } from '../src/detectors/claim-mismatch'

const lines = fs.readFileSync('eval/ground-truth/raw_candidates.jsonl', 'utf-8').split('\n').filter(Boolean)
const c = JSON.parse(lines[0])
console.log(`Testing: ${c.repo}`)
console.log(`Diff: ${c.diff_snippet.length} chars`)

// Step 1: Parse diff
let t = Date.now()
const files = parseRawDiff(c.diff_snippet)
console.log(`1. parseRawDiff: ${Date.now() - t}ms (${files.length} files)`)

const funcFiles = files.filter(f => !isNonFunctional(f.newFile || f.oldFile || ''))
console.log(`   functional: ${funcFiles.length} files`)

// Step 2: Load each detector module + run on first hunk only
const detectors = [
  { name: 'D1 DisabledAssertion', path: '../src/detectors/disabled-assertion' },
  { name: 'D2 AssertionTampering', path: '../src/detectors/assertion-tampering' },
  { name: 'D3 MockToAvoid', path: '../src/detectors/mock-to-avoid' },
  { name: 'D5 SilentCatch', path: '../src/detectors/silent-catch' },
  { name: 'D6 HallucinatedAssertion', path: '../src/detectors/hallucination' },
  { name: 'D10 MutationSusceptibility', path: '../src/detectors/mutation-susceptibility' },
]

for (const d of detectors) {
  t = Date.now()
  const mod = await import(d.path)
  const fn = Object.values(mod)[0] as (files: unknown[]) => unknown[]
  const result = fn(funcFiles)
  console.log(`${d.name}: ${Date.now() - t}ms (${result.length} findings)`)
}

console.log('\nDONE')
