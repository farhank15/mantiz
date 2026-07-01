import type { Finding, ParsedDiff } from './types'
import { parseRawDiff } from './diff-parser'
import { detectDisabledAssertions } from './disabled-assertion'
import { detectAssertionTampering } from './assertion-tampering'
import { detectMockToAvoid } from './mock-to-avoid'
import { detectClaimDiffMismatch, isNonFunctional } from './claim-mismatch'
import { detectSilentCatch } from './silent-catch'
import { detectHallucinatedAssertions } from './hallucination'
import { detectWithAI } from './ai-assisted'
import { detectWithAST } from './ast-analyzer'

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
}

const CONFIDENCE_PENALTY: Record<string, number> = {
  high: 30,
  medium: 15,
  low: 5,
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

  // Detector 7: AST-based deep analysis (structural manipulation regex can't catch)
  const d7 = detectWithAST(functionalFiles)
  debug(`  Detector 7 [AST Analysis]: ${d7.length} finding${d7.length !== 1 ? 's' : ''}`)

  const findings: Finding[] = [
    ...d1,
    ...d2,
    ...d3,
    ...d4,
    ...d5,
    ...d6,
    ...d7,
  ]

  let deductions = 0
  for (const finding of findings) {
    deductions += CONFIDENCE_PENALTY[finding.confidence] ?? 5
  }
  // Cap at minimum 10 if there are findings (avoid confusing 0/100)
  const minScore = findings.length > 0 ? 10 : 0
  const trustScore = Math.max(minScore, 100 - deductions)

  const elapsed = Date.now() - startTime
  debug(`✓ Scan complete in ${elapsed}ms — Score: ${trustScore}/100, ${findings.length} total finding${findings.length !== 1 ? 's' : ''}`)

  const summary = {
    totalFindings: findings.length,
    highCount: findings.filter(f => f.confidence === 'high').length,
    mediumCount: findings.filter(f => f.confidence === 'medium').length,
    lowCount: findings.filter(f => f.confidence === 'low').length,
    filesScanned: files.length,
  }

  const fixInstructions = trustScore < 80 ? generateFixInstructions(findings) : []

  return { files, findings, trustScore, summary, fixInstructions }
}

/**
 * Scan a diff with AI-assisted detection.
 * Runs static detectors first (sync), then fires AI detection (Fireworks → Groq).
 * Falls back gracefully if AI fails or times out.
 * prContext is passed to claim-diff mismatch detector for bot/honest-title awareness.
 */
export async function scanDiffAsync(
  rawDiff: string,
  prContext?: { title?: string; author?: string },
): Promise<ScanResult> {
  const baseResult = scanDiff(rawDiff, prContext)

  const aiEnabled = typeof process !== 'undefined' && process.env.AI_DETECTION_ENABLED === 'true'
  if (!aiEnabled) return baseResult

  debug('  Detector 7 [AI-Assisted Detection]: analyzing via Fireworks/Groq...')

  try {
    const aiFindings = await detectWithAI(baseResult.files)
    if (aiFindings.length === 0) {
      debug('  Detector 8 [AI-Assisted Detection]: 0 findings (clean AI verdict)')
      return baseResult
    }

    debug(`  Detector 8 [AI-Assisted Detection]: ${aiFindings.length} finding${aiFindings.length !== 1 ? 's' : ''}`)

    const mergedFindings = [...baseResult.findings, ...aiFindings]

    let deductions = 0
    for (const finding of mergedFindings) {
      deductions += CONFIDENCE_PENALTY[finding.confidence] ?? 5
    }
    // Cap at minimum 10 if there are findings (avoid confusing 0/100)
    const minScore = mergedFindings.length > 0 ? 10 : 0
    const newTrustScore = Math.max(minScore, 100 - deductions)

    const summary = {
      totalFindings: mergedFindings.length,
      highCount: mergedFindings.filter(f => f.confidence === 'high').length,
      mediumCount: mergedFindings.filter(f => f.confidence === 'medium').length,
      lowCount: mergedFindings.filter(f => f.confidence === 'low').length,
      filesScanned: baseResult.summary.filesScanned,
    }

    const fixInstructions = newTrustScore < 80 ? generateFixInstructions(mergedFindings) : []

    debug(`✓ AI-assisted scan complete — Score: ${newTrustScore}/100, ${mergedFindings.length} total findings`)

    return {
      ...baseResult,
      findings: mergedFindings,
      trustScore: newTrustScore,
      summary,
      fixInstructions,
    }
  } catch (err) {
    debug('  Detector 8 [AI-Assisted Detection]: failed —', err)
    return baseResult
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
    }
  }

  return instructions
}
