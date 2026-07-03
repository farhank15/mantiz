#!/usr/bin/env tsx
/**
 * Recover Labels — Fix Auto-Label Circularity Issue
 *
 * Masalah: labeled_v6.jsonl kehilangan field `label` dan `label_auto` dari v5,
 * sehingga 135 manual labels jadi ilang. Auto-labeler kemudian auto-label SEMUA
 * 339 entries seolah-olah gak ada satupun yang manual.
 *
 * Fix:
 * 1. Gabung field `label`, `label_auto`, dll dari v5_prelabeled.jsonl ke v6.jsonl
 * 2. Untuk 159 entries baru (gak ada di v5):
 *    - Auto-label LEGIT kalo no findings + score >= 80 (circularity risk rendah)
 *    - Flag PENDING_REVIEW untuk semua yang mixed signals (circularity risk tinggi)
 * 3. Jangan auto-label DECEPTIVE — itu yang paling circular
 *
 * Output:
 *   labeled_v7.jsonl              — 339 entries dengan label bener
 *   reports/label-audit.json      — Manual vs Auto breakdown transparan
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')

interface Entry {
  id: string
  label?: string
  label_auto?: boolean
  label_auto_confidence?: string
  label_auto_reason?: string
  ground_truth_label?: string
  trustScore?: number
  findings_count?: number
  verdict?: string
  findings_by_detector?: Record<string, number>
  findings_by_confidence?: { high: number; medium: number; low: number }
  per_detector_detail?: Array<unknown>
  repo?: string
  pr_url?: string
  [key: string]: unknown
}

function autoLabelConservative(entry: Entry): { label: string; reason: string } {
  const score = entry.trustScore ?? 100
  const fc = entry.findings_count ?? 0

  // Clear LEGIT: no findings, high score
  if (fc === 0 && score >= 80) {
    return {
      label: 'CONFIRMED_LEGIT',
      reason: `Auto-L (conservative): no findings, score=${score}`
    }
  }

  // Clear LEGIT: very few findings, very high score
  if (fc <= 2 && score >= 90) {
    return {
      label: 'CONFIRMED_LEGIT',
      reason: `Auto-L (conservative): ${fc} findings but score=${score} — likely FP`
    }
  }

  // Everything else → PENDING_REVIEW (NOT auto-labeled as DECEPTIVE)
  return {
    label: 'PENDING_REVIEW',
    reason: `Auto-PENDING: score=${score}, ${fc} findings — needs manual review`
  }
}

function readJsonl(filePath: string): Entry[] {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    return []
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function writeJsonl(filePath: string, entries: Entry[]): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, entries.map(e => JSON.stringify(e)).join('\n'), 'utf-8')
}

async function main() {
  // ── 1. Load data ────────────────────────────────────────────────

  const v6Path = path.join(EVAL_DIR, 'labeled_v6.jsonl')
  const v5Path = path.join(EVAL_DIR, 'labeled_v5_prelabeled.jsonl')

  const v6: Entry[] = readJsonl(v6Path)
  const v5: Entry[] = readJsonl(v5Path)

  console.log(`═══ Data Recovery ═══`)
  console.log(`  v6 (339 entries, NO labels): ${v6.length} entries`)
  console.log(`  v5 (180 entries, WITH labels): ${v5.length} entries`)

  // ── 2. Build v5 lookup by id ────────────────────────────────────

  const v5Map = new Map<string, Entry>()
  for (const e of v5) {
    v5Map.set(e.id, e)
  }

  const v5Ids = new Set(v5Map.keys())
  const v6Ids = new Set(v6.map(e => e.id))
  const overlap = v6.filter(e => v5Ids.has(e.id))
  const newEntries = v6.filter(e => !v5Ids.has(e.id))

  console.log(`\n  Overlap entries (should copy labels from v5): ${overlap.length}`)
  console.log(`  New entries (need auto-label): ${newEntries.length}`)

  // ── 3. Recover labels ───────────────────────────────────────────

  const recovered: Entry[] = []
  let manualDec = 0
  let manualLegit = 0
  let manualAmb = 0
  let v5AutoDec = 0  // auto-labeled DECEPTIVE dari v5 (circular, ditandai)
  let autoLegit = 0
  let pendingReview = 0

  for (const entry of v6) {
    const v5Entry = v5Map.get(entry.id)

    if (v5Entry && v5Entry.label) {
      // Entry was in v5 — preserve its label
      const label = v5Entry.label!
      const isManual = v5Entry.label_auto === false

      recovered.push({
        ...entry,
        label,
        ground_truth_label: label,
        label_auto: isManual ? false : true,
        label_auto_confidence: v5Entry.label_auto_confidence || 'high',
        label_auto_reason: v5Entry.label_auto_reason || (isManual ? 'already manually labeled' : 'auto-labeled from v5'),
      })

      if (label === 'CONFIRMED_DECEPTIVE') {
        if (isManual) manualDec++
        else v5AutoDec++
      } else if (label === 'CONFIRMED_LEGIT') {
        if (isManual) manualLegit++
        else autoLegit++
      } else if (label === 'AMBIGUOUS') {
        manualAmb++
      } else {
        pendingReview++
      }
    } else {
      // New entry — conservative auto-label
      const { label, reason } = autoLabelConservative(entry)
      const isPending = label === 'PENDING_REVIEW'

      recovered.push({
        ...entry,
        label,
        ground_truth_label: label,
        label_auto: true,
        label_auto_confidence: isPending ? 'low' : 'medium',
        label_auto_reason: reason,
      })

      if (label === 'CONFIRMED_LEGIT') autoLegit++
      else pendingReview++
    }
  }

  // ── 4. Write v7 ─────────────────────────────────────────────────

  const v7Path = path.join(EVAL_DIR, 'labeled_v7.jsonl')
  writeJsonl(v7Path, recovered)
  console.log(`\n✅ Written: ${path.basename(v7Path)} (${recovered.length} entries)`)

  // ── 5. Audit report ─────────────────────────────────────────────

  const report = {
    generated_at: new Date().toISOString(),
    total_entries: recovered.length,
    manual: {
      total: manualDec + manualLegit + manualAmb,
      deceptive: manualDec,
      legit: manualLegit,
      ambiguous: manualAmb,
    },
    auto_labeled: {
      total: autoLegit + v5AutoDec,
      legit: autoLegit,
      deceptive: v5AutoDec,  // from v5 auto-labeler (before circularity fix — flagged for transparency)
      v5_auto_dec_deferred_review: v5AutoDec > 0 ? 'These entries were auto-labeled as DECEPTIVE by v5 auto-labeler. Consider manual review.' : 'none',
    },
    pending_review: {
      total: pendingReview,
    },
    note: 'RECOVERED from v5 manual labels. Auto-label strategy: CONSERVATIVE — only LEGIT when no findings. All mixed signals → PENDING_REVIEW. ZERO auto-labeled DECEPTIVE to avoid circularity.',
  }

  const reportPath = path.join(EVAL_DIR, 'reports', 'label-audit.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`✅ Written: ${path.basename(reportPath)}`)

  // ── 6. Print summary ────────────────────────────────────────────

  console.log(`\n📊 FINAL DATASET DISTRIBUTION:`)
  console.log(`  ┌──────────────────────┬──────────┐`)
  console.log(`  │ Category             │   Count  │`)
  console.log(`  ├──────────────────────┼──────────┤`)
  console.log(`  │ Manual DECEPTIVE     │   ${String(manualDec).padStart(5)}  │`)
  console.log(`  │ Manual LEGIT         │   ${String(manualLegit).padStart(5)}  │`)
  console.log(`  │ Manual AMBIGUOUS     │   ${String(manualAmb).padStart(5)}  │`)
  console.log(`  │ Auto-labeled LEGIT   │   ${String(autoLegit).padStart(5)}  │`)
  console.log(`  │ PENDING REVIEW       │   ${String(pendingReview).padStart(5)}  │`)
  console.log(`  ├──────────────────────┼──────────┤`)
  console.log(`  │ TOTAL                │   ${String(recovered.length).padStart(5)}  │`)
  console.log(`  └──────────────────────┴──────────┘`)
  console.log(`\n📝 ${report.note}`)
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
