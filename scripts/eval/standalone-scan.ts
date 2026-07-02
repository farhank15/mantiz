#!/usr/bin/env tsx
/**
 * Mantiz Standalone Scanner — Engine-Independent
 *
 * Scans raw_candidates.jsonl using ONLY fast regex-based detectors (D1-D6, D10).
 * Does NOT import engine.ts (which depends on TanStack server, database, WASM).
 *
 * Usage:
 *   npx tsx scripts/eval/standalone-scan.ts             # scan all candidates
 *   npx tsx scripts/eval/standalone-scan.ts --max 20     # limit to first N
 *   npx tsx scripts/eval/standalone-scan.ts --dry-run    # preview only
 *   npx tsx scripts/eval/standalone-scan.ts --concurrency 4  # parallel workers
 *
 * Environment:
 *   MANTIZ_DEBUG=true  — verbose scanner output
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

// ─── Inline Simple Diff Parser (avoids parsePatch hanging on malformed diffs) ──

interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

interface ParsedDiff {
  oldFile?: string
  newFile?: string
  hunks: DiffHunk[]
}

/**
 * O(n) line-by-line diff parser — guaranteed not to hang.
 * Handles truncated/malformed diffs gracefully.
 */
function parseDiffInline(raw: string): ParsedDiff[] {
  if (!raw || !raw.trim()) return []
  
  const lines = raw.split('\n')
  const result: ParsedDiff[] = []
  let currentFile: string | null = null
  let currentHunks: DiffHunk[] = []
  let hunkLines: string[] = []
  let hunkNewStart = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('diff --git ')) {
      if (hunkLines.length > 0) {
        currentHunks.push({ oldStart: 1, oldLines: hunkLines.length, newStart: hunkNewStart, newLines: hunkLines.length, content: hunkLines.join('\n') })
        hunkLines = []
      }
      if (currentFile && currentHunks.length > 0) {
        result.push({ newFile: currentFile, hunks: currentHunks })
      }
      const match = line.match(/diff --git a\/[^ ]+ b\/(.+)/)
      currentFile = match ? match[1] : 'unknown'
      currentHunks = []
      hunkNewStart = 1
      continue
    }

    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/)
    if (hunkMatch) {
      if (hunkLines.length > 0) {
        currentHunks.push({ oldStart: 1, oldLines: hunkLines.length, newStart: hunkNewStart, newLines: hunkLines.length, content: hunkLines.join('\n') })
        hunkLines = []
      }
      hunkNewStart = parseInt(hunkMatch[3], 10)
      continue
    }

    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('index ')) continue
    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      hunkLines.push(line)
    }
  }

  if (hunkLines.length > 0) {
    currentHunks.push({ oldStart: 1, oldLines: hunkLines.length, newStart: hunkNewStart, newLines: hunkLines.length, content: hunkLines.join('\n') })
  }
  if (currentFile && currentHunks.length > 0) {
    result.push({ newFile: currentFile, hunks: currentHunks })
  }
  if (result.length === 0 && hunkLines.length > 0) {
    result.push({ newFile: 'unknown', hunks: [{ oldStart: 1, oldLines: hunkLines.length, newStart: 1, newLines: hunkLines.length, content: hunkLines.join('\n') }] })
  }
  return result
}

// ─── Safe Detector Imports Only (no engine.ts!) ──────────────────

import { detectDisabledAssertions } from '../../src/detectors/disabled-assertion'
import { detectAssertionTampering } from '../../src/detectors/assertion-tampering'
import { detectMockToAvoid } from '../../src/detectors/mock-to-avoid'
import { detectClaimDiffMismatch, isNonFunctional } from '../../src/detectors/claim-mismatch'
import { detectSilentCatch } from '../../src/detectors/silent-catch'
import { detectHallucinatedAssertions } from '../../src/detectors/hallucination'
import { detectMutationSusceptibility } from '../../src/detectors/mutation-susceptibility'

// ─── Types ───────────────────────────────────────────────────────

interface RawCandidate {
  scraped_at: string
  source: string
  repo: string
  pr_url: string
  pr_title: string
  pr_author: string
  pr_created_at: string
  pr_updated_at: string
  labels: string[]
  diff_length_chars: number
  diff_snippet: string
}

interface ScanOutput {
  id: string
  scraped_at: string
  source: string
  repo: string
  pr_url: string
  pr_title: string
  pr_author: string
  scanned_at: string
  detector_version_commit: string
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
}

interface WorkerTask {
  candidate: RawCandidate
  index: number
  total: number
  gitHash: string
}

interface WorkerResult {
  output: ScanOutput | null
  error: string | null
  index: number
  timeMs: number
}

// ─── Detector Name Mapping ───────────────────────────────────────

function detectorName(patternType: string): string {
  const map: Record<string, string> = {
    disabled_assertion: 'D1_DisabledAssertion',
    assertion_tampering: 'D2_AssertionTampering',
    mock_to_avoid_failure: 'D3_MockToAvoid',
    claim_diff_mismatch: 'D4_ClaimDiffMismatch',
    silent_catch_and_pass: 'D5_SilentCatch',
    hallucinated_assertion: 'D6_HallucinatedAssertion',
    mutation_susceptibility: 'D10_MutationSusceptibility',
  }
  return map[patternType] || patternType
}

// ─── Scan a Single Candidate (runs in worker or main thread) ──────

function scanCandidate(
  candidate: RawCandidate,
  index: number,
  gitHash: string,
): { output: ScanOutput | null; error: string | null; timeMs: number; index: number } {
  const start = Date.now()

  try {
    // Parse diff using fast inline parser
    const files = parseDiffInline(candidate.diff_snippet)
    const functionalFiles = files.filter(f => !isNonFunctional(f.newFile || f.oldFile || ''))

    if (functionalFiles.length === 0) {
      return {
        output: {
          id: `gt_${String(index + 1).padStart(4, '0')}`,
          scraped_at: candidate.scraped_at,
          source: candidate.source,
          repo: candidate.repo,
          pr_url: candidate.pr_url,
          pr_title: candidate.pr_title,
          pr_author: candidate.pr_author,
          scanned_at: new Date().toISOString(),
          detector_version_commit: gitHash,
          trustScore: 100,
          verdict: 'CLEAN',
          findings_count: 0,
          findings_by_detector: {},
          findings_by_confidence: { high: 0, medium: 0, low: 0 },
          per_detector_detail: [],
        },
        error: null,
        timeMs: Date.now() - start,
        index,
      }
    }

    // Run only safe regex detectors
    const d1 = detectDisabledAssertions(functionalFiles)
    const d2 = detectAssertionTampering(functionalFiles)
    const d3 = detectMockToAvoid(functionalFiles)
    const d4 = detectClaimDiffMismatch(files, { title: candidate.pr_title, author: candidate.pr_author })
    const d5 = detectSilentCatch(functionalFiles)
    const d6 = detectHallucinatedAssertions(functionalFiles)
    const d10 = detectMutationSusceptibility(functionalFiles)

    const allFindings = [...d1, ...d2, ...d3, ...d4, ...d5, ...d6, ...d10]

    // Calculate penalty
    const IMPORTANCE_MULTIPLIER: Record<string, number> = { core: 1, test: 1, source: 1, config: 0.5, docs: 0.3, artifact: 0.05 }
    let penalty = 0
    for (const f of allFindings) {
      const base = f.confidence === 'high' ? 20 : f.confidence === 'medium' ? 10 : 3
      const mult = IMPORTANCE_MULTIPLIER[f.fileImportance ?? 'source'] ?? 1
      penalty += base * mult
    }
    penalty = Math.max(0, Math.round(penalty))
    const minScore = allFindings.length > 0 ? 30 : 0
    const trustScore = Math.max(minScore, 100 - Math.min(penalty, 85))

    // Derive verdict
    const verdict = trustScore >= 80 ? 'CLEAN' : trustScore >= 50 ? 'SUSPICIOUS' : 'LIKELY_DECEPTIVE'

    // Group by detector
    const byDetector: Record<string, number> = {}
    const detectorDetails: Record<string, ScanOutput['per_detector_detail'][0]> = {}
    for (const f of allFindings) {
      const name = detectorName(f.patternType)
      byDetector[name] = (byDetector[name] || 0) + 1
      if (!detectorDetails[name]) detectorDetails[name] = { detector: name, count: 0, findings: [] }
      detectorDetails[name].count++
      detectorDetails[name].findings.push({ line: f.lineStart, confidence: f.confidence, pattern: f.patternType, excerpt: f.evidenceExcerpt.slice(0, 120) })
    }

    return {
      output: {
        id: `gt_${String(index + 1).padStart(4, '0')}`,
        scraped_at: candidate.scraped_at,
        source: candidate.source,
        repo: candidate.repo,
        pr_url: candidate.pr_url,
        pr_title: candidate.pr_title,
        pr_author: candidate.pr_author,
        scanned_at: new Date().toISOString(),
        detector_version_commit: gitHash,
        trustScore,
        verdict,
        findings_count: allFindings.length,
        findings_by_detector: byDetector,
        findings_by_confidence: {
          high: allFindings.filter(f => f.confidence === 'high').length,
          medium: allFindings.filter(f => f.confidence === 'medium').length,
          low: allFindings.filter(f => f.confidence === 'low').length,
        },
        per_detector_detail: Object.values(detectorDetails),
      },
      error: null,
      timeMs: Date.now() - start,
      index,
    }
  } catch (err) {
    return { output: null, error: `Error: ${(err as Error).message.slice(0, 200)}`, timeMs: Date.now() - start, index }
  }
}

// ─── Worker Thread Handler ───────────────────────────────────────

if (!isMainThread) {
  const task = workerData as WorkerTask
  const result = scanCandidate(task.candidate, task.index, task.gitHash)
  parentPort?.postMessage(result)
  process.exit(0)
}

// ─── Main ────────────────────────────────────────────────────────

interface CLIOptions {
  inputFile: string
  outputFile: string
  dryRun: boolean
  maxCandidates: number
  concurrency: number
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const opts: CLIOptions = { inputFile: '', outputFile: '', dryRun: false, maxCandidates: 0, concurrency: 4 }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) opts.inputFile = args[++i]
    else if (args[i] === '--output' && i + 1 < args.length) opts.outputFile = args[++i]
    else if (args[i] === '--dry-run') opts.dryRun = true
    else if (args[i] === '--max' && i + 1 < args.length) opts.maxCandidates = parseInt(args[++i], 10)
    else if (args[i] === '--concurrency' && i + 1 < args.length) opts.concurrency = parseInt(args[++i], 10)
  }
  return opts
}

function getGitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: path.resolve(import.meta.dirname, '../..') }).trim()
  } catch { return 'unknown_dev_build' }
}

async function main() {
  const opts = parseArgs()
  const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
  const inputFile = opts.inputFile ? path.resolve(opts.inputFile) : path.join(EVAL_DIR, 'raw_candidates.jsonl')
  const outputFile = opts.outputFile ? path.resolve(opts.outputFile) : path.join(EVAL_DIR, 'labeled_v1.jsonl')

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`)
    console.error('   Run scripts/eval/scrape-github.ts first to gather candidates.')
    process.exit(1)
  }

  const raw = fs.readFileSync(inputFile, 'utf-8')
  const candidates: RawCandidate[] = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
  const gitHash = getGitHash()

  console.log(`📦 Loaded ${candidates.length} candidates from ${path.basename(inputFile)}`)
  console.log(`🔒 Detector frozen at commit: ${gitHash.slice(0, 12)}...`)

  if (candidates.length === 0) { console.log('⚠️  No candidates to scan.'); process.exit(0) }

  const toScan = opts.maxCandidates > 0 ? candidates.slice(0, opts.maxCandidates) : candidates
  if (opts.maxCandidates > 0 && opts.maxCandidates < candidates.length) {
    console.log(`📋 Limited to first ${opts.maxCandidates} candidates (of ${candidates.length})`)
  }

  if (!opts.dryRun) fs.writeFileSync(outputFile, '', 'utf-8')

  // ─── Decide: sequential or parallel ──────────────────────────
  // For small batches (< 20), sequential is faster (no worker overhead).
  // For large batches, use worker threads.
  const USE_WORKERS = toScan.length >= 20 && opts.concurrency > 1

  if (USE_WORKERS) {
    console.log(`🧵 Scanning with ${opts.concurrency} worker threads...`)
    await runWithWorkers(toScan, gitHash, opts, outputFile)
  } else {
    console.log('📝 Scanning sequentially...')
    runSequential(toScan, gitHash, opts, outputFile)
  }
}

// ─── Sequential Scan ─────────────────────────────────────────────

function runSequential(
  toScan: RawCandidate[],
  gitHash: string,
  opts: CLIOptions,
  outputFile: string,
) {
  let scanned = 0, errored = 0, totalFindings = 0, totalScore = 0

  for (let i = 0; i < toScan.length; i++) {
    const c = toScan[i]
    const prId = c.pr_url.split('/').pop() || '??'
    process.stdout.write(`  [${i + 1}/${toScan.length}] Scanning ${c.repo}#${prId}... `)

    const { output, error, timeMs } = scanCandidate(c, i, gitHash)

    if (output) {
      totalFindings += output.findings_count
      totalScore += output.trustScore
      if (!opts.dryRun) fs.appendFileSync(outputFile, JSON.stringify(output) + '\n', 'utf-8')
      scanned++
      process.stdout.write(`score=${output.trustScore} findings=${output.findings_count} (${timeMs}ms)\n`)
    } else {
      errored++
      process.stdout.write(`❌ ${error?.slice(0, 80)} (${timeMs}ms)\n`)
    }
  }

  const avgScore = scanned > 0 ? (totalScore / scanned) : 0
  console.log(`\n✅ Scanned ${scanned}/${toScan.length} (${errored} errors)`)
  console.log(`📊 Avg score ${avgScore.toFixed(1)}, ${totalFindings} findings across ${scanned} PRs`)
}

// ─── Parallel Worker Pool ────────────────────────────────────────

async function runWithWorkers(
  toScan: RawCandidate[],
  gitHash: string,
  opts: CLIOptions,
  outputFile: string,
) {
  const concurrency = Math.min(opts.concurrency, os.cpus().length)
  let scanned = 0, errored = 0, totalFindings = 0, totalScore = 0
  let nextIndex = 0

  async function processOne(candidate: RawCandidate, index: number): Promise<void> {
    return new Promise((resolve) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { candidate, index, total: toScan.length, gitHash } as WorkerTask,
        eval: false,
      })

      const timeout = setTimeout(() => {
        worker.terminate()
        process.stdout.write(`  [${index + 1}/${toScan.length}] ${candidate.repo}#${candidate.pr_url.split('/').pop() || '??'}... ⏰ TIMEOUT\n`)
        errored++
        resolve()
      }, 120_000) // 2 min timeout per candidate

      worker.on('message', (result: WorkerResult) => {
        clearTimeout(timeout)
        const prId = candidate.pr_url.split('/').pop() || '??'
        if (result.output) {
          totalFindings += result.output.findings_count
          totalScore += result.output.trustScore
          if (!opts.dryRun) fs.appendFileSync(outputFile, JSON.stringify(result.output) + '\n', 'utf-8')
          scanned++
          process.stdout.write(`  [${index + 1}/${toScan.length}] ${candidate.repo}#${prId} score=${result.output.trustScore} findings=${result.output.findings_count} (${result.timeMs}ms)\n`)
        } else {
          errored++
          process.stdout.write(`  [${index + 1}/${toScan.length}] ${candidate.repo}#${prId} ❌ ${result.error?.slice(0, 60)} (${result.timeMs}ms)\n`)
        }
        resolve()
      })

      worker.on('error', (err) => {
        clearTimeout(timeout)
        errored++
        process.stdout.write(`  [${index + 1}/${toScan.length}] ${candidate.repo}#${candidate.pr_url.split('/').pop()} ❌ Worker error: ${err.message.slice(0, 60)}\n`)
        resolve()
      })
    })
  }

  // Process in batches of `concurrency`
  while (nextIndex < toScan.length) {
    const batch = []
    for (let i = 0; i < concurrency && nextIndex < toScan.length; i++, nextIndex++) {
      batch.push(processOne(toScan[nextIndex], nextIndex))
    }
    await Promise.all(batch)
  }

  const avgScore = scanned > 0 ? (totalScore / scanned) : 0
  console.log(`\n✅ Scanned ${scanned}/${toScan.length} (${errored} errors)`)
  console.log(`📊 Avg score ${avgScore.toFixed(1)}, ${totalFindings} findings across ${scanned} PRs`)
}

// Need os for CPU count in worker pool
import * as os from 'node:os'

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
