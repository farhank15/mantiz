/**
 * Analyze D6 (HallucinatedAssertion) False Negatives.
 * Scans all DECEPTIVE PRs, identifies which ones D6 missed,
 * and extracts the diff patterns for analysis.
 */

import { parseCsvLine, standaloneScan } from './shared-scan'
import * as fs from 'fs'

const CSV = 'eval/ground-truth/labeled_v1.csv'
const CANDIDATES = 'eval/ground-truth/raw_candidates.jsonl'

interface Candidate {
  pr_url: string
  pr_title: string
  repo: string
  diff: string
}

// ─── Load ground truth ─────────────────────────────────────

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

// ─── Load candidates ───────────────────────────────────────

const candidates: Candidate[] = []
const rawContent = fs.readFileSync(CANDIDATES, 'utf-8')
for (const rawLine of rawContent.split('\n')) {
  const t = rawLine.trim()
  if (!t) continue
  try {
    const e = JSON.parse(t)
    if (e.diff_snippet && typeof e.diff_snippet === 'string') {
      candidates.push({
        pr_url: e.pr_url || '',
        pr_title: e.pr_title || '',
        repo: e.repo || e.pr_url?.replace('https://github.com/', '') || '',
        diff: e.diff_snippet,
      })
    }
  } catch { /* skip */ }
}

console.log(`Loaded ${candidates.length} candidates, ${decUrls.size} DECEPTIVE labels\n`)

// ─── Scan each candidate ───────────────────────────────────

interface D6Miss {
  pr_url: string
  pr_title: string
  patternsDetected: string[]
  diffExcerpt: string
  note: string
}

const misses: D6Miss[] = []

for (const c of candidates) {
  if (!decUrls.has(c.pr_url)) continue

  const result = standaloneScan(c.diff, c.pr_title)
  const d6Count = result.findings.filter(f => f.patternType === 'hallucinated_assertion').length
  const allPatterns = [...new Set(result.findings.map(f => f.patternType))]

  if (d6Count === 0) {
    // MISSED by D6 — extract evidence
    // Try to find the relevant part of the diff (test files)
    const files = result.files
    const testChanges = files
      .filter(f => {
        const p = f.newFile || f.oldFile || ''
        return /\.(test|spec)\.(ts|tsx|js|jsx)$/i.test(p) || /\/__tests__\//i.test(p) || /\/tests?\//i.test(p)
      })
      .slice(0, 3)

    let diffExcerpt = ''
    if (testChanges.length > 0) {
      for (const f of testChanges) {
        const path = f.newFile || f.oldFile || 'unknown'
        for (const h of f.hunks) {
          const lines = h.content.split('\n').filter(l => l.startsWith('+')).slice(0, 8)
          if (lines.length > 0) {
            diffExcerpt += `\n--- ${path} (hunk ${h.newStart}):\n`
            diffExcerpt += lines.map(l => l.slice(1).trim()).filter(Boolean).slice(0, 5).join('\n') + '\n'
          }
        }
      }
    }

    misses.push({
      pr_url: c.pr_url,
      pr_title: c.pr_title.slice(0, 100),
      patternsDetected: allPatterns,
      diffExcerpt: diffExcerpt.slice(0, 500),
      note: '',
    })
  }
}

// ─── Output ────────────────────────────────────────────────

console.log(`=== D6 FALSE NEGATIVES: ${misses.length} DECEPTIVE PRs missed ===\n`)

for (const m of misses) {
  console.log(`📌 ${m.pr_url}`)
  console.log(`   Title: ${m.pr_title}`)
  console.log(`   Detected patterns: ${m.patternsDetected.join(', ') || '(none)'}`)
  if (m.diffExcerpt) {
    console.log(`   Diff excerpt:`)
    console.log(m.diffExcerpt.slice(0, 400))
  }
  console.log('')
}

// ─── Category summary ──────────────────────────────────────

console.log('=== PATTERN CATEGORIES ===\n')

// Analyze the diff excerpts for common patterns
const patterns = {
  expectDotMethod: 0,
  assertMethod: 0,
  mockAssertions: 0,
  customMatchers: 0,
  noAssertions: 0,
  chainPatterns: 0,
}

for (const m of misses) {
  const excerpt = m.diffExcerpt
  if (/expect\s*\(/.test(excerpt)) patterns.expectDotMethod++
  if (/assert\s*\(/.test(excerpt)) patterns.assertMethod++
  if (/(mock|spyOn|stub)/i.test(excerpt)) patterns.mockAssertions++
  if (/\.\s*(to|assert|should|must|has|have|will)[A-Z]/.test(excerpt)) patterns.customMatchers++
  if (!/expect|assert|should|to[A-Z]/.test(excerpt)) patterns.noAssertions++
  if (/\.\w+\s*\([^)]*\)\s*\.\s*\w+\s*\(/.test(excerpt)) patterns.chainPatterns++
}

console.log('Pattern distribution across missed PRs:')
for (const [key, count] of Object.entries(patterns)) {
  console.log(`  ${key}: ${count}/${misses.length} (${Math.round(count/misses.length*100)}%)`)
}

// List which detectors caught these PRs
const detectorHits: Record<string, number> = {}
for (const m of misses) {
  for (const p of m.patternsDetected) {
    detectorHits[p] = (detectorHits[p] || 0) + 1
  }
}
console.log('\nOther detectors that caught these PRs (D6 missed):')
for (const [det, count] of Object.entries(detectorHits).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${det}: ${count}/${misses.length}`)
}
