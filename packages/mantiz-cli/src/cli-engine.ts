/**
 * Mantiz CLI Engine — Stand-alone detection engine without server dependencies.
 *
 * Wraps D1-D6 + D10 detectors directly, no server/auth/credits imports.
 * Scoring logic mirrors src/detectors/engine.ts with per-detector calibrated penalties.
 * ⚠️ Must stay in sync with engine.ts when re-calibrating.
 */

import type { Finding, ParsedDiff, Confidence, ScoringBreakdown, Verdict, VerdictResult } from '../../../src/detectors/types'
import { parseRawDiff } from '../../../src/detectors/diff-parser'
import { detectDisabledAssertions } from '../../../src/detectors/disabled-assertion'
import { detectAssertionTampering } from '../../../src/detectors/assertion-tampering'
import { detectMockToAvoid } from '../../../src/detectors/mock-to-avoid'
import { detectClaimDiffMismatch, isNonFunctional, classifyImportance } from '../../../src/detectors/claim-mismatch'
import { detectSilentCatch } from '../../../src/detectors/silent-catch'
import { detectHallucinatedAssertions } from '../../../src/detectors/hallucination'
import { detectMutationSusceptibility } from '../../../src/detectors/mutation-susceptibility'

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
  scoringBreakdown?: ScoringBreakdown
  verdict?: VerdictResult
}

// ─── Per-Detector Penalty Calibration ────────────────────────
// ⚠️ Must stay in sync with src/detectors/engine.ts
// Calibrated from DEDUPED data (203 unique PRs: 20 DEC, 183 LEGIT)
// Formula: weight = max(2, round(20 × precision × 0.4))
const DETECTOR_PENALTIES: Record<string, { high: number; medium: number; low: number }> = {
  'disabled_assertion':      { high: 4,  medium: 2, low: 1 },  // Precision 45.5%
  'assertion_tampering':     { high: 8,  medium: 4, low: 1 },  // Precision 100%
  'mock_to_avoid_failure':   { high: 8,  medium: 4, low: 1 },  // Precision 100%
  'claim_diff_mismatch':     { high: 2,  medium: 1, low: 0 },  // Precision 0%
  'silent_catch_and_pass':   { high: 3,  medium: 1, low: 0 },  // Precision 33.3%
  'hallucinated_assertion':  { high: 6,  medium: 3, low: 1 },  // Precision 77.8%
  'mutation_susceptibility': { high: 2,  medium: 1, low: 0 },  // Precision 30.0%
}

const IMPORTANCE_MULTIPLIER: Record<string, number> = {
  core: 1,
  test: 1,
  source: 1,
  config: 0.5,
  docs: 0.3,
  artifact: 0.05,
}

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

function calculatePenalty(findings: Finding[]): number {
  let total = 0
  for (const f of findings) {
    const detectorPenalty = DETECTOR_PENALTIES[f.patternType]
    const base = detectorPenalty
      ? (f.confidence === 'high' ? detectorPenalty.high : f.confidence === 'medium' ? detectorPenalty.medium : detectorPenalty.low)
      : (f.confidence === 'high' ? 10 : f.confidence === 'medium' ? 5 : 2)  // fallback for unknown detectors
    const mult = IMPORTANCE_MULTIPLIER[f.fileImportance ?? 'source'] ?? 1
    total += base * mult
  }
  return Math.max(0, Math.round(total))
}

function deriveVerdict(score: number): VerdictResult {
  if (score >= 80) {
    return {
      label: 'CLEAN' as Verdict,
      confidence: score >= 95 ? 'high' as const : score >= 88 ? 'medium' as const : 'low' as const,
      reason: `Evidence score ${score}/100 — no significant cheating patterns detected`,
    }
  }
  if (score >= 50) {
    return {
      label: 'SUSPICIOUS' as Verdict,
      confidence: score <= 60 ? 'high' as const : 'medium' as const,
      reason: `Evidence score ${score}/100 — suspicious patterns found, manual review recommended`,
    }
  }
  return {
    label: 'LIKELY_DECEPTIVE' as Verdict,
    confidence: score <= 30 ? 'high' as const : 'medium' as const,
    reason: `Evidence score ${score}/100 — strong indicators of test manipulation detected`,
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
          instruction: `Improve test specificity: add more precise assertions, reduce generic matchers, include negative/error test cases, and reduce mock dependency.`,
        })
        break
    }
  }

  return instructions
}

/**
 * Run all detectors on a raw diff string — D1-D6 + D10.
 * No server dependencies, no AI, no historical analysis.
 * Pure static analysis — 100% local.
 */
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

  // Run D1-D6 + D10 (all sync, no server deps)
  const rawFindings: Finding[] = [
    ...detectDisabledAssertions(functionalFiles),
    ...detectAssertionTampering(functionalFiles),
    ...detectMockToAvoid(functionalFiles),
    ...detectClaimDiffMismatch(files, prContext),
    ...detectSilentCatch(functionalFiles),
    ...detectHallucinatedAssertions(functionalFiles),
    ...detectMutationSusceptibility(functionalFiles),
  ]

  // Enrich with file importance
  for (const finding of rawFindings) {
    if (!finding.fileImportance) {
      finding.fileImportance = classifyImportance(finding.filePath)
    }
  }

  // Dedup: same file + same line = 1 finding (highest confidence)
  const findings = dedupFindings(rawFindings)

  // Calculate score
  const penalty = calculatePenalty(findings)
  const minScore = findings.length > 0 ? 30 : 0
  const trustScore = Math.max(minScore, 100 - Math.min(penalty, 85))

  const summary = {
    totalFindings: findings.length,
    highCount: findings.filter(f => f.confidence === 'high').length,
    mediumCount: findings.filter(f => f.confidence === 'medium').length,
    lowCount: findings.filter(f => f.confidence === 'low').length,
    filesScanned: files.length,
  }

  const fixInstructions = trustScore < 80 ? generateFixInstructions(findings) : []

  return {
    files,
    findings,
    trustScore,
    summary,
    fixInstructions,
    scoringBreakdown: {
      staticScore: trustScore,
      rawFindings: rawFindings.length,
      dedupedFindings: findings.length,
      aiJudgeFiltered: 0,
      aiAssistedFindings: 0,
    },
    verdict: deriveVerdict(trustScore),
  }
}
