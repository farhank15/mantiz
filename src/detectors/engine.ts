import type { Finding, ParsedDiff } from './types'
import { parseRawDiff } from './diff-parser'
import { detectDisabledAssertions } from './disabled-assertion'
import { detectAssertionTampering } from './assertion-tampering'
import { detectMockToAvoid } from './mock-to-avoid'
import { detectClaimDiffMismatch } from './claim-mismatch'
import { detectSilentCatch } from './silent-catch'

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
}

/**
 * Scoring weights per confidence level.
 * Critical = 30pts deduction, High = 15pts, Medium = 8pts, Low = 3pts
 * Trust score = 100 - total deductions (capped at 0).
 */
const CONFIDENCE_PENALTY: Record<string, number> = {
  high: 30,
  medium: 15,
  low: 5,
}

/**
 * Run all detection engines on a raw diff string and produce a ScanResult.
 */
export function scanDiff(rawDiff: string): ScanResult {
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

  // Run all 5 detectors
  const findings: Finding[] = [
    ...detectDisabledAssertions(files),
    ...detectAssertionTampering(files),
    ...detectMockToAvoid(files),
    ...detectClaimDiffMismatch(files),
    ...detectSilentCatch(files),
  ]

  // Calculate trust score
  let deductions = 0
  for (const finding of findings) {
    deductions += CONFIDENCE_PENALTY[finding.confidence] ?? 5
  }
  const trustScore = Math.max(0, 100 - deductions)

  // Summary stats
  const summary = {
    totalFindings: findings.length,
    highCount: findings.filter(f => f.confidence === 'high').length,
    mediumCount: findings.filter(f => f.confidence === 'medium').length,
    lowCount: findings.filter(f => f.confidence === 'low').length,
    filesScanned: files.length,
  }

  // Auto-Healer: generate fix instructions for high-severity findings
  const fixInstructions = trustScore < 80 ? generateFixInstructions(findings) : []

  return { files, findings, trustScore, summary, fixInstructions }
}

export interface FixInstruction {
  patternType: string
  instruction: string
}

/**
 * Generate remediation instructions for detected findings.
 * These can be fed back to an AI agent for self-healing.
 */
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
          instruction: `Remove '.skip()', 'if(false)' wrappers, or restore commented-out assertions. ` +
            `If a test fails, fix the source logic instead of disabling the assertion.`,
        })
        break
      case 'assertion_tampering':
        instructions.push({
          patternType: 'assertion_tampering',
          instruction: `Restore the original assertion expected value and update the source ` +
            `logic to match. The expected value changed without a corresponding source change.`,
        })
        break
      case 'mock_to_avoid_failure':
        instructions.push({
          patternType: 'mock_to_avoid_failure',
          instruction: `Remove unnecessary mock and add real-path test coverage. ` +
            `Mocks should only isolate external dependencies, not bypass internal logic.`,
        })
        break
      case 'claim_diff_mismatch':
        instructions.push({
          patternType: 'claim_diff_mismatch',
          instruction: `Update the commit message to accurately describe the changes, ` +
            `or add the expected test/source changes. The current diff doesn't match the claim.`,
        })
        break
      case 'silent_catch_and_pass':
        instructions.push({
          patternType: 'silent_catch_and_pass',
          instruction: `Add proper error handling in the catch block. ` +
            `Empty catch blocks silently swallow errors and should include logging, ` +
            `fallback logic, or re-throw with context.`,
        })
        break
    }
  }

  return instructions
}
