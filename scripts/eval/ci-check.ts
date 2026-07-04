#!/usr/bin/env tsx
/**
 * Mantiz CI Check — Detector Performance Gate
 *
 * Runs confusion matrix on latest labeled data, compares precision/recall
 * against baseline from calibration-v1.json. Fails CI if any detector drops
 * more than the threshold (default: 5 points absolute).
 *
 * Usage:
 *   npx tsx scripts/eval/ci-check.ts                          # check against baseline
 *   npx tsx scripts/eval/ci-check.ts --threshold 10           # custom threshold
 *   npx tsx scripts/eval/ci-check.ts --baseline weights.json  # custom baseline
 *   npx tsx scripts/eval/ci-check.ts --update                 # update baseline to current
 *   npx tsx scripts/eval/ci-check.ts --json                   # JSON output for CI
 *
 * Exit codes:
 *   0 — all detectors within threshold
 *   1 — one or more detectors dropped below threshold
 *   2 — fatal error (file not found, etc)
 *
 * Environment variables:
 *   CI=true — enables JSON output mode automatically
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

interface DetectorBaseline {
  detector: string
  precision: number
  recall: number
  f1: number
}

interface CalibrationData {
  deceptive_count: number
  legit_count: number
  detectors: DetectorBaseline[]
}

interface Entry {
  id: string
  label: string
  findings_by_detector: Record<string, number>
  [key: string]: unknown
}

interface ConfusionMatrix { tp: number; fp: number; tn: number; fn: number }

interface CurrentMetrics {
  detector: string
  precision: number
  recall: number
  f1: number
  tp: number; fp: number; tn: number; fn: number
}

interface ComparisonResult {
  detector: string
  baselinePrecision: number
  currentPrecision: number
  precisionDiff: number
  baselineRecall: number
  currentRecall: number
  recallDiff: number
  baselineF1: number
  currentF1: number
  f1Diff: number
  status: 'ok' | 'warn' | 'fail'
  message: string
}

// ─── Constants ──────────────────────────────────────────────────────

const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
const DEFAULT_BASELINE = path.join(EVAL_DIR, 'reports', 'calibration-v1.json')
const DEFAULT_LABELED = path.join(EVAL_DIR, 'labeled_v10_manual_only.jsonl')
const DEFAULT_THRESHOLD = 5  // absolute percentage points
// Derived from baseline data — add new detectors there, not here.
let ALL_DETECTORS: string[] = []

// ─── CLI ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let baselineFile = DEFAULT_BASELINE
  let labeledFile = DEFAULT_LABELED
  let threshold = DEFAULT_THRESHOLD
  let updateBaseline = false
  let jsonOutput = process.env.CI === 'true'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseline' && i + 1 < args.length) baselineFile = args[++i]
    else if (args[i] === '--labeled' && i + 1 < args.length) labeledFile = args[++i]
    else if (args[i] === '--threshold' && i + 1 < args.length) threshold = parseInt(args[++i], 10)
    else if (args[i] === '--update') updateBaseline = true
    else if (args[i] === '--json') jsonOutput = true
  }

  return { baselineFile, labeledFile, threshold, updateBaseline, jsonOutput }
}

// ─── Confusion Matrix ──────────────────────────────────────────────

function calcMatrix(entries: Entry[], detector: string): ConfusionMatrix {
  const m: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 }
  for (const e of entries) {
    if (e.label !== 'CONFIRMED_DECEPTIVE' && e.label !== 'CONFIRMED_LEGIT') continue
    const isDeceptive = e.label === 'CONFIRMED_DECEPTIVE'
    const flagged = (e.findings_by_detector[detector] || 0) > 0
    if (flagged && isDeceptive) m.tp++
    else if (flagged && !isDeceptive) m.fp++
    else if (!flagged && !isDeceptive) m.tn++
    else if (!flagged && isDeceptive) m.fn++
  }
  return m
}

function calcMetrics(m: ConfusionMatrix) {
  const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0
  const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  return {
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1: Math.round(f1 * 1000) / 10,
  }
}

// ─── Comparison ─────────────────────────────────────────────────────

function compare(
  baseline: DetectorBaseline,
  current: CurrentMetrics,
  threshold: number,
): ComparisonResult {
  const precDiff = Math.round((current.precision - baseline.precision) * 10) / 10
  const recDiff = Math.round((current.recall - baseline.recall) * 10) / 10
  const f1Diff = Math.round((current.f1 - baseline.f1) * 10) / 10

  let status: 'ok' | 'warn' | 'fail'
  let message: string

  // Rule: fail if precision OR recall drops MORE than threshold
  // Warn if drops within threshold but significant
  if (precDiff < -threshold || recDiff < -threshold) {
    status = 'fail'
    const reasons: string[] = []
    if (precDiff < -threshold) reasons.push(`precision -${Math.abs(precDiff).toFixed(1)}pts`)
    if (recDiff < -threshold) reasons.push(`recall -${Math.abs(recDiff).toFixed(1)}pts`)
    message = `❌ FAIL: ${reasons.join(', ')} (threshold: ${threshold}pts)`
  } else if (precDiff < 0 || recDiff < 0) {
    status = 'warn'
    message = `⚠️  WARN: precision ${precDiff >= 0 ? '+' : ''}${precDiff.toFixed(1)}pts, recall ${recDiff >= 0 ? '+' : ''}${recDiff.toFixed(1)}pts`
  } else {
    status = 'ok'
    message = `✅ OK: precision +${precDiff.toFixed(1)}pts, recall +${recDiff.toFixed(1)}pts`
  }

  return {
    detector: baseline.detector,
    baselinePrecision: baseline.precision,
    currentPrecision: current.precision,
    precisionDiff: precDiff,
    baselineRecall: baseline.recall,
    currentRecall: current.recall,
    recallDiff: recDiff,
    baselineF1: baseline.f1,
    currentF1: current.f1,
    f1Diff,
    status,
    message,
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()

  // 1. Load baseline
  if (!fs.existsSync(opts.baselineFile)) {
    console.error(`❌ Baseline not found: ${opts.baselineFile}`)
    console.error('   Run: npx tsx scripts/eval/calibrate-weights.ts --output eval/ground-truth/reports/calibration-v1.json')
    process.exit(2)
  }
  const baseline: CalibrationData = JSON.parse(fs.readFileSync(opts.baselineFile, 'utf-8'))
  const baselineMap = new Map(baseline.detectors.map(d => [d.detector, d]))
  ALL_DETECTORS = baseline.detectors.map(d => d.detector)

  // 2. Load current labeled data (with fallback)
  if (!fs.existsSync(opts.labeledFile)) {
    const altFile = opts.labeledFile.replace('_manual_only', '').replace('_deduped', '')
    if (altFile !== opts.labeledFile && fs.existsSync(altFile)) {
      console.warn(`⚠️  ${path.basename(opts.labeledFile)} not found — falling back to ${path.basename(altFile)}`)
      opts.labeledFile = altFile
    } else {
      console.error(`❌ Labeled data not found: ${opts.labeledFile}`)
      console.error('   Required for CI calibration check. Run calibration first:')
      console.error('   npx tsx scripts/eval/calibrate-standalone.ts')
      process.exit(2)
    }
  }
  const raw = fs.readFileSync(opts.labeledFile, 'utf-8')
  const entries: Entry[] = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
  const labeled = entries.filter(e => e.label !== 'AMBIGUOUS' && e.label !== 'PENDING_REVIEW')
  const deceptive = labeled.filter(e => e.label === 'CONFIRMED_DECEPTIVE').length
  const legit = labeled.filter(e => e.label === 'CONFIRMED_LEGIT').length

  // 3. Calculate current metrics
  const currentMetrics: CurrentMetrics[] = []
  for (const detector of ALL_DETECTORS) {
    const m = calcMatrix(labeled, detector)
    const met = calcMetrics(m)
    currentMetrics.push({ detector, ...met, ...m })
  }

  // 4. Compare
  const results: ComparisonResult[] = []
  for (const current of currentMetrics) {
    const bl = baselineMap.get(current.detector)
    if (!bl) {
      results.push({
        detector: current.detector,
        baselinePrecision: 0, currentPrecision: current.precision, precisionDiff: current.precision,
        baselineRecall: 0, currentRecall: current.recall, recallDiff: current.recall,
        baselineF1: 0, currentF1: current.f1, f1Diff: current.f1,
        status: 'warn',
        message: `⚠️  No baseline for ${current.detector} — new detector?`,
      })
      continue
    }
    results.push(compare(bl, current, opts.threshold))
  }

  // 5. Output
  const failed = results.filter(r => r.status === 'fail')
  const warned = results.filter(r => r.status === 'warn')
  const passed = results.filter(r => r.status === 'ok')

  if (opts.jsonOutput) {
    // JSON output for CI
    const output = {
      summary: {
        total: results.length,
        passed: passed.length,
        warned: warned.length,
        failed: failed.length,
        threshold: opts.threshold,
        sampleSize: { deceptive, legit, total: deceptive + legit },
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
      detectors: results,
      note: 'PRELIMINARY — N < 100 DECEPTIVE. Threshold gaps may be noise.',
    }
    console.log(JSON.stringify(output, null, 2))
  } else {
    // Human-readable output
    console.log('\n═══ Mantiz CI Check ═══')
    console.log(`  Baseline:     ${path.basename(opts.baselineFile)} (${baseline.deceptive_count} DEC, ${baseline.legit_count} LEGIT)`)
    console.log(`  Current:      ${path.basename(opts.labeledFile)} (${deceptive} DEC, ${legit} LEGIT)`)
    console.log(`  Threshold:    ${opts.threshold} points absolute`)
    console.log(`  Sample note:  PRELIMINARY — N=${deceptive} DECEPTIVE < 100\n`)

    const header = `${'Detector'.padEnd(24)} ${'Prec'.padStart(6)} ${'Diff'.padStart(7)}  ${'Rec'.padStart(6)} ${'Diff'.padStart(7)}  Status`
    console.log(header)
    console.log('─'.repeat(header.length))

    for (const r of results) {
      const statusIcon = r.status === 'fail' ? '❌' : r.status === 'warn' ? '⚠️' : '✅'
      const precStr = `${r.currentPrecision.toFixed(1)}%`.padStart(6)
      const precDiffStr = `${r.precisionDiff >= 0 ? '+' : ''}${r.precisionDiff.toFixed(1)}`.padStart(7)
      const recStr = `${r.currentRecall.toFixed(1)}%`.padStart(6)
      const recDiffStr = `${r.recallDiff >= 0 ? '+' : ''}${r.recallDiff.toFixed(1)}`.padStart(7)
      console.log(`${statusIcon} ${r.detector.padEnd(22)} ${precStr} ${precDiffStr}  ${recStr} ${recDiffStr}  ${r.message.slice(0, 40)}`)
    }

    console.log(`\n─── Summary ───`)
    console.log(`  ✅ Passed: ${passed.length}`)
    console.log(`  ⚠️  Warned: ${warned.length}`)
    if (warned.length > 0) {
      console.log('  📝 Warning detectors:')
      for (const w of warned) {
        console.log(`     ${w.detector}: ${w.message}`)
      }
    }
    console.log(`  ❌ Failed: ${failed.length}`)
    if (failed.length > 0) {
      console.log('  🚨 FAILED DETECTORS (exceeded threshold):')
      for (const f of failed) {
        console.log(`     ${f.detector}: ${f.message}`)
      }
    }

    if (failed.length === 0) {
      console.log(`\n✅ CI CHECK PASSED — all detectors within ${opts.threshold}pt threshold.`)
    } else {
      console.log(`\n❌ CI CHECK FAILED — ${failed.length} detector(s) dropped below threshold.`)
    }
  }

  // 6. Optionally update baseline (runs BEFORE exit so --update can fix baseline)
  if (opts.updateBaseline) {
    const newBaseline: CalibrationData = {
      deceptive_count: deceptive,
      legit_count: legit,
      detectors: currentMetrics.map(m => ({
        detector: m.detector,
        precision: m.precision,
        recall: m.recall,
        f1: m.f1,
      })),
    }
    fs.writeFileSync(opts.baselineFile, JSON.stringify(newBaseline, null, 2), 'utf-8')
    if (!opts.jsonOutput) {
      console.log(`\n📝 Baseline updated: ${opts.baselineFile}`)
    }
  }

  // 7. Exit with error AFTER --update has run (both JSON and human-readable modes)
  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(2)
})
