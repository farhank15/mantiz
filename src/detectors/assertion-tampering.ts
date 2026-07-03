/**
 * Mantiz Assertion Tampering Detector — Multi-Language
 *
 * Detects test assertions that have been weakened or tampered with.
 * Uses the Language Registry for per-language patterns.
 *
 * Core logic:
 * 1. Extract old (prefixed with -) and new (prefixed with +) assertion lines from diff hunks
 * 2. Compare values between old and new assertions
 * 3. CONTEXT-AWARE: If corresponding source files also changed, reduce confidence
 *    (coordinated test + source updates are legitimate, not tampering)
 *
 * Supported: JavaScript/TypeScript (full), Python/Go/Java/Ruby/PHP (basic)
 */

import type { Finding, ParsedDiff, Confidence } from './types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from './language-registry'

/**
 * Get assertion patterns for a language, falling back to JS/TS if unknown.
 */
function getAssertionRules(lang: string | null) {
  const config = lang && LANGUAGE_CONFIG[lang]
    ? LANGUAGE_CONFIG[lang].detectionRules
    : LANGUAGE_CONFIG.javascript.detectionRules

  return {
    assertionPattern: config.assertionTampering.assertionPattern,
    validAssertions: config.validAssertions,
  }
}

/**
 * Extract assertion details from a diff line.
 */
interface AssertionMatch {
  line: string
  lineIndex: number
  method: string
  value: string
  rawContent: string
}

/**
 * Max line length to prevent ReDoS on assertion regex.
 */
const MAX_SAFE_LINE_LENGTH = 500
const MAX_PARENS_DEPTH = 20

function isSafeForRegex(line: string): boolean {
  if (line.length > MAX_SAFE_LINE_LENGTH) return false
  let depth = 0
  for (const ch of line) {
    if (ch === '(') { depth++; if (depth > MAX_PARENS_DEPTH) return false }
    if (ch === ')') depth--
  }
  return true
}

/**
 * Extract assertion calls from a diff line.
 * For JS/TS: matches expect(...).toBe(VALUE) pattern with full extraction.
 * For other languages: matches the language-specific assertion pattern.
 */
function extractAssertions(line: string, lineIndex: number, lang: string | null): AssertionMatch | null {
  const content = line.slice(1) // strip +/- prefix

  // Skip commented lines
  const commentSyntax = lang && LANGUAGE_CONFIG[lang]
    ? LANGUAGE_CONFIG[lang].commentSyntax
    : LANGUAGE_CONFIG.javascript.commentSyntax

  const isCommented = commentSyntax.singleLine.some(s => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(content))
  if (isCommented) return null

  if (!isSafeForRegex(content)) return null

  const rules = getAssertionRules(lang)

  // JS/TS: Full extraction with expect().matcher(VALUE) pattern
  if (lang === 'javascript' || lang === null) {
    const ASSERTION_PATTERN =
      /expect\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*;?\s*$/m

    const match = content.match(ASSERTION_PATTERN)
    if (!match) return null

    return {
      line,
      lineIndex,
      method: match[1],
      value: match[2].trim(),
      rawContent: content.substring(0, 120),
    }
  }

  // Python: assert x == y, assertEqual(x, y)
  if (lang === 'python') {
    const PY_ASSERT_PATTERN = /(?:assert|self\.assertEqual|self\.assertNotEqual|self\.assertTrue|self\.assertFalse|self\.assertIs|self\.assertIn|self\.assertNotIn)\s*\(/
    if (!PY_ASSERT_PATTERN.test(content)) return null

    // Extract the value after the assertion keyword
    const valueMatch = content.match(/(?:assert|assertEqual|assertNotEqual|assertTrue|assertFalse)\s*\(?\s*([^,)]+)/)
    return {
      line,
      lineIndex,
      method: 'assert',
      value: valueMatch ? valueMatch[1].trim() : '<unknown>',
      rawContent: content.substring(0, 120),
    }
  }

  // Go: assert.Equal(t, expected, actual), require.NoError(t, err)
  if (lang === 'go') {
    const GO_ASSERT_PATTERN = rules.assertionPattern
    if (!GO_ASSERT_PATTERN.test(content)) return null

    // Extract the expected value (2nd argument after t)
    const valueMatch = content.match(/(?:Equal|NoError|Nil|NotNil|True|False|Contains|Len)\s*\(\s*t\.\w*\s*,\s*([^,)]+)/)
    return {
      line,
      lineIndex,
      method: valueMatch ? valueMatch[1] : 'assert',
      value: valueMatch ? valueMatch[1].trim() : '<unknown>',
      rawContent: content.substring(0, 120),
    }
  }

  // Java: assertEquals(expected, actual)
  if (lang === 'java') {
    const rules = getAssertionRules('java')
    if (!rules.assertionPattern.test(content)) return null

    const valueMatch = content.match(/(?:assertEquals|assertSame|assertNotSame)\s*\(\s*([^,)]+)/)
    return {
      line,
      lineIndex,
      method: 'assertEquals',
      value: valueMatch ? valueMatch[1].trim() : '<unknown>',
      rawContent: content.substring(0, 120),
    }
  }

  // PHP/Ruby/Rust: basic match via language-specific pattern
  if (rules.assertionPattern.test(content)) {
    const valueMatch = content.match(/(?:assertEquals|assertSame|expect)\s*\(?\s*['"]?([^,'")]+)/)
    return {
      line,
      lineIndex,
      method: 'assert',
      value: valueMatch ? valueMatch[1].trim() : '<unknown>',
      rawContent: content.substring(0, 120),
    }
  }

  return null
}

/**
 * Build a set of source file basenames that were modified in this diff.
 */
function buildChangedSourceFiles(files: ParsedDiff[]): Set<string> {
  const sourceFiles = new Set<string>()

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''
    if (file.newFile === '/dev/null') continue

    const lang = detectLanguage(filePath)
    if (!lang) continue

    const config = LANGUAGE_CONFIG[lang]
    const isSource = config.sourcePatterns.some(p => p.test(filePath))
    const isTest = config.testPatterns.some(p => p.test(filePath))

    if (isSource && !isTest) {
      const basename = filePath.split('/').pop()?.replace(/\.\w+$/, '') || ''
      if (basename) sourceFiles.add(basename.toLowerCase())
    }
  }

  return sourceFiles
}

/**
 * Check if a test file path has a corresponding source file that was also modified.
 */
function hasCorrespondingSourceChange(testFilePath: string, changedSourceFiles: Set<string>): boolean {
  const basename = testFilePath.split('/').pop()?.replace(/\.(test|spec|_test|Test)\.?\w*$/, '').toLowerCase() || ''
  return changedSourceFiles.has(basename)
}

/**
 * Find paired old/new assertions in the same hunk context.
 */
function findTamperedAssertions(
  hunkContent: string,
  baseLine: number,
  hasSourceChange: 'specific' | 'any' | false,
  lang: string | null,
): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  // Collect all old and new assertion matches
  const oldAssertions: AssertionMatch[] = []
  const newAssertions: AssertionMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('-')) {
      const match = extractAssertions(line, baseLine + i, lang)
      if (match) oldAssertions.push(match)
    } else if (line.startsWith('+')) {
      const match = extractAssertions(line, baseLine + i, lang)
      if (match) newAssertions.push(match)
    }
  }

  // Check for value changes between old and new assertions
  for (const old of oldAssertions) {
    for (const nw of newAssertions) {
      if (old.method !== nw.method || old.value === nw.value) continue

      // Normalize values for comparison (strip quotes, whitespace)
      const normalize = (v: string) => v.replace(/['"`]/g, '').replace(/\s+/g, '')
      if (normalize(old.value) === normalize(nw.value)) continue

      // Context-aware confidence
      if (hasSourceChange === 'specific') {
        findings.push({
          patternType: 'assertion_tampering',
          filePath: '',
          lineStart: nw.lineIndex,
          lineEnd: nw.lineIndex,
          confidence: 'low' as Confidence,
          explanation: `Assertion value updated from ${old.value} to ${nw.value} — corresponding source file also changed, indicating a coordinated update.`,
          evidenceExcerpt: nw.rawContent,
        })
      } else if (hasSourceChange === 'any') {
        findings.push({
          patternType: 'assertion_tampering',
          filePath: '',
          lineStart: nw.lineIndex,
          lineEnd: nw.lineIndex,
          confidence: 'medium' as Confidence,
          explanation: `Assertion value updated from ${old.value} to ${nw.value} — source files also changed elsewhere, may be a coordinated update.`,
          evidenceExcerpt: nw.rawContent,
        })
      } else {
        // No source change — check if it's a value swap or expansion
        const oldValueAppearsInNew = newAssertions.some(na => na.method === old.method && na.value === old.value)
        const nwValueExistedInOld = oldAssertions.some(oa => oa.method === nw.method && oa.value === nw.value)
        const isValueSwap = oldValueAppearsInNew && nwValueExistedInOld
        const isExpansion = oldValueAppearsInNew

        if (isValueSwap) {
          findings.push({
            patternType: 'assertion_tampering',
            filePath: '',
            lineStart: nw.lineIndex,
            lineEnd: nw.lineIndex,
            confidence: 'medium' as Confidence,
            explanation: `Assertion values appear to be swapped/restructured — likely a coordinated test update rather than tampering.`,
            evidenceExcerpt: nw.rawContent,
          })
        } else if (isExpansion && newAssertions.length >= oldAssertions.length) {
          findings.push({
            patternType: 'assertion_tampering',
            filePath: '',
            lineStart: nw.lineIndex,
            lineEnd: nw.lineIndex,
            confidence: 'low' as Confidence,
            explanation: `Assertion value updated — old assertion retained and new value added, indicating test was expanded rather than tampered.`,
            evidenceExcerpt: nw.rawContent,
          })
        } else {
          findings.push({
            patternType: 'assertion_tampering',
            filePath: '',
            lineStart: nw.lineIndex,
            lineEnd: nw.lineIndex,
            confidence: 'high' as Confidence,
            explanation: `Assertion value changed from ${old.value} to ${nw.value} without any source code changes to justify it.`,
            evidenceExcerpt: nw.rawContent,
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

    if (newAssertions.length >= oldAssertions.length && newAssertions.length > 0) {
      continue // Restructured/expanded — not tampering
    }

    const removedConfidence = hasSourceChange ? 'low' as Confidence : 'medium' as Confidence

    findings.push({
      patternType: 'assertion_tampering',
      filePath: '',
      lineStart: old.lineIndex,
      lineEnd: old.lineIndex,
      confidence: removedConfidence,
      explanation: hasSourceChange
        ? `Assertion "${old.method}(${old.value})" was removed alongside source changes — likely a legitimate refactor.`
        : `Assertion "${old.method}(${old.value})" was removed without source changes — may indicate test weakening.`,
      evidenceExcerpt: old.rawContent,
    })
  }

  return findings
}

/**
 * Run the assertion-tampering detector across all parsed files/hunks.
 * Multi-language support via Language Registry.
 */
export function detectAssertionTampering(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  // Build set of source files that were modified (language-agnostic)
  const changedSourceFiles = buildChangedSourceFiles(files)

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue

    // Only scan test files (language-agnostic via registry)
    if (!isTestFile(filePath)) continue

    // Detect language for pattern matching
    const lang = detectLanguage(filePath)

    // Check if a corresponding source file was also modified
    const specificMatch = hasCorrespondingSourceChange(filePath, changedSourceFiles)
    const hasSourceChange = specificMatch ? 'specific'
      : changedSourceFiles.size > 0 ? 'any'
      : false

    for (const hunk of file.hunks) {
      const hunkFindings = findTamperedAssertions(hunk.content, hunk.newStart, hasSourceChange, lang)
      for (const f of hunkFindings) {
        f.filePath = filePath
        findings.push(f)
      }
    }
  }

  return findings
}
