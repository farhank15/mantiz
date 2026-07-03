#!/usr/bin/env tsx
/**
 * Merge v8_unsorted (latest D6/D10 scan) with v7 manual labels
 *
 * For entries already in v7 → preserve manual labels
 * For NEW entries → auto-label conservatively
 *
 * Usage:
 *   npx tsx scripts/eval/merge-v8.ts
 *   npx tsx scripts/eval/merge-v8.ts --v7 eval/ground-truth/labeled_v7.jsonl
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

interface Entry {
  id: string
  repo: string
  pr_url: string
  pr_title: string
  pr_author: string
  source: string
  trustScore: number
  verdict: string
  findings_count: number
  findings_by_detector: Record<string, number>
  findings_by_confidence: { high: number; medium: number; low: number }
  per_detector_detail: Array<{
    detector: string
    count: number
    findings: Array<{ line: number; confidence: string; pattern: string; excerpt: string }>
  }>
  label?: string
  ground_truth_label?: string
  label_auto?: boolean
  label_auto_confidence?: string
  label_auto_reason?: string
}

function parseArgs() {
  const args = process.argv.slice(2)
  let v7File = ''
  let v8File = ''
  let outputFile = ''
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--v7' && i + 1 < args.length) v7File = args[++i]
    else if (args[i] === '--v8' && i + 1 < args.length) v8File = args[++i]
    else if (args[i] === '--output' && i + 1 < args.length) outputFile = args[++i]
  }
  return { v7File, v8File, outputFile }
}

/**
 * Auto-label a new entry (not in v7) based on detector findings.
 * Conservative: 0 auto-labeled DECEPTIVE (same principle as recover-labels.ts)
 */
function autoLabel(entry: Entry): { label: string; confidence: string; reason: string } {
  const fc = entry.findings_count
  const score = entry.trustScore
  const detectors = Object.keys(entry.findings_by_detector)

  // No findings → LEGIT
  if (fc === 0 && score >= 80) {
    return {
      label: 'CONFIRMED_LEGIT',
      confidence: 'high',
      reason: `No findings, trustScore=${score}`,
    }
  }

  // No findings but low score → edge case, need review
  if (fc === 0 && score < 80) {
    return {
      label: 'PENDING_REVIEW',
      confidence: 'low',
      reason: `No findings but score=${score} — unexpected scoring anomaly`,
    }
  }

  // Has findings with high score → likely FP
  if (score >= 70 && fc <= 2) {
    return {
      label: 'PENDING_REVIEW',
      confidence: 'low',
      reason: `Score=${score} despite ${fc} findings from ${detectors.join(', ')} — may be FP`,
    }
  }

  // Has findings — defer to manual review (conservative: 0 auto DECEPTIVE)
  return {
    label: 'PENDING_REVIEW',
    confidence: 'low',
    reason: `score=${score}, ${fc} findings from ${detectors.join(', ')} — needs manual review`,
  }
}

function main() {
  const opts = parseArgs()
  const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
  const v7File = opts.v7File ? path.resolve(opts.v7File) : path.join(EVAL_DIR, 'labeled_v7.jsonl')
  const v8File = opts.v8File ? path.resolve(opts.v8File) : path.join(EVAL_DIR, 'labeled_v8_unsorted.jsonl')
  const outputFile = opts.outputFile ? path.resolve(opts.outputFile) : path.join(EVAL_DIR, 'labeled_v8.jsonl')
  const manualOnlyFile = outputFile.replace('.jsonl', '_manual_only.jsonl')

  // Load v7 (manual labels)
  const v7Raw = fs.readFileSync(v7File, 'utf-8')
  const v7Entries: Entry[] = v7Raw.split('\n').filter(Boolean).map(line => JSON.parse(line))

  // Build lookup by pr_url
  const v7ByUrl = new Map<string, Entry>()
  for (const e of v7Entries) {
    // Prefer entries with manual labels (label_auto=false)
    const existing = v7ByUrl.get(e.pr_url)
    if (!existing || existing.label_auto === true) {
      v7ByUrl.set(e.pr_url, e)
    }
  }

  console.log(`📖 Loaded ${v7Entries.length} v7 entries (${v7ByUrl.size} unique URLs)`)

  // Load v8_unsorted (latest scan)
  const v8Raw = fs.readFileSync(v8File, 'utf-8')
  const v8Entries: Entry[] = v8Raw.split('\n').filter(Boolean).map(line => JSON.parse(line))

  console.log(`📖 Loaded ${v8Entries.length} v8_unsorted entries`)

  // Merge
  const result: Entry[] = []
  let manualPreserved = 0
  let autoLabeled = 0
  let pendingReview = 0

  for (const v8 of v8Entries) {
    const matched = v7ByUrl.get(v8.pr_url)
    if (matched && matched.label && !matched.label.startsWith('PENDING')) {
      // Preserve manual label from v7
      result.push({
        ...v8,
        label: matched.label,
        ground_truth_label: matched.ground_truth_label || matched.label,
        label_auto: false,
        label_auto_confidence: 'high',
        label_auto_reason: 'Preserved from v7 manual label',
      })
      manualPreserved++
    } else if (matched && matched.label === 'PENDING_REVIEW') {
      // v7 had it as PENDING — check if it has findings now
      // Re-auto-label with latest scan data
      const { label, confidence, reason } = autoLabel(v8)
      result.push({
        ...v8,
        label,
        label_auto: true,
        label_auto_confidence: confidence,
        label_auto_reason: reason,
      })
      if (label === 'PENDING_REVIEW') pendingReview++
      else autoLabeled++
    } else {
      // New entry — auto-label
      const { label, confidence, reason } = autoLabel(v8)
      result.push({
        ...v8,
        label,
        label_auto: true,
        label_auto_confidence: confidence,
        label_auto_reason: reason,
      })
      if (label === 'PENDING_REVIEW') pendingReview++
      else autoLabeled++
    }
  }

  // ⚠️ Dedup by pr_url before writing — prevent duplicate-inflated dataset
  // Keep entry with highest findings_count per unique PR URL
  const deduped = new Map<string, Entry>()
  let dupRemoved = 0
  for (const e of result) {
    const existing = deduped.get(e.pr_url)
    if (!existing) {
      deduped.set(e.pr_url, e)
    } else if ((e.findings_count || 0) > (existing.findings_count || 0)) {
      deduped.set(e.pr_url, e)
      dupRemoved++
    } else {
      dupRemoved++
    }
  }
  const dedupedResult = Array.from(deduped.values())
  console.log(`  🗑️ Dedup: ${result.length} → ${dedupedResult.length} (${dupRemoved} duplicates removed)`)

  // Write full dataset (deduped)
  fs.writeFileSync(outputFile, dedupedResult.map(r => JSON.stringify(r)).join('\n'), 'utf-8')
  console.log(`✅ Written ${dedupedResult.length} entries to ${path.basename(outputFile)}`)

  // Extract manual-only subset (label_auto=false, exclude AMBIGUOUS), already deduped
  const manualOnly = dedupedResult.filter(e =>
    e.label_auto === false &&
    e.label !== 'AMBIGUOUS'
  )
  fs.writeFileSync(manualOnlyFile, manualOnly.map(r => JSON.stringify(r)).join('\n'), 'utf-8')
  console.log(`✅ Written ${manualOnly.length} manual-only entries to ${path.basename(manualOnlyFile)}`)

  // Stats — computed from DEDUPED data (matches written file)
  const dDec = dedupedResult.filter(e => e.label === 'CONFIRMED_DECEPTIVE').length
  const dLegit = dedupedResult.filter(e => e.label === 'CONFIRMED_LEGIT').length
  const dAmb = dedupedResult.filter(e => e.label === 'AMBIGUOUS').length
  const dManualDec = dedupedResult.filter(e => e.label === 'CONFIRMED_DECEPTIVE' && e.label_auto === false).length
  const dManualLegit = dedupedResult.filter(e => e.label === 'CONFIRMED_LEGIT' && e.label_auto === false).length
  const dAutoLegit = dedupedResult.filter(e => e.label === 'CONFIRMED_LEGIT' && e.label_auto === true).length
  const dPendingCount = dedupedResult.filter(e => e.label === 'PENDING_REVIEW').length

  console.log('\n═══ Dataset Distribution (DEDUPED — matches written file) ═══')
  console.log(`  ${'Manual DECEPTIVE:'.padEnd(25)} ${dManualDec}`)
  console.log(`  ${'Manual LEGIT:'.padEnd(25)} ${dManualLegit}`)
  console.log(`  ${'Auto-labeled LEGIT:'.padEnd(25)} ${dAutoLegit}`)
  console.log(`  ${'PENDING REVIEW:'.padEnd(25)} ${dPendingCount}`)
  console.log(`  ${'AMBIGUOUS (excluded):'.padEnd(25)} ${dAmb}`)
  console.log(`  ${'TOTAL (deduped):'.padEnd(25)} ${dedupedResult.length}`)
  console.log(`  ${'Pre-dedup total:'.padEnd(25)} ${result.length} (${result.length - dedupedResult.length} duplicates removed)`)
  console.log(`  Demographics: ${dDec} DECEPTIVE, ${dLegit} LEGIT, ${dAmb} AMB, ${dPendingCount} PENDING`)
  console.log(`  Source: ${manualPreserved} manual preserved + ${autoLabeled} auto-labeled + ${pendingReview} pending`)
}

try {
  main()
} catch (err) {
  console.error('❌ Fatal:', err)
  process.exit(1)
}
