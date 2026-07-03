#!/usr/bin/env tsx
/**
 * Mantiz Ground Truth — Confusion Matrix
 *
 * Computes precision, recall, and F1 per detector by comparing
 * scan results against human-labeled ground truth.
 *
 * Usage:
 *   npx tsx scripts/eval/confusion-matrix.ts                              # uses labeled_v1.jsonl
 *   npx tsx scripts/eval/confusion-matrix.ts --input labeled_v1.jsonl     # explicit input
 *   npx tsx scripts/eval/confusion-matrix.ts --output reports/v1.md       # write report to file
 *   npx tsx scripts/eval/confusion-matrix.ts --detailed                   # show per-fixture breakdown
 *
 * Input format: labeled_v1.jsonl (see schema.json for field definitions)
 * Each entry must have:
 *   - label: "CONFIRMED_DECEPTIVE" | "CONFIRMED_LEGIT" | "AMBIGUOUS"
 *   - findings_by_detector: Record<detector_name, count>
 *   - trustScore: number
 *
 * Output: Confusion matrix per detector + overall stats
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────

interface LabeledEntry {
  id: string
  label: string
  source: string
  repo: string
  pr_url: string
  pr_title: string
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
  [key: string]: unknown
}

interface ConfusionMatrix {
  tp: number // True Positive — flagged as cheating, labeled DECEPTIVE
  fp: number // False Positive — flagged as cheating, labeled LEGIT
  tn: number // True Negative — not flagged, labeled LEGIT
  fn: number // False Negative — not flagged, labeled DECEPTIVE
}

interface DetectorMetrics {
  detector: string
  precision: number
  recall: number
  f1: number
  support: { deceptive: number; legit: number }
  matrix: ConfusionMatrix
}

interface OverallMetrics {
  total_entries: number
  deceptive_count: number
  legit_count: number
  ambiguous_excluded: number
  detectors: DetectorMetrics[]
  verdict_accuracy: number
}

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let inputFile = ''
  let outputFile = ''
  let detailed = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) inputFile = args[++i]
    else if (args[i] === '--output' && i + 1 < args.length) outputFile = args[++i]
    else if (args[i] === '--detailed') detailed = true
  }

  return { inputFile, outputFile, detailed }
}

// ─── All detector names ──────────────────────────────────────────────

const ALL_DETECTORS = [
  'D1_DisabledAssertion',
  'D2_AssertionTampering',
  'D3_MockToAvoid',
  'D4_ClaimDiffMismatch',
  'D5_SilentCatch',
  'D6_HallucinatedAssertion',
  'D8_AIAssisted',
  'D9_Historical',
  'D10_MutationSusceptibility',
  // Note: D7a (AST) and D7b (Tree-sitter) reuse patternTypes from D1/D2/D5 —
  // their findings are captured under those detectors. Remove D7a/D7b from
  // ALL_DETECTORS to avoid always-0 rows in confusion matrix.
]

// ─── Metrics Calculator ──────────────────────────────────────────────

function calcConfusionMatrix(
  entries: LabeledEntry[],
  detector: string,
): ConfusionMatrix {
  const matrix: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 }

  for (const entry of entries) {
    const isDeceptive = entry.label === 'CONFIRMED_DECEPTIVE'
    const isLegit = entry.label === 'CONFIRMED_LEGIT'

    if (!isDeceptive && !isLegit) continue // Skip AMBIGUOUS

    // Check if this detector flagged the entry
    const detectorCount = entry.findings_by_detector[detector] || 0
    const flagged = detectorCount > 0

    if (flagged && isDeceptive) matrix.tp++
    else if (flagged && isLegit) matrix.fp++
    else if (!flagged && isLegit) matrix.tn++
    else if (!flagged && isDeceptive) matrix.fn++
  }

  return matrix
}

function calcMetrics(matrix: ConfusionMatrix, support: { deceptive: number; legit: number }): Omit<DetectorMetrics, 'detector'> {
  const { tp, fp, fn } = matrix
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0

  return {
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1: Math.round(f1 * 1000) / 10,
    support,
    matrix,
  }
}

function calcVerdictAccuracy(entries: LabeledEntry[]): number {
  let correct = 0
  let total = 0

  for (const entry of entries) {
    if (entry.label === 'AMBIGUOUS') continue
    total++

    const isDeceptive = entry.label === 'CONFIRMED_DECEPTIVE'
    const isSuspicious = entry.verdict === 'LIKELY_DECEPTIVE' || entry.verdict === 'SUSPICIOUS'

    if ((isDeceptive && isSuspicious) || (!isDeceptive && !isSuspicious)) {
      correct++
    }
  }

  return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
}

// ─── Formatting ──────────────────────────────────────────────────────

function pct(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtBar(value: number, width = 20): string {
  const filled = Math.round((value / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

function formatReport(
  overall: OverallMetrics,
  detailed: boolean,
): string {
  const lines: string[] = []

  lines.push('# Mantiz Evaluation Report — Confusion Matrix')
  lines.push('')
  lines.push(`**Generated:** ${new Date().toISOString().slice(0, 10)}`)
  lines.push(`**Total entries:** ${overall.total_entries}`)
  lines.push(`**Labeled:** ${overall.deceptive_count} DECEPTIVE, ${overall.legit_count} LEGIT, ${overall.ambiguous_excluded} AMBIGUOUS (excluded)`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Verdict Accuracy')
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Verdict accuracy | ${pct(overall.verdict_accuracy)} |`)
  lines.push(`| N (non-ambiguous) | ${overall.deceptive_count + overall.legit_count} |`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Per-Detector Confusion Matrix')
  lines.push('')
  lines.push('| Detector | TP | FP | TN | FN | Precision | Recall | F1 | Support (D/L) |')
  lines.push('|----------|:--:|:--:|:--:|:--:|:---------:|:------:|:--:|:--------------:|')

  for (const d of overall.detectors) {
    const { detector, precision, recall, f1, matrix, support } = d
    lines.push(
      `| ${detector} | ${matrix.tp} | ${matrix.fp} | ${matrix.tn} | ${matrix.fn} | ${pct(precision)} | ${pct(recall)} | ${f1.toFixed(1)} | ${support.deceptive}/${support.legit} |`,
    )
  }

  lines.push('')
  lines.push('')
  lines.push('## Visual Comparison')
  lines.push('')
  lines.push('```')
  lines.push(`  ${'Detector'.padEnd(22)} Precision    Recall     F1`)
  lines.push(`  ${''.padEnd(57, '─')}`)

  for (const d of overall.detectors) {
    const pBar = fmtBar(d.precision)
    const rBar = fmtBar(d.recall)
    const fBar = fmtBar(d.f1)
    lines.push(`  ${d.detector.padEnd(22)} ${pBar} ${pct(d.precision).padStart(6)}  ${rBar} ${pct(d.recall).padStart(6)}  ${fBar} ${d.f1.toFixed(1).padStart(5)}`)
  }

  lines.push('```')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Key Takeaways')
  lines.push('')

  // Sort by F1 descending
  const sorted = [...overall.detectors].sort((a, b) => b.f1 - a.f1)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]

  if (best) {
    lines.push(`- 🏆 **Best detector:** ${best.detector} (F1=${best.f1.toFixed(1)}, precision=${pct(best.precision)}, recall=${pct(best.recall)})`)
  }
  if (worst) {
    lines.push(`- ⚠️ **Worst detector:** ${worst.detector} (F1=${worst.f1.toFixed(1)}, precision=${pct(worst.precision)}, recall=${pct(worst.recall)})`)
  }

  const lowPrecision = overall.detectors.filter(d => d.precision < 50)
  const lowRecall = overall.detectors.filter(d => d.recall < 50)

  if (lowPrecision.length > 0) {
    lines.push(`- 🔴 **Low precision (<50%):** ${lowPrecision.map(d => d.detector).join(', ')} — too many false positives`)
  }
  if (lowRecall.length > 0) {
    lines.push(`- 🔴 **Low recall (<50%):** ${lowRecall.map(d => d.detector).join(', ')} — missing too many cheaters`)
  }

  const warning = overall.deceptive_count < 10 || overall.legit_count < 10
  if (warning) {
    lines.push('')
    lines.push('> ⚠️ **PRELIMINARY — Low sample size.** N < 10 per class means confidence intervals are ±20-30%.')
    lines.push('> Do not treat these numbers as final. Aim for N ≥ 100 per class for empirical validation.')
  }

  const totalN = overall.deceptive_count + overall.legit_count
  if (totalN < 50) {
    lines.push('> ⚠️ **PRELIMINARY — Total N < 50.** These results are directional only.')
    lines.push('> See VALIDATION-ROADMAP.md Section 3.3 for sample size guidelines.')
  }

  lines.push('')

  if (detailed) {
    lines.push('---')
    lines.push('')
    lines.push('## Detailed Per-Entry Breakdown')
    lines.push('')
    lines.push('| ID | Repo | Label | Score | Verdict | Findings | Flagged Detectors |')
    lines.push('|:--:|:----|:----:|:-----:|:-------:|:--------:|:-----------------:|')
    // Detailed entries would go here — placeholder for now
    lines.push('')
    lines.push('*(Enable --detailed to see per-entry breakdown)*')
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('_Generated by `scripts/eval/confusion-matrix.ts`_')

  return lines.join('\n')
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
  const inputPath = opts.inputFile
    ? path.resolve(opts.inputFile)
    : path.join(EVAL_DIR, 'labeled_v1.jsonl')

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Labeled data not found: ${inputPath}`)
    console.error('   Run scripts/eval/scan-candidates.ts first, then manually label entries.')
    console.error('   Then run this script.')
    process.exit(1)
  }

  // Read labeled entries
  const raw = fs.readFileSync(inputPath, 'utf-8')
  const entries: LabeledEntry[] = raw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))

  console.log(`📦 Loaded ${entries.length} labeled entries from ${path.basename(inputPath)}`)

  // Separate AMBIGUOUS
  const labeled = entries.filter(e => e.label !== 'AMBIGUOUS')
  const ambiguous = entries.filter(e => e.label === 'AMBIGUOUS')
  const deceptive = labeled.filter(e => e.label === 'CONFIRMED_DECEPTIVE')
  const legit = labeled.filter(e => e.label === 'CONFIRMED_LEGIT')

  console.log(`   ${deceptive.length} DECEPTIVE, ${legit.length} LEGIT, ${ambiguous.length} AMBIGUOUS (excluded)`)

  // Compute metrics for each detector
  const detectorMetrics: DetectorMetrics[] = []

  for (const detector of ALL_DETECTORS) {
    const matrix = calcConfusionMatrix(labeled, detector)
    const support = { deceptive: deceptive.length, legit: legit.length }
    const metrics = calcMetrics(matrix, support)

    detectorMetrics.push({
      detector,
      ...metrics,
    })
  }

  // Verdict accuracy
  const verdictAccuracy = calcVerdictAccuracy(labeled)

  const overall: OverallMetrics = {
    total_entries: entries.length,
    deceptive_count: deceptive.length,
    legit_count: legit.length,
    ambiguous_excluded: ambiguous.length,
    detectors: detectorMetrics,
    verdict_accuracy: verdictAccuracy,
  }

  // Console output
  console.log('\n═══ Confusion Matrix ═══\n')
  console.log(`Verdict Accuracy: ${pct(verdictAccuracy)}\n`)

  const header = `${'Detector'.padEnd(24)} ${'TP'.padStart(3)} ${'FP'.padStart(3)} ${'TN'.padStart(3)} ${'FN'.padStart(3)}  ${'Prec'.padStart(6)} ${'Rec'.padStart(6)} ${'F1'.padStart(5)}`
  console.log(header)
  console.log('─'.repeat(header.length))

  for (const d of detectorMetrics) {
    const { detector, precision, recall, f1, matrix } = d
    const precStr = pct(precision)
    const recStr = pct(recall)
    console.log(`${detector.padEnd(24)} ${String(matrix.tp).padStart(3)} ${String(matrix.fp).padStart(3)} ${String(matrix.tn).padStart(3)} ${String(matrix.fn).padStart(3)}  ${precStr.padStart(6)} ${recStr.padStart(6)} ${f1.toFixed(1).padStart(5)}`)
  }

  // Write report
  if (opts.outputFile) {
    const outputPath = path.resolve(opts.outputFile)
    const reportDir = path.dirname(outputPath)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }
    const report = formatReport(overall, opts.detailed)
    fs.writeFileSync(outputPath, report, 'utf-8')
    console.log(`\n✅ Report saved to ${outputPath}`)
  }

  // Save copy to eval/ground-truth/reports/
  const autoReportPath = path.join(EVAL_DIR, 'reports', `confusion-matrix-${new Date().toISOString().slice(0, 10)}.md`)
  if (!fs.existsSync(path.dirname(autoReportPath))) {
    fs.mkdirSync(path.dirname(autoReportPath), { recursive: true })
  }
  const report = formatReport(overall, opts.detailed)
  fs.writeFileSync(autoReportPath, report, 'utf-8')
  console.log(`✅ Auto-saved to ${autoReportPath}`)
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
