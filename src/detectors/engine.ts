import type { Finding, ParsedDiff } from './types'
import { parseRawDiff } from './diff-parser'
import { detectDisabledAssertions } from './disabled-assertion'

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
    }
  }

  // Run all detectors
  const findings: Finding[] = [
    ...detectDisabledAssertions(files),
    // Future: detectAssertionTampering(files),
    // Future: detectMockToAvoidFailure(files),
    // Future: detectClaimDiffMismatch(files),
    // Future: detectSilentCatchAndPass(files),
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

  return { files, findings, trustScore, summary }
}
