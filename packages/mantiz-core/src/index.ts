/**
 * Mantiz Core — AI Lie Detector Engine
 *
 * Entry point for the detection engine package.
 * Export all public APIs for use by CLI, web app, and other consumers.
 */

export { scanDiff, scanDiffAsync } from './engine'
export type { ScanResult, FixInstruction } from './engine'
export type { Finding, ParsedDiff, DiffHunk, PatternType, Confidence } from './types'
export { parseRawDiff } from './diff-parser'
export { detectDisabledAssertions } from './detectors/disabled-assertion'
export { detectAssertionTampering } from './detectors/assertion-tampering'
export { detectMockToAvoid } from './detectors/mock-to-avoid'
export { detectClaimDiffMismatch, isNonFunctional } from './detectors/claim-mismatch'
export { detectSilentCatch } from './detectors/silent-catch'
export { detectHallucinatedAssertions } from './detectors/hallucination'
export { detectWithAI } from './detectors/ai-assisted'
export { evaluateFindings, isAIJudgeEnabled } from './detectors/ai-judge'
