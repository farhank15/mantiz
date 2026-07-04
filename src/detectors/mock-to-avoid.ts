import type { Finding, ParsedDiff } from './types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from './language-registry'

/**
 * Scan hunk content for new mock introductions and calculate ratio
 * using language-specific patterns from the Language Registry.
 */
function scanForMocks(hunkContent: string, baseLine: number, filePath: string, lang: string | null): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  const rules = lang && LANGUAGE_CONFIG[lang]
    ? LANGUAGE_CONFIG[lang].detectionRules
    : LANGUAGE_CONFIG.javascript.detectionRules

  const mockPatterns = rules.mockToAvoid.mockPatterns

  let mockCount = 0
  const mockLines: { line: string; index: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Only check added lines (+ prefix)
    if (!line.startsWith('+')) continue

    // Check against all language-specific mock patterns
    const matchedPattern = mockPatterns.find(p => p.test(line))
    if (matchedPattern) {
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
          ? `Entire module mocked — may bypass real implementation.`
          : `Partial mock introduced — check if real path is also tested.`,
        evidenceExcerpt: mockContent,
      })
    }
  }

  // Check for excessive mocking: count test/assert keywords in the hunk
  // NOTE: We use a SIMPLE regex here, NOT the full assertionPattern from the registry,
  // because assertionPattern has nested quantifiers that cause catastrophic backtracking
  // on long non-matching lines (e.g., minified JS in diffs).
  // This check is approximate — we just need a count, not exact matches.
  const SIMPLE_ASSERTION_CHECK = /expect\s*\(|assert|should|it\./i
  let testAssertionCount = 0
  for (const line of lines) {
    if (line.startsWith('+') && SIMPLE_ASSERTION_CHECK.test(line)) {
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

/**
 * Run the mock-to-avoid-failure detector across all parsed files/hunks.
 * Multi-language support via Language Registry.
 */
export function detectMockToAvoid(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    // Ignore deleted files
    if (file.newFile === '/dev/null') continue

    // Only scan test files (language-agnostic via registry)
    if (!isTestFile(filePath)) continue

    // Detect language for pattern matching
    const lang = detectLanguage(filePath)

    for (const hunk of file.hunks) {
      const hunkFindings = scanForMocks(hunk.content, hunk.newStart, filePath, lang)
      findings.push(...hunkFindings)
    }
  }

  return findings
}
