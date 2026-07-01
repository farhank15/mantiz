import type { Finding, ParsedDiff, Confidence } from '../types'

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

function scanHunk(hunkContent: string, baseLine: number): MatchResult[] {
  const lines = hunkContent.split('\n')
  const matches: MatchResult[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith(' ')) continue

    if (COMMENTED_ASSERTION.test(line)) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'comment' })
      continue
    }
    if (SKIP_PATTERN.test(line) && (line.includes('it') || line.includes('describe') || line.includes('test'))) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'skip' })
      continue
    }
    if (IF_FALSE_PATTERN.test(line)) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'if_false' })
      continue
    }
    if (COMMENTED_TEST.test(line)) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'comment' })
      continue
    }
    if (TODO_PREFIX.test(line) && (line.includes('test') || line.includes('assert') || line.includes('expect'))) {
      matches.push({ lineIndex: baseLine + i, lineContent: line.trim(), pattern: 'todo' })
      continue
    }
  }

  return matches
}

function patternToConfidence(pattern: MatchResult['pattern']): Confidence {
  switch (pattern) {
    case 'skip': return 'high'
    case 'if_false': return 'high'
    case 'comment': return 'medium'
    case 'todo': return 'low'
  }
}

function patternToExplanation(pattern: MatchResult['pattern']): string {
  switch (pattern) {
    case 'skip': return 'Test or test suite marked with .skip() — will be silently ignored by the test runner.'
    case 'if_false': return 'Assertion wrapped in if(false) — the assertion will never execute.'
    case 'comment': return 'Assertion commented out — the test no longer verifies the expected behavior.'
    case 'todo': return 'TODO comment on a test line — may indicate intentionally disabled verification.'
  }
}

export function detectDisabledAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    for (const hunk of file.hunks) {
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
