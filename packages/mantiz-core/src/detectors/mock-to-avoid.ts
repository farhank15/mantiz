import type { Finding, ParsedDiff } from '../types'

const MOCK_PATTERN = /(?:jest|vi)\.\s*mock\s*\(/
const TEST_PATTERN = /\b(it|test|describe|expect|assert)\s*\(/

function scanForMocks(hunkContent: string, baseLine: number, filePath: string): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  let mockCount = 0
  let testAssertionCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('+')) continue

    if (MOCK_PATTERN.test(line)) {
      mockCount++
      const isEntireModule = line.includes('* as') || !line.includes('{')
      findings.push({
        patternType: 'mock_to_avoid_failure',
        filePath,
        lineStart: baseLine + i,
        lineEnd: baseLine + i,
        confidence: isEntireModule ? 'high' : 'medium',
        explanation: isEntireModule
          ? `Entire module mocked with jest/vi.mock() — may bypass real implementation.`
          : `Partial mock introduced — check if real path is also tested.`,
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
