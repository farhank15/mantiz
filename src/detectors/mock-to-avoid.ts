import type { Finding, ParsedDiff } from './types'

/**
 * Pattern for mock-related statements.
 */
const MOCK_PATTERN = /(?:jest|vi)\.\s*mock\s*\(/
const TEST_PATTERN = /\b(it|test|describe|expect|assert)\s*\(/

/**
 * Scan hunk content for new mock introductions and calculate ratio.
 */
function scanForMocks(hunkContent: string, baseLine: number, filePath: string): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  let mockCount = 0
  let testAssertionCount = 0
  const mockLines: { line: string; index: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Only check added lines (+ prefix)
    if (!line.startsWith('+')) continue

    if (MOCK_PATTERN.test(line)) {
      // Found a new mock statement
      mockCount++
      mockLines.push({ line: line.slice(1).trim(), index: baseLine + i })

      // Determine severity based on what's being mocked
      const isEntireModule = line.includes('* as') || !line.includes('{')
      const mockContent = line.slice(1).trim().substring(0, 120)

      findings.push({
        patternType: 'mock_to_avoid_failure',
        filePath,
        lineStart: baseLine + i,
        lineEnd: baseLine + i,
        confidence: isEntireModule ? 'high' : 'medium',
        explanation: isEntireModule
          ? `Entire module mocked with jest/vi.mock() — may bypass real implementation.`
          : `Partial mock introduced — check if real path is also tested.`,
        evidenceExcerpt: mockContent,
      })
    }

    if (TEST_PATTERN.test(line)) {
      testAssertionCount++
    }
  }

  // Excessive mocking: if there are more mocks than test assertions in this hunk
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

/**
 * Run the mock-to-avoid-failure detector across all parsed files/hunks.
 */
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
