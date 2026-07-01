import type { Finding, ParsedDiff, Confidence } from './types'

/**
 * Patterns that indicate a disabled assertion.
 */
const COMMENTED_ASSERTION = /\/\/\s*(assert\s*\(|assert\.|expect\s*\(|should\s*\(|should\.|\.should\b|\.toBe|\.toEqual|\.toMatch|\.toContain|\.toThrow|\.resolves|\.rejects)/i
const SKIP_PATTERN = /\.skip\s*\(/
const IF_FALSE_PATTERN = /if\s*\(\s*(?:false|0)\s*\)\s*\{/
const COMMENTED_TEST = /\/\/\s*(?:it|test|describe)\s*\(/
const TODO_PREFIX = /\/\/\s*TODO/i

interface MatchResult {
  lineIndex: number
  lineContent: string
  pattern: 'comment' | 'skip' | 'if_false' | 'todo'
}

/**
 * Scan a single hunk's content lines and return matches for disabled assertions.
 */
function scanHunk(hunkContent: string, baseLine: number): MatchResult[] {
  const lines = hunkContent.split('\n')
  const matches: MatchResult[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip unchanged context lines
    if (line.startsWith(' ')) continue

    // Check for commented-out assertions
    if (COMMENTED_ASSERTION.test(line)) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'comment' })
      continue
    }

    // Check for .skip()
    if (SKIP_PATTERN.test(line) && (line.includes('it') || line.includes('describe') || line.includes('test'))) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'skip' })
      continue
    }

    // Check for if(false) wrapping
    if (IF_FALSE_PATTERN.test(line)) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'if_false' })
      continue
    }

    // Check for commented-out test blocks
    if (COMMENTED_TEST.test(line)) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'comment' })
      continue
    }

    // Check for TODO comments on test lines (weaker signal)
    if (TODO_PREFIX.test(line) && (line.includes('test') || line.includes('assert') || line.includes('expect'))) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'todo' })
      continue
    }
  }

  return matches
}

/**
 * Map match pattern to confidence level.
 */
function patternToConfidence(pattern: MatchResult['pattern']): Confidence {
  switch (pattern) {
    case 'skip':
      return 'high'
    case 'if_false':
      return 'high'
    case 'comment':
      return 'medium'
    case 'todo':
      return 'low'
  }
}

/**
 * Map match pattern to a human-readable explanation.
 */
function patternToExplanation(pattern: MatchResult['pattern']): string {
  switch (pattern) {
    case 'skip':
      return 'Test or test suite marked with .skip() — will be silently ignored by the test runner.'
    case 'if_false':
      return 'Assertion wrapped in if(false) — the assertion will never execute.'
    case 'comment':
      return 'Assertion commented out — the test no longer verifies the expected behavior.'
    case 'todo':
      return 'TODO comment on a test line — may indicate intentionally disabled verification.'
  }
}

/**
 * Run the disabled-assertion detector across all parsed files/hunks.
 */
export function detectDisabledAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    for (const hunk of file.hunks) {
      // Base line number for added lines starts at newStart
      const baseLine = hunk.newStart
      const matches = scanHunk(hunk.content, baseLine)

      for (const match of matches) {
        findings.push({
          patternType: 'disabled_assertion',
          filePath,
          lineStart: match.lineIndex,
          lineEnd: match.lineIndex,
          confidence: patternToConfidence(match.pattern),
          explanation: patternToExplanation(match.pattern),
          evidenceExcerpt: match.lineContent.slice(0, 200),
        })
      }
    }
  }

  return findings
}
