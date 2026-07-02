import type { Finding, ParsedDiff, Confidence } from '../types'

const ASSERTION_PATTERN =
  /expect\s*\([^)]*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(([^)]*)\)\s*$/m

const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i
const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i

interface AssertionMatch {
  line: string
  lineIndex: number
  method: string
  value: string
}

function extractAssertions(line: string, lineIndex: number): AssertionMatch | null {
  const match = line.slice(1).match(ASSERTION_PATTERN)
  if (!match) return null
  return { line, lineIndex, method: match[1], value: match[2].trim() }
}

/**
 * Build set of changed source file basenames for context awareness.
 */
function buildChangedSourceFiles(files: ParsedDiff[]): Set<string> {
  const sourceFiles = new Set<string>()
  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''
    if (file.newFile === '/dev/null') continue
    if (SOURCE_FILE_PATTERN.test(filePath) && !TEST_FILE_PATTERN.test(filePath)) {
      const basename = filePath.split('/').pop()?.replace(/\.\w+$/, '') || ''
      if (basename) sourceFiles.add(basename.toLowerCase())
    }
  }
  return sourceFiles
}

/**
 * Check if test file has a corresponding source file that also changed.
 */
function hasCorrespondingSourceChange(testFilePath: string, changedSourceFiles: Set<string>): boolean {
  const basename = testFilePath.split('/').pop()?.replace(/\.(test|spec)\.\w+$/, '').toLowerCase() || ''
  return changedSourceFiles.has(basename)
}

function findTamperedAssertions(
  hunkContent: string,
  baseLine: number,
  hasSourceChange: 'specific' | 'any' | false,
): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  const oldAssertions: AssertionMatch[] = []
  const newAssertions: AssertionMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('-')) {
      const match = extractAssertions(line, baseLine + i)
      if (match) oldAssertions.push(match)
    } else if (line.startsWith('+')) {
      const match = extractAssertions(line, baseLine + i)
      if (match) newAssertions.push(match)
    }
  }

  for (const old of oldAssertions) {
    for (const nw of newAssertions) {
      if (old.method === nw.method && old.value !== nw.value) {
        const normalize = (v: string) => v.replace(/['"`]/g, '').replace(/\s+/g, '')
        if (normalize(old.value) === normalize(nw.value)) continue

        // CONTEXT-AWARE: 3-tier confidence
        if (hasSourceChange === 'specific') {
          findings.push({
            patternType: 'assertion_tampering',
            filePath: '',
            lineStart: nw.lineIndex,
            lineEnd: nw.lineIndex,
            confidence: 'low' as Confidence,
            explanation: `Assertion value updated from ${old.value} to ${nw.value} — corresponding source file also changed, indicating a coordinated update.`,
            evidenceExcerpt: nw.line.slice(0, 200),
          })
        } else if (hasSourceChange === 'any') {
          findings.push({
            patternType: 'assertion_tampering',
            filePath: '',
            lineStart: nw.lineIndex,
            lineEnd: nw.lineIndex,
            confidence: 'medium' as Confidence,
            explanation: `Assertion value updated from ${old.value} to ${nw.value} — source files also changed elsewhere in the PR, may be a coordinated update.`,
            evidenceExcerpt: nw.line.slice(0, 200),
          })
        } else {
          findings.push({
            patternType: 'assertion_tampering',
            filePath: '',
            lineStart: nw.lineIndex,
            lineEnd: nw.lineIndex,
            confidence: 'high' as Confidence,
            explanation: `Assertion value changed from ${old.value} to ${nw.value} without any source code changes to justify it.`,
            evidenceExcerpt: nw.line.slice(0, 200),
          })
        }
      }
    }
  }

  for (const old of oldAssertions) {
    const hasEquivalentNew = newAssertions.some(
      (n) => n.method === old.method || n.value === old.value
    )
    if (!hasEquivalentNew) {
      // If test was restructured, removal is likely legitimate
      if (newAssertions.length >= oldAssertions.length && newAssertions.length > 0) continue

      const removedConfidence = hasSourceChange === 'specific' ? 'low' as Confidence
        : hasSourceChange === 'any' ? 'low' as Confidence
        : 'medium' as Confidence

      findings.push({
        patternType: 'assertion_tampering',
        filePath: '',
        lineStart: old.lineIndex,
        lineEnd: old.lineIndex,
        confidence: removedConfidence,
        explanation: hasSourceChange
          ? `Assertion "${old.method}(${old.value})" was removed alongside source changes — likely a legitimate refactor.`
          : `Assertion "${old.method}(${old.value})" was removed without source changes — may indicate test weakening.`,
        evidenceExcerpt: old.line.slice(0, 200),
      })
    }
  }

  return findings
}

export function detectAssertionTampering(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const changedSourceFiles = buildChangedSourceFiles(files)

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (!TEST_FILE_PATTERN.test(filePath)) continue

    const specificMatch = hasCorrespondingSourceChange(filePath, changedSourceFiles)
    const hasSourceChange = specificMatch ? 'specific'
      : changedSourceFiles.size > 0 ? 'any'
      : false

    for (const hunk of file.hunks) {
      const hunkFindings = findTamperedAssertions(hunk.content, hunk.newStart, hasSourceChange)
      for (const f of hunkFindings) {
        f.filePath = filePath
        findings.push(f)
      }
    }
  }

  return findings
}
