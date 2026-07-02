export type PatternType =
  | 'disabled_assertion'
  | 'assertion_tampering'
  | 'mock_to_avoid_failure'
  | 'claim_diff_mismatch'
  | 'silent_catch_and_pass'
  | 'hallucinated_assertion'
  | 'ai_assisted_detection'
  | 'historical_behavioral'
  | 'mutation_susceptibility'

export type Confidence = 'low' | 'medium' | 'high'

export type FileImportance = 'core' | 'test' | 'source' | 'config' | 'artifact' | 'docs'

export interface Finding {
  patternType: PatternType
  filePath: string
  lineStart: number
  lineEnd: number
  confidence: Confidence
  explanation: string
  evidenceExcerpt: string
  fileImportance?: FileImportance
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

export interface CommitMeta {
  message: string
  author?: string
}
