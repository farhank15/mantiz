import type { Finding, ParsedDiff } from '../types'

// Order matters: mock, spyOn, fn — used with findIndex to determine confidence
const MOCK_PATTERNS = [
  /(?:jest|vi)\.\s*mock\s*\(/,
  /(?:jest|vi)\.\s*spyOn\s*\(/,
  /(?:jest|vi)\.\s*fn\s*\(/,
]
const TEST_PATTERN = /\b(it|test|describe|expect|assert)\s*\(/

function scanForMocks(hunkContent: string, baseLine: number, filePath: string): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  let mockCount = 0
  let testAssertionCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('+')) continue

    const matchedPatternIdx = MOCK_PATTERNS.findIndex(p => p.test(line))
    if (matchedPatternIdx !== -1) {
      mockCount++

      // MOCK_PATTERNS[0] = mock(), [1] = spyOn(), [2] = fn()
      // fn() and spyOn() → low (common, rarely indicates cheating)
      // mock() → high if entire module, medium if partial
      let confidence: 'high' | 'medium' | 'low'
      let explanation: string

      if (matchedPatternIdx === 2) {
        confidence = 'low'
        explanation = 'Mock function — common test utility, verify real assertions exist.'
      } else if (matchedPatternIdx === 1) {
        confidence = 'low'
        explanation = 'Method spy — common pattern, verify real behavior is also tested.'
      } else {
        const isEntireModule = line.includes('* as') || !line.includes('{')
        confidence = isEntireModule ? 'high' : 'medium'
        explanation = isEntireModule
          ? 'Entire module mocked — may bypass real implementation.'
          : 'Module mock — verify real path is tested alongside.'
      }

      findings.push({
        patternType: 'mock_to_avoid_failure',
        filePath,
        lineStart: baseLine + i,
        lineEnd: baseLine + i,
        confidence,
        explanation,
        evidenceExcerpt: line.slice(1).trim().substring(0, 120),
      })
    }

    if (TEST_PATTERN.test(line)) {
      testAssertionCount++
    }
  }

  if (mockCount > 0 && testAssertionCount > 0 && mockCount > testAssertionCount) {
    findings.push({
      patternType: 'mock_to_avoid_failure',
      filePath,
      lineStart: baseLine,
      lineEnd: baseLine + lines.length,
      confidence: 'medium',
      explanation: `Excessive mocking detected: ${mockCount} mock(s) vs ${testAssertionCount} test assertion(s) in this hunk.`,
      evidenceExcerpt: `Mocks: ${mockCount}, Assertions: ${testAssertionCount}`,
    })
  }

  return findings
}

export function detectMockToAvoid(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    for (const hunk of file.hunks) {
      const hunkFindings = scanForMocks(hunk.content, hunk.newStart, filePath)
      findings.push(...hunkFindings)
    }
  }

  return findings
}
