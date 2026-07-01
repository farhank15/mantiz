/**
 * Mantiz Core Engine — AI Lie Detector
 *
 * Scans git diffs for AI agent cheating patterns and produces
 * a Trust Score (0-100) with ranked findings.
 *
 * Includes 7 detectors:
 * 1. Disabled Assertion Detection
 * 2. Assertion Tampering Detection
 * 3. Mock-to-Avoid-Failure Detection
 * 4. Claim-Diff Mismatch Detection
 * 5. Silent Catch-and-Pass Detection
 * 6. Hallucinated Assertion Detection
 * 7. AI-Assisted Detection (via Fireworks/Groq)
 */

import type { Finding, ParsedDiff } from './types'
import { parseRawDiff } from './diff-parser'
import { detectDisabledAssertions } from './detectors/disabled-assertion'
import { detectAssertionTampering } from './detectors/assertion-tampering'
import { detectMockToAvoid } from './detectors/mock-to-avoid'
import { detectClaimDiffMismatch, isNonFunctional } from './detectors/claim-mismatch'
import { detectSilentCatch } from './detectors/silent-catch'
import { detectHallucinatedAssertions } from './detectors/hallucination'
import { detectWithAI } from './detectors/ai-assisted'

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

  const functionalFiles = files.filter(f => !isNonFunctional(f.newFile || f.oldFile || ''))

  // Run all static detectors (sync)
  const staticFindings: Finding[] = [
    ...detectDisabledAssertions(functionalFiles),
    ...detectAssertionTampering(functionalFiles),
    ...detectMockToAvoid(functionalFiles),
    ...detectClaimDiffMismatch(files),
    ...detectSilentCatch(functionalFiles),
    ...detectHallucinatedAssertions(functionalFiles),
  ]

  // Calculate trust score
  let deductions = 0
  for (const finding of staticFindings) {
    deductions += CONFIDENCE_PENALTY[finding.confidence] ?? 5
  }
  const trustScore = Math.max(0, 100 - deductions)

  const summary = {
    totalFindings: staticFindings.length,
    highCount: staticFindings.filter(f => f.confidence === 'high').length,
    mediumCount: staticFindings.filter(f => f.confidence === 'medium').length,
    lowCount: staticFindings.filter(f => f.confidence === 'low').length,
    filesScanned: files.length,
  }

  const fixInstructions = trustScore < 80 ? generateFixInstructions(staticFindings) : []

  return { files, findings: staticFindings, trustScore, summary, fixInstructions }
}

/**
 * Async version — also runs AI-assisted detection.
 * Returns the same ScanResult but may include AI findings.
 */
export async function scanDiffAsync(rawDiff: string): Promise<ScanResult> {
  const result = scanDiff(rawDiff)

  // Run AI detection (async, may fail silently)
  try {
    const aiFindings = await detectWithAI(result.files)
    if (aiFindings.length > 0) {
      // Recalculate with AI findings
      let deductions = 0
      const allFindings = [...result.findings, ...aiFindings]
      for (const finding of allFindings) {
        deductions += CONFIDENCE_PENALTY[finding.confidence] ?? 5
      }
      const newTrustScore = Math.max(0, 100 - deductions)

      return {
        ...result,
        findings: allFindings,
        trustScore: newTrustScore,
        summary: {
          totalFindings: allFindings.length,
          highCount: allFindings.filter(f => f.confidence === 'high').length,
          mediumCount: allFindings.filter(f => f.confidence === 'medium').length,
          lowCount: allFindings.filter(f => f.confidence === 'low').length,
          filesScanned: result.summary.filesScanned,
        },
        fixInstructions: newTrustScore < 80 ? generateFixInstructions(allFindings) : [],
      }
    }
  } catch {
    // AI detection failed silently — return static results
  }

  return result
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
      case 'ai_assisted_detection':
        instructions.push({
          patternType: 'ai_assisted_detection',
          instruction: `AI-assisted analysis detected potential cheating. Review the explanations and fix the underlying issues. The AI found semantic patterns that static analysis might miss.`,
        })
        break
    }
  }

  return instructions
}
