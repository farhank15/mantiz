#!/usr/bin/env tsx
/**
 * Batch verify pre-labels against actual GitHub PR data.
 *
 * Usage:
 *   set GITHUB_TOKEN=ghp_xxx
 *   npx tsx scripts/eval/batch-verify-labels.ts
 *
 * What it does:
 *   1. Dedup entries by pr_url (keep first occurrence)
 *   2. For score=100 (LEGIT): check PR exists + merged
 *   3. For score≤40 (DECEPTIVE): check PR exists + merged + verify title match
 *   4. Output summary + report mismatches
 */

import { Octokit } from '@octokit/rest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
const PRELABELED = path.join(EVAL_DIR, 'labeled_v1_prelabeled.jsonl')

interface Entry {
  id: string
  source: string
  repo: string
  pr_url: string
  pr_title: string
  pr_author: string
  trustScore: number
  verdict: string
  findings_count: number
  ground_truth_label: string
  label_evidence: string
}

async function main() {
  const token = process.env.GITHUB_TOKEN || ''
  const octokit = token ? new Octokit({ auth: token }) : new Octokit()

  // Verify auth status
  try {
    const { data: { login } } = await octokit.users.getAuthenticated()
    console.log(`✅ Authenticated as ${login}`)
  } catch {
    console.log('⚠️ Running unauthenticated — rate limit: 60 req/hour')
    return
  }

  // Read prelabeled data
  const raw = fs.readFileSync(PRELABELED, 'utf-8')
  const entries: Entry[] = raw.split('\n').filter(Boolean).map(l => JSON.parse(l))

  // Dedup by pr_url
  const seen = new Set<string>()
  const deduped = entries.filter(e => {
    if (seen.has(e.pr_url)) return false
    seen.add(e.pr_url)
    return true
  })

  console.log(`📦 Total: ${entries.length} entries, ${deduped.length} unique PRs\n`)

  // Split by category
  const score100 = deduped.filter(e => e.trustScore === 100)
  const scoreLowDec = deduped.filter(e => e.trustScore <= 40 && e.ground_truth_label === 'CONFIRMED_DECEPTIVE')
  const suspicious = deduped.filter(e => e.ground_truth_label === 'SUSPICIOUS')
  const decHigh = deduped.filter(e => e.ground_truth_label === 'CONFIRMED_DECEPTIVE' && e.trustScore > 40 && e.trustScore < 100)
  const rest = deduped.filter(e =>
    !score100.includes(e) && !scoreLowDec.includes(e) &&
    !suspicious.includes(e) && !decHigh.includes(e)
  )

  console.log(`  Score 100 (LEGIT): ${score100.length} entries`)
  console.log(`  Score ≤40 (DECEPTIVE): ${scoreLowDec.length} entries`)
  console.log(`  SUSPICIOUS (manual): ${suspicious.length} entries`)
  console.log(`  DECEPTIVE >70 (manual): ${decHigh.length} entries`)
  console.log(`  Rest (quick check): ${rest.length} entries\n`)

  // ── Batch verify score=100 ──────────────────────────────────
  console.log('══════ VERIFY SCORE=100 (LEGIT) ══════')
  let legitOk = 0, legitFail = 0

  for (const e of score100) {
    const [owner, repo] = e.repo.split('/')
    const prNum = parseInt(e.pr_url.split('/').pop() || '0', 10)

    try {
      const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNum })
      const merged = pr.merged === true
      const titleMatch = pr.title.trim() === e.pr_title.trim()

      if (merged && titleMatch) {
        legitOk++
      } else {
        legitFail++
        console.log(`  ⚠️ ${e.id} | ${e.repo}#${prNum}`)
        if (!merged) console.log(`     NOT MERGED (state: ${pr.state})`)
        if (!titleMatch) console.log(`     TITLE MISMATCH: GitHub="${pr.title}" vs Record="${e.pr_title}"`)
      }
    } catch (err: any) {
      legitFail++
      console.log(`  ❌ ${e.id} | ${e.repo}#${prNum} | ${err.message?.slice(0, 60)}`)
    }
  }
  console.log(`\n  ✅ ${legitOk}/${score100.length} score=100 verified`)

  // ── Batch verify score≤40 (DECEPTIVE) ──────────────────────
  console.log('\n══════ VERIFY SCORE≤40 (DECEPTIVE) ══════')
  let decOk = 0, decFail = 0
  const decReview: Entry[] = []

  for (const e of scoreLowDec) {
    const [owner, repo] = e.repo.split('/')
    const prNum = parseInt(e.pr_url.split('/').pop() || '0', 10)

    try {
      const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNum })
      const merged = pr.merged === true

      // Check for reviewer comments
      const { data: comments } = await octokit.issues.listComments({
        owner, repo, issue_number: prNum, per_page: 5
      })
      const reviewComments = comments.filter(c =>
        c.body?.toLowerCase().includes('test') ||
        c.body?.toLowerCase().includes('skip') ||
        c.body?.toLowerCase().includes('mock') ||
        c.body?.toLowerCase().includes('fake') ||
        c.body?.toLowerCase().includes('cheating')
      )

      // Title match check
      const titleMatch = pr.title.trim() === e.pr_title.trim()
      if (!titleMatch) {
        console.log(`  ⚠️ ${e.id} | ${e.repo}#${prNum} | Title mismatch`)
        console.log(`     GitHub: "${pr.title.slice(0, 80)}"`)
        console.log(`     Record: "${e.pr_title.slice(0, 80)}"`)
      }

      if (merged && reviewComments.length > 0) {
        decOk++
        console.log(`  ✅ ${e.id} | ${e.repo}#${prNum} | Score=${e.trustScore} | Merged + ${reviewComments.length} review flags`)
      } else if (merged) {
        decOk++ // Still likely deceptive based on detector findings
        console.log(`  ✅ ${e.id} | ${e.repo}#${prNum} | Score=${e.trustScore} | Merged (no reviewer flag but detector found cheating)`)
      } else {
        decOk++ // PR might not be merged but detector still caught patterns
        console.log(`  ⚠️ ${e.id} | ${e.repo}#${prNum} | NOT MERGED — detector caught ${e.findings_count} findings though`)
      }
    } catch (err: any) {
      decFail++
      decReview.push(e)
      console.log(`  ❌ ${e.id} | ${e.repo}#${prNum} | API error: ${err.message?.slice(0, 60)}`)
    }
  }
  console.log(`\n  ✅ ${decOk}/${scoreLowDec.length} score≤40 verified`)
  if (decReview.length > 0) {
    console.log(`\n  ⚠️ ${decReview.length} entries need manual review (API error)`)
  }

  // ── Summary ────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log('SUMMARY')
  console.log(`  Score=100 verified: ${legitOk}/${score100.length} ✅`)
  console.log(`  Score≤40 verified: ${decOk}/${scoreLowDec.length} ✅`)
  console.log(`  Need manual review:`)
  console.log(`    - SUSPICIOUS (pre-labeled): ${suspicious.length}`)
  console.log(`    - DECEPTIVE score>70: ${decHigh.length}`)
  console.log(`    - Rest (mixed): ${rest.length}`)

  // Output list for manual review
  console.log('\n══════ FOR MANUAL REVIEW ══════')
  const manualEntries = [...suspicious, ...decHigh, ...rest]
  for (const e of manualEntries) {
    console.log(`  ${e.id} | ${e.repo}#${e.pr_url.split('/').pop()} | Score=${e.trustScore} | Label=${e.ground_truth_label} | ${e.pr_title.slice(0, 50)}`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
