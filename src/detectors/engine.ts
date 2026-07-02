import type { Finding, ParsedDiff, Confidence } from './types'
import { parseRawDiff } from './diff-parser'
import { detectDisabledAssertions } from './disabled-assertion'
import { detectAssertionTampering } from './assertion-tampering'
import { detectMockToAvoid } from './mock-to-avoid'
import { detectClaimDiffMismatch, isNonFunctional, classifyImportance } from './claim-mismatch'
import { detectSilentCatch } from './silent-catch'
import { detectHallucinatedAssertions } from './hallucination'
import { detectWithAI } from './ai-assisted'
import { detectWithAST } from './ast-analyzer'
import { detectWithTreeSitter, detectWithTreeSitterAsync } from './tree-sitter-analyzer'
import { analyzeHistoricalBehavior } from './historical-scoring'
import { detectMutationSusceptibility } from './mutation-susceptibility'

// ─── Debug Logging ───────────────────────────────────────────────

const DEBUG = typeof process !== 'undefined' && process.env.MANTIZ_DEBUG === 'true'

function debug(...args: unknown[]) {
  if (DEBUG) console.log('[Mantiz]', ...args)
}

// ─── Types ───────────────────────────────────────────────────────

export interface FixInstruction {
  patternType: string
  instruction: string
}

export interface ScanResult {
  files: ParsedDiff[]
  findings: Finding[]
  trustScore: number
  summary: {
    totalFindings: number
    highCount: number
    mediumCount: number
    lowCount: number
    filesScanned: number
  }
  fixInstructions: FixInstruction[]
  /** Statistical scoring details */
  scoring?: {
    baseScore: number
    zScoreAdjustment: number
    bayesianFactor: number
    finalScore: number
    meanFindings: number
    stdFindings: number
    scanCount: number
  }
}

// ─── File Importance Multiplier ───────────────────────────────
// Findings in config/docs/artifact files contribute less penalty
const IMPORTANCE_MULTIPLIER: Record<string, number> = {
  core: 1,
  test: 1,
  source: 1,
  config: 0.5,
  docs: 0.3,
  artifact: 0.05,
}

/**
 * Deduplicate findings: same file + same line = keep highest confidence.
 * Prevents double-counting from multiple detectors flagging the same line.
 */
function dedupFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>()
  for (const f of findings) {
    const key = `${f.filePath}:${f.lineStart}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, f)
    } else {
      const weight = (c: Confidence) => c === 'high' ? 3 : c === 'medium' ? 2 : 1
      if (weight(f.confidence) > weight(existing.confidence)) {
        seen.set(key, f)
      }
    }
  }
  return Array.from(seen.values())
}

/**
 * Calculate penalty — deterministic, no global state.
 * Uses confidence level × file importance multiplier.
 * Same diff always gets same score (critical for "lie detector").
 */
function calculatePenalty(findings: Finding[]): number {
  let total = 0
  for (const f of findings) {
    const base = f.confidence === 'high' ? 20 : f.confidence === 'medium' ? 10 : 3
    const mult = IMPORTANCE_MULTIPLIER[f.fileImportance ?? 'source'] ?? 1
    total += base * mult
  }
  return Math.max(0, Math.round(total))
}

export function scanDiff(rawDiff: string, prContext?: { title?: string; author?: string }): ScanResult {
  const files = parseRawDiff(rawDiff)

  if (files.length === 0) {
    return {
      files: [],
      findings: [],
      trustScore: 100,
      summary: {
        totalFindings: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        filesScanned: 0,
      },
      fixInstructions: [],
    }
  }

  const functionalFiles = files.filter(f => !isNonFunctional(f.newFile || f.oldFile || ''))

  debug(`🔍 Parsing ${files.length} files (${functionalFiles.length} functional) from diff`)

  const startTime = Date.now()

  const d1 = detectDisabledAssertions(functionalFiles)
  debug(`  Detector 1 [Disabled Assertion]: ${d1.length} finding${d1.length !== 1 ? 's' : ''}`)

  const d2 = detectAssertionTampering(functionalFiles)
  debug(`  Detector 2 [Assertion Tampering]: ${d2.length} finding${d2.length !== 1 ? 's' : ''}`)

  const d3 = detectMockToAvoid(functionalFiles)
  debug(`  Detector 3 [Mock-to-Avoid]: ${d3.length} finding${d3.length !== 1 ? 's' : ''}`)

  const d4 = detectClaimDiffMismatch(files, prContext)
  debug(`  Detector 4 [Claim-Diff Mismatch]: ${d4.length} finding${d4.length !== 1 ? 's' : ''}`)

  const d5 = detectSilentCatch(functionalFiles)
  debug(`  Detector 5 [Silent Catch]: ${d5.length} finding${d5.length !== 1 ? 's' : ''}`)

  const d6 = detectHallucinatedAssertions(functionalFiles)
  debug(`  Detector 6 [Hallucinated Assertion]: ${d6.length} finding${d6.length !== 1 ? 's' : ''}`)

  // ─── Layer 7a: AST Analysis (Babel for JS/TS) ────────────────────
  const d7a = detectWithAST(functionalFiles)
  debug(`  Detector 7a [AST Analysis - JS/TS]: ${d7a.length} finding${d7a.length !== 1 ? 's' : ''}`)

  // ─── Layer 7b: Multi-Language AST Analysis (Tree-sitter) ────────
  // Uses Tree-sitter WASM parser for Python (CDN loaded)
  // Falls back to heuristic for Go, Java, Ruby, Rust, PHP
  const d7b = detectWithTreeSitter(functionalFiles)
  debug(`  Detector 7b [Tree-sitter ML]: ${d7b.length} finding${d7b.length !== 1 ? 's' : ''}`)

  // ─── Layer 10: Mutation Susceptibility ───────────────────────────
  const d10 = detectMutationSusceptibility(functionalFiles)
  debug(`  Detector 10 [Mutation Susceptibility]: ${d10.length} finding${d10.length !== 1 ? 's' : ''}`)

  const findings: Finding[] = [
    ...d1, ...d2, ...d3, ...d4, ...d5, ...d6, ...d7a, ...d7b, ...d10,
  ]

  // ─── Enrich with file importance for weighted scoring ────────
  for (const finding of findings) {
    if (!finding.fileImportance) {
      finding.fileImportance = classifyImportance(finding.filePath)
    }
  }

  // ─── Dedup: same file + same line = 1 finding (highest confidence) ─
  const dedupedFindings = dedupFindings(findings)

  // ─── Deterministic Scoring ─────────────────────────────────
  const penalty = calculatePenalty(dedupedFindings)
  const minScore = dedupedFindings.length > 0 ? 30 : 0
  const trustScore = Math.max(minScore, 100 - Math.min(penalty, 85)) // cap at 85 so score >= 15

  const elapsed = Date.now() - startTime
  debug(`✓ Scan complete in ${elapsed}ms — Score: ${trustScore}/100, ${findings.length} total findings (deterministic)`)

  const summary = {
    totalFindings: dedupedFindings.length,
    highCount: dedupedFindings.filter(f => f.confidence === 'high').length,
    mediumCount: dedupedFindings.filter(f => f.confidence === 'medium').length,
    lowCount: dedupedFindings.filter(f => f.confidence === 'low').length,
    filesScanned: files.length,
  }

  const fixInstructions = trustScore < 80 ? generateFixInstructions(dedupedFindings) : []

  return {
    files,
    findings: dedupedFindings,
    trustScore,
    summary,
    fixInstructions,
    scoring: {
      baseScore: 100 - penalty,
      zScoreAdjustment: 0,
      bayesianFactor: 0,
      finalScore: trustScore,
      meanFindings: 0,
      stdFindings: 0,
      scanCount: 0,
    },
  }
}

/**
 * Scan a diff with AI-assisted detection.
 * Runs static detectors first (sync), then fires AI detection.
 * Falls back gracefully if AI fails or times out.
 * prContext is passed to claim-diff mismatch detector for bot/honest-title awareness.
 */
export async function scanDiffAsync(
  rawDiff: string,
  prContext?: { title?: string; author?: string },
): Promise<ScanResult> {
  const baseResult = scanDiff(rawDiff, prContext)

  const aiEnabled = typeof process !== 'undefined' && process.env.AI_DETECTION_ENABLED === 'true'

  let allFindings = [...baseResult.findings]
  let currentScore = baseResult.trustScore
  let currentSummary = { ...baseResult.summary, totalFindings: allFindings.length }

  // ─── Layer 8: AI-Assisted Detection ───────────────────────────────
  if (aiEnabled) {
    debug('  Detector 8 [AI-Assisted Detection]: analyzing via AI...')

    try {
      // Normalize prContext: map author → description so AI prompt can use it
      const aiContext = prContext ? { title: prContext.title, description: prContext.author ? `Author: ${prContext.author}` : undefined } : undefined
      const aiFindings = await detectWithAI(baseResult.files, aiContext)
      if (aiFindings.length > 0) {
        debug(`  Detector 8 [AI-Assisted Detection]: ${aiFindings.length} finding${aiFindings.length !== 1 ? 's' : ''}`)

        allFindings = [...allFindings, ...aiFindings]

        // Recalculate with deterministic penalty (same floor as static: 30)
        const penalty = calculatePenalty(allFindings)
        const minScore = allFindings.length > 0 ? 30 : 0
        currentScore = Math.max(minScore, 100 - Math.min(penalty, 85))
        currentSummary = {
          totalFindings: allFindings.length,
          highCount: allFindings.filter(f => f.confidence === 'high').length,
          mediumCount: allFindings.filter(f => f.confidence === 'medium').length,
          lowCount: allFindings.filter(f => f.confidence === 'low').length,
          filesScanned: baseResult.summary.filesScanned,
        }
      } else {
        debug('  Detector 8 [AI-Assisted Detection]: 0 findings (clean AI verdict)')
      }
    } catch (err) {
      debug('  Detector 8 [AI-Assisted Detection]: failed —', err)
    }
  }

  // ─── Layer 7b: Multi-Language AST (Tree-sitter async) ─────────────
  // Only runs in async mode — Tree-sitter WASM needs async loading.
  // Falls back to heuristic if WASM is unavailable.
  if (baseResult.files.length > 0) {
    try {
      const d7bAsync = await detectWithTreeSitterAsync(baseResult.files)
      if (d7bAsync.length > 0) {
        debug(`  Detector 7b [Tree-sitter ASYNC]: ${d7bAsync.length} finding${d7bAsync.length !== 1 ? 's' : ''}`)
        allFindings = [...allFindings, ...d7bAsync]
      } else {
        debug('  Detector 7b [Tree-sitter ASYNC]: 0 findings (heuristic or clean)')
      }
    } catch (err) {
      debug('  Detector 7b [Tree-sitter ASYNC]: failed —', err)
    }
  }

  // ─── Layer 9: Historical Behavioral Analysis ─────────────────────
  if (prContext?.author) {
    debug(`  Detector 9 [Historical Behavioral]: analyzing ${prContext.author}...`)

    try {
      const historical = await analyzeHistoricalBehavior({
        author: prContext.author,
        title: prContext.title,
        trustScore: currentScore,
        totalFindings: allFindings.length,
        filesChanged: baseResult.files.length,
        files: baseResult.files,
      })

      if (historical.findings.length > 0) {
        debug(`  Detector 9 [Historical Behavioral]: ${historical.findings.length} finding${historical.findings.length !== 1 ? 's' : ''} (modifier: ${historical.modifier})`)

        allFindings = [...allFindings, ...historical.findings]

        if (historical.modifier !== 0) {
          currentScore = Math.max(10, Math.min(100, currentScore + historical.modifier))
        }

        currentSummary = {
          totalFindings: allFindings.length,
          highCount: allFindings.filter(f => f.confidence === 'high').length,
          mediumCount: allFindings.filter(f => f.confidence === 'medium').length,
          lowCount: allFindings.filter(f => f.confidence === 'low').length,
          filesScanned: baseResult.summary.filesScanned,
        }
      } else {
        debug(`  Detector 9 [Historical Behavioral]: 0 findings (no behavioral anomalies)`)
      }
    } catch (err) {
      debug('  Detector 9 [Historical Behavioral]: failed —', err)
    }
  }

  const fixInstructions = currentScore < 80 ? generateFixInstructions(allFindings) : []

  debug(`✓ Full scan complete — Score: ${currentScore}/100, ${allFindings.length} total findings`)

  return {
    ...baseResult,
    findings: allFindings,
    trustScore: currentScore,
    summary: currentSummary,
    fixInstructions,
  }
}

function generateFixInstructions(findings: Finding[]): FixInstruction[] {
  const instructions: FixInstruction[] = []
  const seen = new Set<string>()

  for (const f of findings) {
    if (seen.has(f.patternType)) continue
    seen.add(f.patternType)

    switch (f.patternType) {
      case 'disabled_assertion':
        instructions.push({
          patternType: 'disabled_assertion',
          instruction: `Remove '.skip()', 'if(false)' wrappers, or restore commented-out assertions. If a test fails, fix the source logic instead of disabling the assertion.`,
        })
        break
      case 'assertion_tampering':
        instructions.push({
          patternType: 'assertion_tampering',
          instruction: `Restore the original assertion expected value and update the source logic to match. The expected value changed without a corresponding source change.`,
        })
        break
      case 'mock_to_avoid_failure':
        instructions.push({
          patternType: 'mock_to_avoid_failure',
          instruction: `Remove unnecessary mock and add real-path test coverage. Mocks should only isolate external dependencies, not bypass internal logic.`,
        })
        break
      case 'claim_diff_mismatch':
        instructions.push({
          patternType: 'claim_diff_mismatch',
          instruction: `Update the commit message to accurately describe the changes, or add the expected test/source changes. The current diff doesn't match the claim.`,
        })
        break
      case 'silent_catch_and_pass':
        instructions.push({
          patternType: 'silent_catch_and_pass',
          instruction: `Add proper error handling in the catch block. Empty catch blocks silently swallow errors and should include logging, fallback logic, or re-throw with context.`,
        })
        break
      case 'hallucinated_assertion':
        instructions.push({
          patternType: 'hallucinated_assertion',
          instruction: `Replace the unknown assertion matcher with a valid Jest/Vitest matcher. Use the whitelist of valid matchers. If this is a custom matcher, ensure it's properly defined with expect.extend().`,
        })
        break
      case 'mutation_susceptibility':
        instructions.push({
          patternType: 'mutation_susceptibility',
          instruction: `Improve test specificity: add more precise assertions, reduce generic matchers, include negative/error test cases, and reduce mock dependency. This increases mutation resistance.`,
        })
        break
    }
  }

  return instructions
}
