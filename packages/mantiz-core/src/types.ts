export type PatternType =
  | 'disabled_assertion'
  | 'assertion_tampering'
  | 'mock_to_avoid_failure'
  | 'claim_diff_mismatch'
  | 'silent_catch_and_pass'
  | 'hallucinated_assertion'
  | 'ai_assisted_detection'

export type Confidence = 'low' | 'medium' | 'high'

/**
 * Categorical verdict derived from evidence score.
 * More honest than a raw number — explicitly admits uncertainty.
 */
export type Verdict = 'CLEAN' | 'SUSPICIOUS' | 'LIKELY_DECEPTIVE'
export type VerdictConfidence = 'low' | 'medium' | 'high'

export type FileImportance = 'core' | 'test' | 'source' | 'config' | 'artifact' | 'docs'

/**
 * AI Judge verdict for a static finding.
 * - VALID: Finding correctly identifies cheating — keep as-is
 * - FALSE_POSITIVE: Finding is a legitimate code change — drop
 * - CONTEXTUAL: Technically suspicious but context justifies partial mitigation — downgrade
 */
export type AIJudgeVerdict = 'VALID' | 'FALSE_POSITIVE' | 'CONTEXTUAL'

export interface Finding {
  patternType: PatternType
  filePath: string
  lineStart: number
  lineEnd: number
  confidence: Confidence
  explanation: string
  evidenceExcerpt: string
  fileImportance?: FileImportance
  /** AI Judge verdict — set when AI ref reviews static findings */
  aiVerdict?: AIJudgeVerdict
  /** Reasoning behind the AI Judge's verdict */
  aiReasoning?: string
}

export interface ParsedDiff {
  oldFile?: string
  newFile?: string
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

/**
 * Derived verdict — categorical, not numeric.
 */
export interface VerdictResult {
  label: Verdict
  confidence: VerdictConfidence
  reason: string
}

/**
 * Transparent breakdown of how the trust score was calculated.
 * Makes the scoring pipeline auditable and explainable.
 */
export interface ScoringBreakdown {
  /** Score after static detectors + dedup */
  staticScore: number
  /** Raw findings count before dedup */
  rawFindings: number
  /** Findings count after dedup */
  dedupedFindings: number
  /** Number of findings filtered by AI Judge (if enabled) */
  aiJudgeFiltered: number
  /** New findings discovered by AI-Assisted detection */
  aiAssistedFindings: number
}

export interface CommitMeta {
  message: string
  author?: string
}
