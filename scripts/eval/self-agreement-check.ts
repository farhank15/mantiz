#!/usr/bin/env tsx
/**
 * Self-Agreement Check — Ukur Konsistensi Labeler
 *
 * Ambil 10% data manual random, tampilkan PR info buat di-relabel manual.
 * Setelah user ngasih label baru, bandingkan dengan label asli, hitung konsistensi.
 *
 * Usage:
 *   npx tsx scripts/eval/self-agreement-check.ts                    # generate sample buat di-review
 *   npx tsx scripts/eval/self-agreement-check.ts --compare output.json  # bandingkan hasil review
 *
 * Langkah-langkah:
 *   1. Jalankan script → dapet 13-14 PR acak dari dataset manual
 *   2. Buka PR-nya di GitHub, baca diff, kasih label (DECEPTIVE / LEGIT / AMBIGUOUS)
 *   3. Simpan hasil label baru di file JSON
 *   4. Jalankan ulang dengan --compare untuk hitung konsistensi
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')

function readJsonl(filePath: string): any[] {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function shuffleArray<T>(arr: T[], seed: number): T[] {
  const rng = seededRandom(seed)
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

async function main() {
  const args = process.argv.slice(2)
  const compareMode = args[0] === '--compare' && args[1]

  if (compareMode) {
    // ── Compare mode ─────────────────────────────────────────────
    const newLabelsPath = path.resolve(args[1])
    if (!fs.existsSync(newLabelsPath)) {
      console.error(`❌ File not found: ${newLabelsPath}`)
      process.exit(1)
    }

    const newLabels = JSON.parse(fs.readFileSync(newLabelsPath, 'utf-8'))
    const entries = readJsonl(path.join(EVAL_DIR, 'labeled_v7_manual_only.jsonl'))
    const entryMap = new Map(entries.filter(e => e.label !== 'AMBIGUOUS').map(e => [e.id, e]))

    let agree = 0
    let disagree = 0
    const details: Array<{ id: string; original: string; newLabel: string; match: boolean }> = []

    for (const nl of newLabels) {
      const original = entryMap.get(nl.id)
      if (!original) {
        console.warn(`⚠️  Entry ${nl.id} not found in v7_manual_only`)
        continue
      }
      const match = original.label === nl.label
      if (match) agree++
      else disagree++
      details.push({ id: nl.id, original: original.label, newLabel: nl.label, match })
    }

    const total = agree + disagree
    const pct = total > 0 ? (agree / total * 100).toFixed(1) : 'N/A'

    console.log(`\n═══ Self-Agreement Check ═══`)
    console.log(`  Total entries re-labeled: ${total}`)
    console.log(`  Agree:  ${agree}`)
    console.log(`  Disagree: ${disagree}`)
    console.log(`  Consistency rate: ${pct}%\n`)

    if (disagree > 0) {
      console.log('❌ Disagreements:')
      for (const d of details.filter(d => !d.match)) {
        console.log(`  ${d.id}: original="${d.original}" → new="${d.newLabel}"`)
      }
      console.log()
    }

    if (parseFloat(pct) >= 90) {
      console.log(`✅ Self-agreement PASSED (≥90%) — label konsisten.`)
    } else {
      console.log(`⚠️  Self-agreement BELOW 90% — mungkin perlu re-check label ambiguity.`)
    }

    process.exit(0)
  }

  // ── Generate sample mode ───────────────────────────────────────

  const entries = readJsonl(path.join(EVAL_DIR, 'labeled_v7_manual_only.jsonl'))
  const labeled = entries.filter(e => e.label !== 'AMBIGUOUS')
  const sampleSize = Math.max(1, Math.ceil(labeled.length * 0.1))

  console.log(`═══ Self-Agreement Check — Sample Generator ═══`)
  console.log(`  Total manual entries: ${labeled.length}`)
  console.log(`  Sample size (10%):   ${sampleSize}\n`)

  const sample = shuffleArray(labeled, 42).slice(0, sampleSize)

  const output = {
    generated_at: new Date().toISOString(),
    seed: 42,
    total_entries: labeled.length,
    sample_size: sampleSize,
    note: 'Buka setiap PR di GitHub, baca diff-nya, kasih label DECEPTIVE/LEGIT/AMBIGUOUS. Simpan hasil di file JSON baru.',
    entries: sample.map(e => ({
      id: e.id,
      pr_url: e.pr_url,
      repo: e.repo,
      pr_title: e.pr_title,
      pr_author: e.pr_author,
      original_label: e.label,
      label: null,  // isi manual
    })),
  }

  const outputPath = path.join(EVAL_DIR, 'reports', 'self-agreement-sample.json')
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`✅ Sample written to: ${outputPath}\n`)

  console.log('📋 PRs to review:')
  for (const entry of output.entries) {
    console.log(`  ${entry.id.padEnd(8)} ${entry.repo.padEnd(35)} ${entry.pr_title.slice(0, 50).padEnd(52)} ${entry.pr_url}`)
  }

  console.log(`\n📝 Langkah-langkah:`)
  console.log(`  1. Buka setiap PR URL di browser`)
  console.log(`  2. Baca diff-nya`)
  console.log(`  3. Kasih label DECEPTIVE / LEGIT / AMBIGUOUS`)
  console.log(`  4. Simpan di file baru (copy self-agreement-sample.json → isi label field)`)
  console.log(`  5. Jalankan: npx tsx scripts/eval/self-agreement-check.ts --compare path/to/your_labels.json`)
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
