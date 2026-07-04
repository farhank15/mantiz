import type { Finding, ParsedDiff } from '../types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from '../language-registry'

const SIMPLE_ASSERTION_CHECK = /expect\s*\(|assert|should|it\./i

function scanForMocks(hunkContent: string, baseLine: number, filePath: string, lang: string | null): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  const rules = lang && LANGUAGE_CONFIG[lang]
    ? LANGUAGE_CONFIG[lang].detectionRules
    : LANGUAGE_CONFIG.javascript.detectionRules
  const mockPatterns = rules.mockToAvoid.mockPatterns

  let mockCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('+')) continue

    const matchedPatternIdx = mockPatterns.findIndex(p => p.test(line))
    if (matchedPatternIdx !== -1) {
      mockCount++
      const mockContent = line.slice(1).trim().substring(0, 120)

      let confidence: 'high' | 'medium' | 'low'
      let explanation: string

      // Heuristic confidence based on how many patterns exist for this language
      if (mockPatterns.length > 3) {
        // Lang with detailed mock patterns (JS/TS, Java, Ruby)
        if (matchedPatternIdx <= 1) {
          confidence = 'high'
          explanation = 'Mock introduced in test — verify real assertions exist alongside mock.'
        } else {
          confidence = 'low'
          explanation = 'Common test utility — verify real behavior is also tested.'
        }
      } else {
        confidence = 'medium'
        explanation = 'Potential mock that may bypass real implementation.'
      }

      findings.push({
        patternType: 'mock_to_avoid_failure',
        filePath,
        lineStart: baseLine + i,
        lineEnd: baseLine + i,
        confidence,
        explanation,
        evidenceExcerpt: mockContent,
      })
    }
  }

  // Excessive mocking check
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

export function detectMockToAvoid(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (!isTestFile(filePath)) continue
    const lang = detectLanguage(filePath)

    for (const hunk of file.hunks) {
      const hunkFindings = scanForMocks(hunk.content, hunk.newStart, filePath, lang)
      findings.push(...hunkFindings)
    }
  }

  return findings
}
