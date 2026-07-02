/**
 * Mantiz Disabled Assertion Detector — Multi-Language
 *
 * Detects tests that have been disabled or skipped across multiple languages.
 * Uses the Language Registry for per-language patterns.
 *
 * Supported: JavaScript/TypeScript, Python, Go, Java, Ruby, Rust
 */

import type { Finding, ParsedDiff, Confidence } from './types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from './language-registry'
import type { LanguageDetectionRules } from './language-registry'

// ─── Types ───────────────────────────────────────────────────────

type MatchPattern = 'skip' | 'skip_with_reason' | 'focus' | 'if_false' | 'comment' | 'todo' | 'empty_test'

interface MatchResult {
  lineIndex: number
  lineContent: string
  pattern: MatchPattern
  lang: string
}

// ─── Multi-Language Scan ─────────────────────────────────────────

/**
 * Get detection rules for a given language, falling back to JS/TS if unknown.
 */
function getRules(lang: string | null): LanguageDetectionRules {
  if (lang && LANGUAGE_CONFIG[lang]) {
    return LANGUAGE_CONFIG[lang].detectionRules
  }
  // Default to JavaScript/TypeScript rules
  return LANGUAGE_CONFIG.javascript.detectionRules
}

/**
 * Scan a single hunk's content lines and return matches for disabled assertions.
 * Uses language-specific patterns from the Language Registry.
 */
function scanHunk(hunkContent: string, baseLine: number, lang: string | null): MatchResult[] {
  const rules = getRules(lang)
  const lines = hunkContent.split('\n')
  const matches: MatchResult[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip unchanged context lines
    if (line.startsWith(' ')) continue

    const content = line.slice(1).trim()
    const lineIdx = baseLine + i
    let matched = false

    // Check skip patterns (language-specific)
    if (!matched) {
      for (const pattern of rules.disabledAssertion.skipPatterns) {
        if (pattern.test(line) || pattern.test(content)) {
          // Check if the skip has a reason/description string
          // e.g. `.skip("reason")` vs `.skip()` or `xit`
          const hasReason = /\.skip\s*\(\s*['"`]/.test(line)
            || /@pytest\.mark\.skip\s*\(/.test(line)
            || /@pytest\.mark\.skipif\s*\(/.test(line)
            || /@unittest\.skip\(/.test(line)
          matches.push({
            lineIndex: lineIdx,
            lineContent: content,
            pattern: hasReason ? 'skip_with_reason' : 'skip',
            lang: lang || 'javascript',
          })
          matched = true
          break
        }
      }
    }

    // Check focus patterns
    if (!matched) {
      for (const pattern of rules.disabledAssertion.focusPatterns) {
        if (pattern.test(line) || pattern.test(content)) {
          matches.push({ lineIndex: lineIdx, lineContent: content, pattern: 'focus', lang: lang || 'javascript' })
          matched = true
          break
        }
      }
    }

    // Check conditional disable (if(false), if(0), etc.)
    if (!matched) {
      for (const pattern of rules.disabledAssertion.conditionalDisable) {
        if (pattern.test(line) || pattern.test(content)) {
          matches.push({ lineIndex: lineIdx, lineContent: content, pattern: 'if_false', lang: lang || 'javascript' })
          matched = true
          break
        }
      }
    }

    // Check commented-out assertions
    if (!matched) {
      for (const pattern of rules.disabledAssertion.commentPatterns) {
        if (pattern.test(line) || pattern.test(content)) {
          matches.push({ lineIndex: lineIdx, lineContent: content, pattern: 'comment', lang: lang || 'javascript' })
          matched = true
          break
        }
      }
    }
  }

  // Check for empty test bodies (test/it block with no expect/assert inside)
  // Pattern: it('name', () => { }) or test('name', async () => { })
  // These are tests that exist but don't verify anything
  if (EMPTY_TEST_PATTERN.test(hunkContent)) {
    // Find the specific line with the empty test
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('+') && EMPTY_TEST_PATTERN.test(lines[i])) {
        const lineIdx = baseLine + i
        // Only add if not already matched by another pattern
        if (!matches.some(m => Math.abs(m.lineIndex - lineIdx) < 3)) {
          matches.push({ lineIndex: lineIdx, lineContent: lines[i].slice(1).trim(), pattern: 'empty_test', lang: lang || 'javascript' })
        }
      }
    }
  }

  return matches
}

/**
 * Map match pattern to confidence level.
 */
function patternToConfidence(pattern: MatchPattern): Confidence {
  switch (pattern) {
    case 'skip':
      return 'high'        // Skip without reason — clear bypass
    case 'skip_with_reason':
      return 'medium'      // Skip with reason — possibly legitimate
    case 'focus':
      return 'high'
    case 'if_false':
      return 'high'
    case 'empty_test':
      return 'medium'
    case 'comment':
      return 'medium'
    case 'todo':
      return 'low'
  }
}

/**
 * Map match pattern + language to a human-readable explanation.
 */
function patternToExplanation(pattern: MatchPattern, lang: string): string {
  const langName = LANGUAGE_CONFIG[lang]?.name || lang

  switch (pattern) {
    case 'skip':
      return `Test or test suite skipped without reason (${langName}) — will be silently ignored by the test runner.`
    case 'skip_with_reason':
      return `Test or test suite skipped with a reason (${langName}) — may be legitimate but still disables the assertion.`
    case 'focus':
      return `Focused test or test suite (${langName}) — will cause the runner to skip all other tests in the project.`
    case 'if_false':
      return `Assertion wrapped in conditional that always evaluates to false (${langName}) — the assertion will never execute.`
    case 'comment':
      return `Assertion commented out (${langName}) — the test no longer verifies the expected behavior.`
    case 'empty_test':
      return `Empty test body (${langName}) — the test is defined but contains no assertions, so it passes without verifying anything.`
    case 'todo':
      return `TODO comment on a test line (${langName}) — may indicate intentionally disabled verification.`
  }
}

// ─── Empty Test Body Pattern ──────────────────────────────────────
// Tests that exist but have empty bodies — they pass without asserting anything.
// Matches: it('name', () => { }) or test('name', async () => { })
const EMPTY_TEST_PATTERN = /\b(it|test)\s*\(\s*['"][^'"]+['"]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}/m

// ─── Main Detector ──────────────────────────────────────────────

/**
 * Run the disabled-assertion detector across all parsed files/hunks.
 * Supports multiple languages via the Language Registry.
 */
export function detectDisabledAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  // Compute once: did any source file change? (for context-aware comment confidence)
  const hasSourceChange = files.some(f => {
    const fp = f.newFile || f.oldFile || ''
    if (fp === '/dev/null' || !fp) return false
    return !isTestFile(fp) && detectLanguage(fp) !== null
  })

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    // Ignore deleted files
    if (file.newFile === '/dev/null') continue

    // Detect language from file path
    const lang = detectLanguage(filePath)

    // Only scan test files (using universal test file detection)
    if (!isTestFile(filePath)) continue

    for (const hunk of file.hunks) {
      const baseLine = hunk.newStart
      const matches = scanHunk(hunk.content, baseLine, lang)

      // Check if hunk has active (non-commented) assertions nearby
      // If commented assertions coexist with active assertions in same hunk,
      // the comments are likely temporary refactoring artifacts, not permanent disables
      const hasActiveAssertions = /\bexpect\s*\(|\bassert\s*\(/.test(
        hunk.content.split('\n')
          .filter(l => l.startsWith('+') && !l.startsWith('+++'))
          .map(l => l.slice(1))
          .filter(l => !/^\s*\/\//.test(l)) // exclude commented lines
          .join('\n')
      )
      const hasCommentedAssert = matches.some(m => m.pattern === 'comment' || m.pattern === 'todo')

      for (const match of matches) {
        let confidence = patternToConfidence(match.pattern)

        // Context-aware: if source code also changed, commented assertions
        // are likely refactoring artifacts (e.g., old code commented out during cleanup)
        if (match.pattern === 'comment' && hasSourceChange) {
          confidence = 'low'
        }

        // Context-aware: if hunk has BOTH commented assertions and active assertions,
        // the comments are temporary refactoring, not permanent disables
        if ((match.pattern === 'comment' || match.pattern === 'todo') && hasActiveAssertions && hasCommentedAssert) {
          confidence = 'low'
        }

        findings.push({
          patternType: 'disabled_assertion',
          filePath,
          lineStart: match.lineIndex,
          lineEnd: match.lineIndex,
          confidence,
          explanation: `${patternToExplanation(match.pattern, match.lang)} [${match.lang.toUpperCase()}]`,
          evidenceExcerpt: match.lineContent.slice(0, 200),
        })
      }
    }
  }

  return findings
}
