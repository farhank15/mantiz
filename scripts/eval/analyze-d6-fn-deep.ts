/**
 * Deep-dive analysis of D6 False Negatives:
 * 1. 2 PRs with ZERO detectors catching them
 * 2. 2 PRs with customMatchers (verify expanded prefixes work)
 * 3. 2 PRs with expectDotMethod (understand why D6 misses)
 */

import { parseCsvLine, standaloneScan } from './shared-scan'
import * as fs from 'fs'

const CSV = 'eval/ground-truth/labeled_v1.csv'
const CANDIDATES = 'eval/ground-truth/raw_candidates.jsonl'

const csvContent = fs.readFileSync(CSV, 'utf-8')
const lines = csvContent.split('\n').filter(l => l.trim())
const header = parseCsvLine(lines[0])
const urlIdx = header.indexOf('pr_url')
const labelIdx = header.indexOf('ground_truth_label')

const decUrls = new Set<string>()
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i])
  const url = cols[urlIdx]?.trim()
  const label = cols[labelIdx]?.trim().toUpperCase()
  if (url && label === 'CONFIRMED_DECEPTIVE') decUrls.add(url)
}

const candidates: any[] = []
const rawContent = fs.readFileSync(CANDIDATES, 'utf-8')
for (const rawLine of rawContent.split('\n')) {
  const t = rawLine.trim()
  if (!t) continue
  try {
    const e = JSON.parse(t)
    if (e.diff_snippet) candidates.push(e)
  } catch { /* skip */ }
}

// Targets
const zeroDetectorUrls = [
  'https://github.com/apache/airflow/pull/67900',
  'https://github.com/trusttoken/contracts-pre22/pull/885',
]

const customMatcherUrls = [
  'https://github.com/Jan-IngenHousz-Institute/open-jii/pull/1465',
  'https://github.com/SharathSPhD/neo-fm/pull/4',
]

const expectUrl = [
  'https://github.com/raccoongang/frontend-app-learning/pull/48',
  'https://github.com/Calel33/real-estate-prd/pull/28',
]

function showDiff(c: any, label: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📌 ${label}`)
  console.log(`URL: ${c.pr_url}`)
  console.log(`Title: ${c.pr_title}`)
  console.log(`Lang: ${c.language || 'unknown'}`)
  console.log(`Diff size: ${(c.diff_snippet?.length || 0)} chars`)
  console.log(`${'='.repeat(80)}`)

  // Run scan with verbose output
  const result = standaloneScan(c.diff_snippet, c.pr_title)
  console.log(`\nFindings: ${result.findings.length}`)
  for (const f of result.findings) {
    console.log(`  ${f.patternType} (${f.confidence}): ${f.explanation.slice(0, 120)}`)
  }
  console.log(`TrustScore: ${result.trustScore}`)

  // Show ALL .methodName( calls in the diff
  console.log(`\n--- ALL .methodName() calls in diff ---`)
  const methodCalls = new Map<string, number>()
  for (const file of result.files) {
    const path = file.newFile || file.oldFile || 'unknown'
    for (const hunk of file.hunks) {
      for (const line of hunk.content.split('\n')) {
        if (!line.startsWith('+')) continue
        const content = line.slice(1)
        const matches = content.matchAll(/\.\s*([a-zA-Z]+)\s*\(/g)
        for (const m of matches) {
          const method = m[1]
          methodCalls.set(method, (methodCalls.get(method) || 0) + 1)
        }
      }
    }
  }

  // Sort by frequency
  const sorted = [...methodCalls.entries()].sort((a, b) => b[1] - a[1])
  for (const [method, count] of sorted.slice(0, 30)) {
    // Check if it looks like an assertion
    const looksLike = method.startsWith('to') || method.startsWith('assert') || method.startsWith('should')
      || method.startsWith('must') || method.startsWith('has') || method.startsWith('have')
      || method.startsWith('will')
    if (looksLike) {
      console.log(`  ⚠️  ${method} (x${count}) ← assertion-like but NOT in valid matchers?`)
    } else {
      console.log(`     ${method} (x${count})`)
    }
  }
}

// Show all 6 targeted PRs
for (const c of candidates) {
  if (zeroDetectorUrls.includes(c.pr_url)) {
    showDiff(c, 'ZERO DETECTORS')
  }
}
for (const c of candidates) {
  if (customMatcherUrls.includes(c.pr_url)) {
    showDiff(c, 'CUSTOM MATCHERS')
  }
}
for (const c of candidates) {
  if (expectUrl.includes(c.pr_url)) {
    showDiff(c, 'EXPECT METHOD')
  }
}
