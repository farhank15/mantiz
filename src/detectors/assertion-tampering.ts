import type { Finding, ParsedDiff, Confidence } from './types'

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
  const content = line.slice(1) // strip +/- prefix
  // Skip commented lines — commented-out assertions are not real changes
  if (/^\s*\/\//.test(content)) return null
  const match = content.match(ASSERTION_PATTERN)
  if (!match) return null
  return {
    line,
    lineIndex,
    method: match[1],
    value: match[2].trim(),
  }
}

/**
 * Build a set of source file basenames that were modified in this diff.
 * Used to check if assertion value changes are coordinated with source changes.
 * E.g. if `src/calculator.js` changed, and `tests/calculator.test.js` changed,
 * an assertion value update is likely legitimate (not tampering).
 */
function buildChangedSourceFiles(files: ParsedDiff[]): Set<string> {
  const sourceFiles = new Set<string>()
  const SOURCE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i
  const TEST_PATTERN = /(\.(test|spec)\.)|(\/(?:__tests__|tests?|fixtures)\/)/i

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''
    if (file.newFile === '/dev/null') continue
    // Only track source files (not test files, not config files)
    if (SOURCE_PATTERN.test(filePath) && !TEST_PATTERN.test(filePath)) {
      // Extract basename without extension for matching
      const basename = filePath.split('/').pop()?.replace(/\.\w+$/, '') || ''
      if (basename) sourceFiles.add(basename.toLowerCase())
    }
  }

  return sourceFiles
}

/**
 * Check if a test file path has a corresponding source file that was also modified.
 * E.g., `tests/calculator.test.js` → `calculator` is the basename → check if `calculator` is in changedSourceFiles.
 */
function hasCorrespondingSourceChange(testFilePath: string, changedSourceFiles: Set<string>): boolean {
  const basename = testFilePath.split('/').pop()?.replace(/\.(test|spec)\.\w+$/, '').toLowerCase() || ''
  return changedSourceFiles.has(basename)
}

/**
 * Find paired old/new assertions in the same hunk context.
 * In unified diff, `-` lines are old and `+` lines are new.
 * We look for cases where a `- expect(...).toBe(X)` is followed by `+ expect(...).toBe(Y)` with X !== Y.
 *
 * CONTEXT-AWARE: If a corresponding source file was also modified in the same diff,
 * the assertion value change is likely legitimate, and confidence is reduced.
 */
function findTamperedAssertions(
  hunkContent: string,
  baseLine: number,
  hasSourceChange: 'specific' | 'any' | false,
): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  // Collect all old and new assertion matches
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
      if (old.method !== nw.method || old.value === nw.value) continue

      // Skip if values are functionally equivalent (different quoting)
      const normalize = (v: string) => v.replace(/['"`]/g, '').replace(/\s+/g, '')
      if (normalize(old.value) === normalize(nw.value)) continue

          // 🎯 CONTEXT-AWARE: If source code also changed, reduce suspicion
      // Tier 1: Same-basename source changed → LOW (specific coordinated update)
      // Tier 2: Any source file changed → MEDIUM (possible related change)
      // Tier 3: No source file changed → HIGH (suspicious)
      if (hasSourceChange === 'specific') {
        // Same-basename source changed — likely legitimate coordinated update
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
        // Some source file changed in the same diff — possible related change
        findings.push({
          patternType: 'assertion_tampering',
          filePath: '',
          lineStart: nw.lineIndex,
          lineEnd: nw.lineIndex,
          confidence: 'medium' as Confidence,
          explanation: `Assertion value updated from ${old.value} to ${nw.value} — source files also changed elsewhere in the PR, may be a coordinated update.`,
          evidenceExcerpt: nw.line.slice(0, 200),
        })        } else {
          // ONLY test changed — check if this is a value swap or expansion (restructure, not tampering)
          // Case 1: Value swap — old values reappear as new values at different positions
          const oldValueAppearsInNew = newAssertions.some(na => na.method === old.method && na.value === old.value)
          const nwValueExistedInOld = oldAssertions.some(oa => oa.method === nw.method && oa.value === nw.value)
          const isValueSwap = oldValueAppearsInNew && nwValueExistedInOld

          // Case 2: Test expansion — old value STILL EXISTS in new assertions (kept), AND new value is added
          // This is an addition, not tampering: the test is being expanded, not weakened
          const isExpansion = oldValueAppearsInNew

          if (isValueSwap) {
            findings.push({
              patternType: 'assertion_tampering',
              filePath: '',
              lineStart: nw.lineIndex,
              lineEnd: nw.lineIndex,
              confidence: 'medium' as Confidence,
              explanation: `Assertion value updated from ${old.value} to ${nw.value} — values appear to be swapped/restructured, indicating a coordinated test update rather than tampering.`,
              evidenceExcerpt: nw.line.slice(0, 200),
            })
          } else if (isExpansion && newAssertions.length >= oldAssertions.length) {
            findings.push({
              patternType: 'assertion_tampering',
              filePath: '',
              lineStart: nw.lineIndex,
              lineEnd: nw.lineIndex,
              confidence: 'low' as Confidence,
              explanation: `Assertion value updated from ${old.value} to ${nw.value} — old assertion retained and new value added, indicating test was expanded rather than tampered.`,
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

  // Detect removed assertions (no equivalent new assertion)
  for (const old of oldAssertions) {
    const hasEquivalentNew = newAssertions.some(
      (n) => n.method === old.method || n.value === old.value
    )
    if (hasEquivalentNew) continue

    // Check if the test was restructured (more new assertions than old ones)
    // If so, the removal is likely a refactor, not tampering
    if (newAssertions.length >= oldAssertions.length && newAssertions.length > 0) {
      // Test was restructured/expanded — NOT tampering, skip
      continue
    }

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

  return findings
}

/**
 * Run the assertion-tampering detector across all parsed files/hunks.
 * Now CONTEXT-AWARE: Checks if corresponding source files were also modified.
 * If source + test change together, assertion value updates are likely legitimate.
 */
export function detectAssertionTampering(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i

  // Build set of source files that were modified
  const changedSourceFiles = buildChangedSourceFiles(files)

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (!TEST_FILE_PATTERN.test(filePath)) continue

    // Check if a corresponding source file was also modified
    // Tier 1: Same-basename source changed ('specific')
    // Tier 2: Any source file changed ('any')
    // Tier 3: No source file changed (false)
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
