import type { Finding, ParsedDiff } from './types'

/**
 * Regex to extract assertion method + expected value from a line.
 * Matches: expect(...).toBe(VALUE) / .toEqual(VALUE) / .toMatch(VALUE) / etc.
 */
const ASSERTION_PATTERN =
  /expect\s*\((?:[^()]*|\([^()]*\))*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(((?:[^()]*|\([^()]*\))*)\)\s*;?\s*$/m

/**
 * Match a single assertion from a diff line.
 */
interface AssertionMatch {
  line: string
  lineIndex: number
  method: string
  value: string
}

/**
 * Extract assertion calls from a diff line (prefixed with - or +).
 */
function extractAssertions(line: string, lineIndex: number): AssertionMatch | null {
  const match = line.slice(1).match(ASSERTION_PATTERN) // strip +/- prefix
  if (!match) return null
  return {
    line,
    lineIndex,
    method: match[1],
    value: match[2].trim(),
  }
}

/**
 * Find paired old/new assertions in the same hunk context.
 * In unified diff, `-` lines are old and `+` lines are new.
 * We look for cases where a `- expect(...).toBe(X)` is followed by `+ expect(...).toBe(Y)` with X !== Y.
 */
function findTamperedAssertions(hunkContent: string, baseLine: number): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  // Collect all old assertion matches
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

  // Check for value changes between old and new assertions
  for (const old of oldAssertions) {
    for (const nw of newAssertions) {
      // Same assertion method, different value = tampering
      if (old.method === nw.method && old.value !== nw.value) {
        // Skip if values are functionally equivalent (e.g., different quoting)
        const normalize = (v: string) => v.replace(/['"`]/g, '').replace(/\s+/g, '')
        if (normalize(old.value) === normalize(nw.value)) continue

        findings.push({
          patternType: 'assertion_tampering',
          filePath: '', // will be set by caller
          lineStart: nw.lineIndex,
          lineEnd: nw.lineIndex,
          confidence: 'high',
          explanation: `Assertion value changed from ${old.value} to ${nw.value} without corresponding source logic change.`,
          evidenceExcerpt: nw.line.slice(0, 200),
        })
      }
    }
  }

  // Also detect when an assertion is completely removed (deleted line, no new equivalent)
  // This handles cases where expect(...) lines were entirely deleted
  for (const old of oldAssertions) {
    const hasEquivalentNew = newAssertions.some(
      (n) => n.method === old.method || n.value === old.value
    )
    if (!hasEquivalentNew) {
      findings.push({
        patternType: 'assertion_tampering',
        filePath: '', // will be set by caller
        lineStart: old.lineIndex,
        lineEnd: old.lineIndex,
        confidence: 'medium',
        explanation: `Assertion "${old.method}(${old.value})" was removed from the diff — may indicate test weakening.`,
        evidenceExcerpt: old.line.slice(0, 200),
      })
    }
  }

  return findings
}

/**
 * Run the assertion-tampering detector across all parsed files/hunks.
 */
export function detectAssertionTampering(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    // Ignore deleted files
    if (file.newFile === '/dev/null') continue

    // Only scan test files
    if (!TEST_FILE_PATTERN.test(filePath)) continue

    for (const hunk of file.hunks) {
      const hunkFindings = findTamperedAssertions(hunk.content, hunk.newStart)
      for (const f of hunkFindings) {
        f.filePath = filePath
        findings.push(f)
      }
    }
  }

  return findings
}
