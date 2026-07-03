#!/usr/bin/env tsx
/**
 * Mantiz Weight Calibrator
 *
 * Reads labeled ground truth data, computes confusion matrix,
 * and recommends new penalty values based on detector precision.
 *
 * Formula:
 *   reliability = precision × confidence_factor
 *   where confidence_factor = min(1, N_DECEPTIVE / 50) — lower confidence for small samples
 *
 *   new_high_penalty = max(2, round(20 × reliability))
 *   new_med_penalty  = max(1, round(10 × reliability))
 *   new_low_penalty  = max(0, round(3  × reliability))
 *
 * Usage:
 *   npx tsx scripts/eval/calibrate-weights.ts
 *   npx tsx scripts/eval/calibrate-weights.ts --input labeled_v5_prelabeled.jsonl
 *   npx tsx scripts/eval/calibrate-weights.ts --apply        # also update engine.ts
 *   npx tsx scripts/eval/calibrate-weights.ts --output weights.json
 *
 * ⚠️ PRELIMINARY: N=27 DECEPTIVE masih < 100. Hasil ini adalah preliminary estimate,
 *    bukan angka final. Confidence interval precision ±15-25%.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────

interface LabeledEntry {
  id: string
  label: string
  trustScore: number
  verdict: string
  findings_count: number
  findings_by_detector: Record<string, number>
  findings_by_confidence: { high: number; medium: number; low: number }
  [key: string]: unknown
}

interface ConfusionMatrix {
  tp: number
  fp: number
  tn: number
  fn: number
}

interface DetectorStats {
  detector: string
  precision: number
  recall: number
  f1: number
  tp: number
  fp: number
  tn: number
  fn: number
  nDeceptive: number
  nLegit: number
}

interface WeightRecommendation {
  detector: string
  precision: number
  recall: number
  f1: number
  sampleSize: number
  reliability: number
  currentHigh: number
  currentMed: number
  currentLow: number
  recommendedHigh: number
  recommendedMed: number
  recommendedLow: number
  tp: number
  fn: number
  note: string
}

// ─── All detector names ──────────────────────────────────────────────

const ALL_DETECTORS = [
  'D1_DisabledAssertion',
  'D2_AssertionTampering',
  'D3_MockToAvoid',
  'D4_ClaimDiffMismatch',
  'D5_SilentCatch',
  'D6_HallucinatedAssertion',
  'D10_MutationSusceptibility',
]

// ─── Current penalty defaults ────────────────────────────────────────

const CURRENT_PENALTIES = {
  high: 20,
  medium: 10,
  low: 3,
}

// ─── CLI ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let inputFile = ''
  let outputFile = ''
  let doApply = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) inputFile = args[++i]
    else if (args[i] === '--output' && i + 1 < args.length) outputFile = args[++i]
    else if (args[i] === '--apply') doApply = true
  }

  return { inputFile, outputFile, doApply }
}

// ─── Confusion Matrix Calculator ────────────────────────────────────

function calcConfusionMatrix(entries: LabeledEntry[], detector: string): ConfusionMatrix {
  const matrix: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 }

  for (const entry of entries) {
    const label = entry.label
    if (label !== 'CONFIRMED_DECEPTIVE' && label !== 'CONFIRMED_LEGIT') continue

    const isDeceptive = label === 'CONFIRMED_DECEPTIVE'
    const flagged = (entry.findings_by_detector[detector] || 0) > 0

    if (flagged && isDeceptive) matrix.tp++
    else if (flagged && !isDeceptive) matrix.fp++
    else if (!flagged && !isDeceptive) matrix.tn++
    else if (!flagged && isDeceptive) matrix.fn++
  }

  return matrix
}

// ─── Weight Recommendation ───────────────────────────────────────────

function recommendWeights(stats: DetectorStats): WeightRecommendation {
  const { detector, precision, recall, f1, tp, fp, tn, fn } = stats
  const nDeceptive = tp + fn
  const nLegit = tn + fp

  // Confidence factor: smaller N = less confidence in precision
  // At N ≥ 50 per class, confidence_factor = 1 (full trust)
  // At N = 10, confidence_factor = 0.2 (very low trust)
  const minClass = Math.min(nDeceptive, nLegit)
  const confidenceFactor = Math.min(1, minClass / 50)

  // Reliability = precision × confidence_factor
  // A detector with 70% precision but only N=10 gets 0.7 × 0.2 = 0.14 reliability
  // A detector with 70% precision at N=50 gets 0.7 × 1 = 0.7 reliability
  const reliability = (precision / 100) * confidenceFactor

  // Calculate recommended penalties
  const recHigh = Math.max(2, Math.round(CURRENT_PENALTIES.high * reliability))
  const recMed  = Math.max(1, Math.round(CURRENT_PENALTIES.medium * reliability))
  const recLow  = Math.max(0, Math.round(CURRENT_PENALTIES.low * reliability))

  // Generate note
  const notes: string[] = []
  if (nDeceptive < 50) notes.push(`PRELIMINARY — N_DECEPTIVE=${nDeceptive} < 50`)
  if (precision < 30) notes.push(`Low precision (${precision.toFixed(1)}%) — consider fixing detector logic`)
  if (recall < 20) notes.push(`Low recall (${recall.toFixed(1)}%) — missing most cheaters`)
  if (precision >= 80 && recall >= 80) notes.push(`Excellent performance — max weight justified`)
  if (doubleCheck(tp, fp, tn, fn)) notes.push(`All-or-nothing pattern — check if detector is actually working`)

  return {
    detector,
    precision,
    recall,
    f1,
    sampleSize: nDeceptive + nLegit,
    reliability: Math.round(reliability * 1000) / 1000,
    currentHigh: CURRENT_PENALTIES.high,
    currentMed: CURRENT_PENALTIES.medium,
    currentLow: CURRENT_PENALTIES.low,
    recommendedHigh: recHigh,
    recommendedMed: recMed,
    recommendedLow: recLow,
    tp,
    fn,
    note: notes.join('; ') || 'OK',
  }
}

// ─── Helper: check if detector shows all-or-nothing pattern ───────────

function doubleCheck(tp: number, fp: number, _tn: number, fn: number): boolean {
  // All-or-nothing: detector only fires once or never
  const totalFlags = tp + fp
  if (totalFlags <= 1) return true
  // Or: everything is flagged or nothing is flagged
  if (fp === 0 && fn === 0) return true
  return false
}

// ─── Formatting ──────────────────────────────────────────────────────

function fmtTable(recs: WeightRecommendation[]): string {
  const lines: string[] = []

  lines.push('')
  lines.push('═══ Weight Calibration Results ═══')
  lines.push('')
  lines.push(`${'Detector'.padEnd(24)} ${'Prec'.padStart(5)} ${'Rec'.padStart(5)} ${'F1'.padStart(5)}  ${'N(D/L)'.padStart(9)}  ${'Reliab'.padStart(6)}  ${'Curr H/M/L'.padStart(12)}  ${'→  New H/M/L'.padStart(13)}  Note`)
  lines.push('─'.repeat(130))

  for (const r of recs) {
    const curr = `${r.currentHigh}/${r.currentMed}/${r.currentLow}`
    const next = `${r.recommendedHigh}/${r.recommendedMed}/${r.recommendedLow}`
    const nStr = `${r.sampleSize - (r.tp + r.fn)}/${r.tp + r.fn}`
    const note = r.note.length > 40 ? r.note.slice(0, 38) + '..' : r.note
    lines.push(
      `${r.detector.padEnd(24)} ${r.precision.toFixed(1).padStart(5)} ${r.recall.toFixed(1).padStart(5)} ${r.f1.toFixed(1).padStart(5)}  ${nStr.padStart(9)}  ${(r.reliability * 100).toFixed(1).padStart(5)}%  ${curr.padStart(12)}  → ${next.padStart(11)}  ${note}`,
    )
  }

  lines.push('')
  lines.push('─── Summary ───')
  lines.push('')

  const highRecs = recs.filter(r => r.recommendedHigh >= 15)
  const midRecs = recs.filter(r => r.recommendedHigh >= 8 && r.recommendedHigh < 15)
  const lowRecs = recs.filter(r => r.recommendedHigh < 8 && r.recommendedHigh > 0)
  const zeroRecs = recs.filter(r => r.recommendedHigh <= 0)

  if (highRecs.length > 0) lines.push(`🟢 High weight (H≥15): ${highRecs.map(r => r.detector).join(', ')}`)
  if (midRecs.length > 0) lines.push(`🟡 Medium weight (H=8-14): ${midRecs.map(r => r.detector).join(', ')}`)
  if (lowRecs.length > 0) lines.push(`🟠 Low weight (H=1-7): ${lowRecs.map(r => r.detector).join(', ')}`)
  if (zeroRecs.length > 0) lines.push(`🔴 Zero weight (H=0): ${zeroRecs.map(r => r.detector).join(', ')} — detector broken or no signal`)

  lines.push('')
  lines.push(`⚠️  PRELIMINARY — N=${recs[0]?.sampleSize || 0} entries, N_DECEPTIVE=${recs[0] ? recs[0].tp + recs[0].fn : 0}`)
  lines.push('   Confidence interval precision ±15-25%. Jangan klaim angka final.')
  lines.push('   Target: N ≥ 100 DECEPTIVE untuk validasi empiris.')

  return lines.join('\n')
}

// ─── JSON Output ────────────────────────────────────────────────────

interface CalibrationOutput {
  generated_at: string
  total_entries: number
  deceptive_count: number
  legit_count: number
  confidence_note: string
  detectors: WeightRecommendation[]
  engine_code_snippet: string
}

function generateEngineCode(recs: WeightRecommendation[]): string {
  // Generate the code that should replace CONFIDENCE_PENALTY in engine.ts
  const entries = recs
    .filter(r => r.recommendedHigh > 0 || r.recommendedMed > 0 || r.recommendedLow > 0)
    .map(r => `  '${r.detector}': { high: ${r.recommendedHigh}, medium: ${r.recommendedMed}, low: ${r.recommendedLow} }`)

  return `// Generated by calibrate-weights.ts — PRELIMINARY
// Replace CONFIDENCE_PENALTY with DETECTOR_PENALTIES:
const DETECTOR_PENALTIES: Record<string, Record<string, number>> = {\n${entries.join(',\n')}\n}`
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()
  const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
  const inputPath = opts.inputFile
    ? path.resolve(opts.inputFile)
    : path.join(EVAL_DIR, 'labeled_v5_prelabeled.jsonl')

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Labeled data not found: ${inputPath}`)
    console.error('   Run scripts/eval/auto-label-unlabeled.ts first.')
    process.exit(1)
  }

  const raw = fs.readFileSync(inputPath, 'utf-8')
  const entries: LabeledEntry[] = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))

  const labeled = entries.filter(e => e.label !== 'AMBIGUOUS' && e.label !== 'PENDING_REVIEW')
  const deceptive = labeled.filter(e => e.label === 'CONFIRMED_DECEPTIVE')
  const legit = labeled.filter(e => e.label === 'CONFIRMED_LEGIT')
  const nDeceptive = deceptive.length
  const nLegit = legit.length

  console.log(`📦 Loaded ${entries.length} entries from ${path.basename(inputPath)}`)
  console.log(`   ${nDeceptive} DECEPTIVE, ${nLegit} LEGIT, ${entries.length - labeled.length} excluded (AMBIGUOUS/PENDING)`)

  // Calculate stats per detector
  const stats: DetectorStats[] = []
  for (const detector of ALL_DETECTORS) {
    const matrix = calcConfusionMatrix(labeled, detector)
    const { tp, fp, fn } = matrix
    const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0
    const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0

    stats.push({
      detector,
      precision,
      recall,
      f1,
      tp, fp, tn: matrix.tn, fn: matrix.fn,
      nDeceptive,
      nLegit,
    })
  }

  // Recommend weights
  const recommendations = stats.map(s => recommendWeights(s))

  // Print table
  console.log(fmtTable(recommendations))

  // Save JSON output
  if (opts.outputFile) {
    const engineCode = generateEngineCode(recommendations)
    const output: CalibrationOutput = {
      generated_at: new Date().toISOString(),
      total_entries: entries.length,
      deceptive_count: nDeceptive,
      legit_count: nLegit,
      confidence_note: `PRELIMINARY — N_DECEPTIVE=${nDeceptive} < 100. Confidence interval precision ±15-25%.`,
      detectors: recommendations,
      engine_code_snippet: engineCode,
    }
    const outPath = path.resolve(opts.outputFile)
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')
    console.log(`\n✅ Weight recommendations saved to ${outPath}`)
  }

  // Generate code snippet
  console.log('\n─── Engine Code Snippet ───')
  console.log(generateEngineCode(recommendations))
  console.log('\n─── End Snippet ───')
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
