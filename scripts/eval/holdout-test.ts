#!/usr/bin/env tsx
/**
 * Mantiz Holdout Test (Fase 5)
 *
 * Splits labeled data into training (70%) and holdout (30%) by REPO
 * to prevent data leakage. Runs confusion matrix on both sets and
 * compares precision/recall to validate against overfitting.
 *
 * Usage:
 *   npx tsx scripts/eval/holdout-test.ts
 *   npx tsx scripts/eval/holdout-test.ts --input labeled_v5_prelabeled.jsonl
 *   npx tsx scripts/eval/holdout-test.ts --output reports/holdout-v1.md
 *   npx tsx scripts/eval/holdout-test.ts --seed 42     # reproducible split
 *
 * Goal: precision/recall gap < 10 points between train and holdout.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')

interface Entry {
  id: string
  label: string
  repo: string
  trustScore: number
  verdict: string
  findings_by_detector: Record<string, number>
  [key: string]: unknown
}

interface ConfusionMatrix {
  tp: number; fp: number; tn: number; fn: number
}

interface DetectorResult {
  detector: string
  precision: number
  recall: number
  f1: number
  tp: number; fp: number; tn: number; fn: number
}

const ALL_DETECTORS = [
  'D1_DisabledAssertion', 'D2_AssertionTampering', 'D3_MockToAvoid',
  'D4_ClaimDiffMismatch', 'D5_SilentCatch', 'D6_HallucinatedAssertion',
  'D10_MutationSusceptibility',
]

function parseArgs() {
  const args = process.argv.slice(2)
  let inputFile = ''
  let outputFile = ''
  let seed = 42
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) inputFile = args[++i]
    else if (args[i] === '--output' && i + 1 < args.length) outputFile = args[++i]
    else if (args[i] === '--seed' && i + 1 < args.length) seed = parseInt(args[++i], 10)
  }
  return { inputFile, outputFile, seed }
}

// Seeded random (mulberry32)
function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleArray<T>(arr: T[], rand: () => number): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function calcConfusionMatrix(entries: Entry[], detector: string): ConfusionMatrix {
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

function calcMetrics(m: ConfusionMatrix): { precision: number; recall: number; f1: number } {
  const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0
  const recall = m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0
  return {
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1: Math.round(f1 * 1000) / 10,
  }
}

function calcVerdictAccuracy(entries: Entry[]): number {
  let correct = 0, total = 0
  for (const e of entries) {
    if (e.label === 'AMBIGUOUS') continue
    total++
    const isDeceptive = e.label === 'CONFIRMED_DECEPTIVE'
    const isSuspicious = e.verdict === 'LIKELY_DECEPTIVE' || e.verdict === 'SUSPICIOUS'
    if ((isDeceptive && isSuspicious) || (!isDeceptive && !isSuspicious)) correct++
  }
  return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
}

async function main() {
  const opts = parseArgs()
  const inputPath = opts.inputFile ? path.resolve(opts.inputFile) : path.join(EVAL_DIR, 'labeled_v5_prelabeled.jsonl')

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input not found: ${inputPath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(inputPath, 'utf-8')
  const entries: Entry[] = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))

  // Group by repo
  const repoMap = new Map<string, Entry[]>()
  for (const e of entries) {
    if (e.label === 'AMBIGUOUS' || e.label === 'PENDING_REVIEW') continue
    const repo = e.repo || 'unknown'
    if (!repoMap.has(repo)) repoMap.set(repo, [])
    repoMap.get(repo)!.push(e)
  }

  // Split repos: 70% train, 30% holdout
  const rand = mulberry32(opts.seed)
  const repos = shuffleArray(Array.from(repoMap.keys()), rand)
  const splitIdx = Math.ceil(repos.length * 0.7)
  const trainRepos = new Set(repos.slice(0, splitIdx))
  const holdoutRepos = new Set(repos.slice(splitIdx))

  const train: Entry[] = []
  const holdout: Entry[] = []

  for (const [repo, repoEntries] of repoMap) {
    if (trainRepos.has(repo)) train.push(...repoEntries)
    else holdout.push(...repoEntries)
  }

  const trainDeceptive = train.filter(e => e.label === 'CONFIRMED_DECEPTIVE').length
  const trainLegit = train.filter(e => e.label === 'CONFIRMED_LEGIT').length
  const holdDeceptive = holdout.filter(e => e.label === 'CONFIRMED_DECEPTIVE').length
  const holdLegit = holdout.filter(e => e.label === 'CONFIRMED_LEGIT').length

  console.log('═══ Holdout Test ═══')
  console.log(`  Seed: ${opts.seed}`)
  console.log(`  Repos: ${repos.length} total, ${trainRepos.size} train, ${holdoutRepos.size} holdout`)
  console.log(`  Train: ${train.length} entries (${trainDeceptive} DECEPTIVE, ${trainLegit} LEGIT)`)
  console.log(`  Holdout: ${holdout.length} entries (${holdDeceptive} DECEPTIVE, ${holdLegit} LEGIT)`)

  // Verdict accuracy
  const trainAcc = calcVerdictAccuracy(train)
  const holdAcc = calcVerdictAccuracy(holdout)
  const verdictGap = Math.abs(trainAcc - holdAcc)
  console.log(`\n📊 Verdict Accuracy:`)
  console.log(`  Train:   ${trainAcc.toFixed(1)}%`)
  console.log(`  Holdout: ${holdAcc.toFixed(1)}%`)
  console.log(`  Gap:     ${verdictGap.toFixed(1)}% ${verdictGap <= 10 ? '✅' : '❌'}`)

  // Per-detector comparison
  console.log(`\n📊 Per-Detector Precision/Recall:`)
  const header = `${'Detector'.padEnd(24)} ${'Train Prec'.padStart(10)} ${'Hold Prec'.padStart(10)} ${'Gap'.padStart(6)}  ${'Train Rec'.padStart(10)} ${'Hold Rec'.padStart(10)} ${'Gap'.padStart(6)}  Status`
  console.log(header)
  console.log('─'.repeat(90))

  const results: Array<{ detector: string; train: DetectorResult; holdout: DetectorResult }> = []

  for (const detector of ALL_DETECTORS) {
    const trainM = calcConfusionMatrix(train, detector)
    const holdM = calcConfusionMatrix(holdout, detector)
    const trainMet = calcMetrics(trainM)
    const holdMet = calcMetrics(holdM)

    const precGap = Math.abs(trainMet.precision - holdMet.precision)
    const recGap = Math.abs(trainMet.recall - holdMet.recall)
    const status = precGap <= 15 && recGap <= 20 ? '✅' : '⚠️'

    console.log(
      `${detector.padEnd(24)} ${trainMet.precision.toFixed(1).padStart(8)}% ${holdMet.precision.toFixed(1).padStart(8)}% ${precGap.toFixed(1).padStart(4)}%  ` +
      `${trainMet.recall.toFixed(1).padStart(8)}% ${holdMet.recall.toFixed(1).padStart(8)}% ${recGap.toFixed(1).padStart(4)}%  ${status}`
    )

    results.push({
      detector,
      train: { detector, ...trainM, ...trainMet },
      holdout: { detector, ...holdM, ...holdMet },
    })
  }

  // Summary
  const failedDetectors = results.filter(r => {
    const precGap = Math.abs(r.train.precision - r.holdout.precision)
    const recGap = Math.abs(r.train.recall - r.holdout.recall)
    return precGap > 15 || recGap > 20
  })

  console.log(`\n─── Summary ───`)
  if (verdictGap <= 10 && failedDetectors.length === 0) {
    console.log('✅ Holdout PASSED — precision/recall konsisten. Sistem generalisasi baik.')
  } else if (verdictGap <= 10) {
    console.log(`⚠️  Holdout PASSED (verdict), tapi ${failedDetectors.length} detector(s) punya gap besar:`)
    for (const d of failedDetectors) {
      const precGap = Math.abs(d.train.precision - d.holdout.precision)
      const recGap = Math.abs(d.train.recall - d.holdout.recall)
      console.log(`  - ${d.detector}: precision gap ${precGap.toFixed(1)}%, recall gap ${recGap.toFixed(1)}%`)
    }
  } else {
    console.log(`❌ Holdout FAILED — verdict gap ${verdictGap.toFixed(1)}% > 10%. Sistem mungkin overfit.`)
  }

  console.log(`  ⚠️  PRELIMINARY — Holdout cuma ${holdDeceptive} DECEPTIVE. Gap wajar karena sample kecil.`)

  // Save report
  if (opts.outputFile) {
    const outPath = path.resolve(opts.outputFile)
    const dir = path.dirname(outPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify({
      seed: opts.seed,
      train: { entries: train.length, deceptive: trainDeceptive, legit: trainLegit, accuracy: trainAcc },
      holdout: { entries: holdout.length, deceptive: holdDeceptive, legit: holdLegit, accuracy: holdAcc },
      verdictGap,
      detectors: results,
      passed: verdictGap <= 10 && failedDetectors.length === 0,
      note: 'PRELIMINARY — N_DECEPTIVE small, confidence intervals wide',
    }, null, 2), 'utf-8')
    console.log(`\n✅ Report saved to ${outPath}`)
  }
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1) })
