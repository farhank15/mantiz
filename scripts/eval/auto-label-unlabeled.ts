#!/usr/bin/env tsx
/**
 * Auto-label unlabeled entries
 *
 * Uses a heuristic based on detector findings:
 * - entries with findings_count > 0 + trustScore < 50 → PRELABEL_DECEPTIVE
 * - entries with findings_count == 0 + trustScore >= 80 → PRELABEL_LEGIT
 * - entries with mixed signals → PRELABEL_PENDING_REVIEW
 *
 * Usage:
 *   npx tsx scripts/eval/auto-label-unlabeled.ts
 *   npx tsx scripts/eval/auto-label-unlabeled.ts --input labeled_v6.jsonl
 *   npx tsx scripts/eval/auto-label-unlabeled.ts --output labeled_v6_labeled.jsonl
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

function parseArgs() {
  const args = process.argv.slice(2)
  let inputFile = ''
  let outputFile = ''
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) inputFile = args[++i]
    else if (args[i] === '--output' && i + 1 < args.length) outputFile = args[++i]
  }
  return { inputFile, outputFile }
}

const opts = parseArgs()
const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
const INPUT_FILE = opts.inputFile
  ? path.resolve(opts.inputFile)
  : path.join(EVAL_DIR, 'labeled_v4_labeled.jsonl')
const OUTPUT_FILE = opts.outputFile
  ? path.resolve(opts.outputFile)
  : path.join(EVAL_DIR, 'labeled_v5_prelabeled.jsonl')
const PENDING_FILE = opts.outputFile
  ? path.resolve(opts.outputFile.replace(/(\.jsonl)?$/, '_pending_review.jsonl'))
  : path.join(EVAL_DIR, 'labeled_v5_pending_review.jsonl')

interface Entry {
  id: string
  label?: string
  trustScore: number
  verdict: string
  findings_count: number
  findings_by_detector: Record<string, number>
  findings_by_confidence: { high: number; medium: number; low: number }
  per_detector_detail: Array<{
    detector: string
    count: number
    findings: Array<{
      line: number
      confidence: string
      pattern: string
      excerpt: string
    }>
  }>
  repo: string
  pr_url: string
  pr_title: string
  pr_author: string
  [key: string]: unknown
}

function autoLabel(entry: Entry): { label: string; confidence: string; reason: string } {
  // Already labeled — skip
  if (entry.label === 'CONFIRMED_DECEPTIVE' || entry.label === 'CONFIRMED_LEGIT' || entry.label === 'AMBIGUOUS') {
    return { label: entry.label, confidence: 'high', reason: 'already labeled' }
  }

  const fc = entry.findings_count
  const score = entry.trustScore

  // No findings at all → almost certainly LEGIT
  if (fc === 0 && score >= 80) {
    return {
      label: 'CONFIRMED_LEGIT',
      confidence: 'high',
      reason: `No findings, trustScore=${score}`
    }
  }

  // No findings but low score → edge case, need manual review
  if (fc === 0 && score < 80) {
    return {
      label: 'PENDING_REVIEW',
      confidence: 'low',
      reason: `No findings but score=${score} — unexpected scoring anomaly`
    }
  }

  // Has findings — check which detectors fired
  const detectors = Object.keys(entry.findings_by_detector)
  const highConfFindings = entry.findings_by_confidence?.high || 0
  const totalFindings = fc

  // High-confidence findings from reliable detectors (D6, D2, D3) → likely DECEPTIVE
  const reliableDetectors = ['D6_HallucinatedAssertion', 'D2_AssertionTampering', 'D3_MockToAvoid']
  const hasReliable = detectors.some(d => reliableDetectors.includes(d))

  if (hasReliable && highConfFindings > 0 && score < 60) {
    return {
      label: 'CONFIRMED_DECEPTIVE',
      confidence: 'high',
      reason: `Flagged by ${detectors.join(', ')}, score=${score}, ${highConfFindings} high-confidence findings`
    }
  }

  // Moderately suspicious
  if (score < 50 && totalFindings >= 3) {
    return {
      label: 'CONFIRMED_DECEPTIVE',
      confidence: 'medium',
      reason: `score=${score}, ${totalFindings} findings from ${detectors.join(', ')}`
    }
  }

  // Has findings but high score → likely FP (false positive)
  if (score >= 70 && totalFindings <= 2) {
    return {
      label: 'CONFIRMED_LEGIT',
      confidence: 'medium',
      reason: `Score=${score} despite ${totalFindings} findings from ${detectors.join(', ')} — likely FP`
    }
  }

  // Mixed signals → need manual review
  return {
    label: 'PENDING_REVIEW',
    confidence: 'low',
    reason: `score=${score}, ${totalFindings} findings from ${detectors.join(', ')} — mixed signals`
  }
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input not found: ${INPUT_FILE}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(INPUT_FILE, 'utf-8')
  const entries: Entry[] = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))

  let alreadyLabeled = 0
  let autoLabeled = 0
  let pendingReview = 0
  const results: Entry[] = []
  const pending: Entry[] = []

  for (const entry of entries) {
    const { label, confidence, reason } = autoLabel(entry)

    const labeledEntry: Entry = {
      ...entry,
      label,
      label_auto: true,
      label_auto_confidence: confidence,
      label_auto_reason: reason,
    }

    if (entry.label === 'CONFIRMED_DECEPTIVE' || entry.label === 'CONFIRMED_LEGIT' || entry.label === 'AMBIGUOUS') {
      alreadyLabeled++
      labeledEntry.label_auto = false
      labeledEntry.label_auto_confidence = 'high'
      labeledEntry.label_auto_reason = 'already manually labeled'
    } else if (label === 'PENDING_REVIEW') {
      pendingReview++
      pending.push(labeledEntry)
    } else {
      autoLabeled++
    }

    results.push(labeledEntry)
  }

  // Write complete file with all entries
  fs.writeFileSync(OUTPUT_FILE, results.map(r => JSON.stringify(r)).join('\n'), 'utf-8')
  console.log(`✅ Written ${results.length} entries to ${path.basename(OUTPUT_FILE)}`)

  // Write pending review file
  fs.writeFileSync(PENDING_FILE, pending.map(p => JSON.stringify(p)).join('\n'), 'utf-8')
  console.log(`📝 Written ${pending.length} pending-review entries to ${path.basename(PENDING_FILE)}`)

  // Stats
  console.log('\n═══ Auto-Label Results ═══')
  console.log(`  Already labeled:    ${alreadyLabeled}`)
  console.log(`  Auto-labeled:       ${autoLabeled}`)
  console.log(`  Pending review:     ${pendingReview}`)

  // Breakdown
  const deceptive = results.filter(e => e.label === 'CONFIRMED_DECEPTIVE').length
  const legit = results.filter(e => e.label === 'CONFIRMED_LEGIT').length
  const ambiguous = results.filter(e => e.label === 'AMBIGUOUS').length
  const stillPending = results.filter(e => e.label === 'PENDING_REVIEW').length

  console.log(`\n📊 Final dataset distribution:`)
  console.log(`  DECEPTIVE:    ${deceptive}`)
  console.log(`  LEGIT:        ${legit}`)
  console.log(`  AMBIGUOUS:    ${ambiguous}`)
  console.log(`  PENDING:      ${stillPending}`)
  console.log(`  Total:        ${results.length}`)

  // Show pending entries for manual review
  if (pending.length > 0) {
    console.log('\n🔍 PENDING REVIEW — entries that need manual label:')
    for (const p of pending) {
      console.log(`  ${p.id} | score=${p.trustScore} | findings=${p.findings_count} | detectors=${Object.keys(p.findings_by_detector)} | ${p.repo}`)
    }
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
