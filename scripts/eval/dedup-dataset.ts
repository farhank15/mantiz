#!/usr/bin/env tsx
/**
 * Deduplicate labeled dataset by pr_url.
 *
 * Masalah: dataset saat ini punya multiple entries untuk PR yang sama
 * (dari scraping berbeda). Ini bikin confusion matrix bias.
 *
 * Strategy: keep 1 entry per unique pr_url — pilih yang punya
 * findings_count terbanyak (most comprehensive scan).
 *
 * Usage:
 *   npx tsx scripts/eval/dedup-dataset.ts --input labeled_v8_manual_only.jsonl
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

interface Entry {
  id: string
  repo: string
  pr_url: string
  source: string
  label?: string
  label_auto?: boolean
  trustScore: number
  findings_count: number
  findings_by_detector: Record<string, number>
  pr_title?: string
  pr_author?: string
  [key: string]: unknown
}

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

function main() {
  const opts = parseArgs()
  const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
  const inputFile = opts.inputFile ? path.resolve(opts.inputFile) : path.join(EVAL_DIR, 'labeled_v8_manual_only.jsonl')
  const outputFile = opts.outputFile ? path.resolve(opts.outputFile) : inputFile.replace('.jsonl', '_deduped.jsonl')

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input not found: ${inputFile}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(inputFile, 'utf-8')
  const entries: Entry[] = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))

  console.log(`📦 Loaded ${entries.length} entries`)

  // Count sources before dedup
  const sourceBefore = new Map<string, number>()
  for (const e of entries) {
    const s = e.source || 'unknown'
    sourceBefore.set(s, (sourceBefore.get(s) || 0) + 1)
  }

  // Dedup by pr_url — keep entry with highest findings_count
  const deduped = new Map<string, Entry>()
  const dupCounts = new Map<string, number>()

  for (const e of entries) {
    const url = e.pr_url
    const existing = deduped.get(url)
    dupCounts.set(url, (dupCounts.get(url) || 0) + 1)

    if (!existing) {
      deduped.set(url, e)
    } else if ((e.findings_count || 0) > (existing.findings_count || 0)) {
      deduped.set(url, e)
    }
    // else: keep existing (already has more or equal findings)
  }

  const result = Array.from(deduped.values())

  // Stats
  const dec = result.filter(e => e.label === 'CONFIRMED_DECEPTIVE').length
  const legit = result.filter(e => e.label === 'CONFIRMED_LEGIT').length
  const amb = result.filter(e => e.label === 'AMBIGUOUS').length
  const pending = result.filter(e => e.label === 'PENDING_REVIEW').length

  const sourceAfter = new Map<string, number>()
  for (const e of result) {
    const s = e.source || 'unknown'
    sourceAfter.set(s, (sourceAfter.get(s) || 0) + 1)
  }

  console.log('\n═══ Dedup Results ═══')
  console.log(`  Entries before:  ${entries.length}`)
  console.log(`  Entries after:   ${result.length}`)
  console.log(`  Removed:         ${entries.length - result.length} duplicates`)
  console.log(`  Unique PR URLs:  ${deduped.size}`)

  console.log('\n📊 Dataset Distribution (Deduped):')
  console.log(`  DECEPTIVE: ${dec}`)
  console.log(`  LEGIT:     ${legit}`)
  console.log(`  AMBIGUOUS: ${amb}`)
  console.log(`  PENDING:   ${pending}`)
  console.log(`  TOTAL:     ${result.length}`)

  console.log('\n📊 Source Distribution Before → After:')
  for (const [src, before] of sourceBefore) {
    const after = sourceAfter.get(src) || 0
    const pct = result.length > 0 ? (after / result.length * 100).toFixed(1) : '0'
    console.log(`  ${src.padEnd(35)} ${String(before).padStart(4)} → ${String(after).padStart(4)} (${pct}%)`)
  }

  // Write
  fs.writeFileSync(outputFile, result.map(r => JSON.stringify(r)).join('\n'), 'utf-8')
  console.log(`\n✅ Written ${result.length} deduped entries to ${path.basename(outputFile)}`)

  // Also show duplicate distribution
  const dupDistribution = new Map<number, number>()
  for (const count of dupCounts.values()) {
    dupDistribution.set(count, (dupDistribution.get(count) || 0) + 1)
  }
  console.log('\n📊 Duplicate Distribution (how many PRs appear N times):')
  // Sort by count descending
  const sorted = [...dupDistribution.entries()].sort((a, b) => b[0] - a[0])
  for (const [count, numPrs] of sorted) {
    if (count > 1) {
      console.log(`  ${numPrs} PRs appear ${count}x`)
    }
  }
}

try {
  main()
} catch (err) {
  console.error('❌ Fatal:', err)
  process.exit(1)
}
