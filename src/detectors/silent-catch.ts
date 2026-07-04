import type { Finding, ParsedDiff, Confidence } from './types'
import { detectLanguage, LANGUAGE_CONFIG } from './language-registry'

// ─── Fallback Patterns for JS/TS ──────────────────────────────────
// Used when a pattern type isn't defined in the language registry.
const FALLBACK_EMPTY_CATCH = /catch\s*(?:\s*\([^)]*\))?\s*\{[\s\/]*\}/
const FALLBACK_TODO_CATCH = /catch\s*(?:\s*\([^)]*\))?\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i
const FALLBACK_CONSOLE_CATCH = /catch\s*(?:\s*\([^)]*\))?\s*\{\s*console\.\w+\s*\([^)]*\)\s*;?\s*\}/

// ─── Telemetry/Analytics exceptions ───────────────────────────────
// Empty or near-empty catches in telemetry/analytics code are intentional.
// The error is non-critical — silencing prevents noise, not evidence.
const TELEMETRY_FILE_PATTERNS = [
  /\/analytics\//i,
  /\/telemetry\//i,
  /\/tracking\//i,
  /\/metrics\//i,
  /\/monitoring\//i,
  /\/instrument(?:ation)?\//i,
]

interface CatchMatch {
  line: string
  lineIndex: number
  pattern: 'empty' | 'comment_only' | 'todo' | 'console_only' | 'return_null' | 'empty_finally'
}

interface CatchRules {
  emptyCatchPatterns: RegExp[]
  todoCatchPatterns: RegExp[]
  consoleOnlyCatchPatterns: RegExp[]
}

/**
 * Get catch patterns for a language, falling back to JS/TS if not found.
 */
function getCatchRules(lang: string | null): CatchRules {
  if (lang && LANGUAGE_CONFIG[lang]) {
    const rules = LANGUAGE_CONFIG[lang].detectionRules.silentCatch
    return {
      emptyCatchPatterns: rules.emptyCatchPatterns.length > 0 ? rules.emptyCatchPatterns : [FALLBACK_EMPTY_CATCH],
      todoCatchPatterns: rules.todoCatchPatterns.length > 0 ? rules.todoCatchPatterns : [FALLBACK_TODO_CATCH],
      consoleOnlyCatchPatterns: rules.consoleOnlyCatchPatterns.length > 0 ? rules.consoleOnlyCatchPatterns : [FALLBACK_CONSOLE_CATCH],
    }
  }
  // Default to JS/TS fallback patterns
  return {
    emptyCatchPatterns: [FALLBACK_EMPTY_CATCH],
    todoCatchPatterns: [FALLBACK_TODO_CATCH],
    consoleOnlyCatchPatterns: [FALLBACK_CONSOLE_CATCH],
  }
}

/**
 * Additional patterns for JS/TS-like languages (not in registry but useful).
 */
const RETURN_NULL_CATCH = /catch\s*(?:\s*\([^)]*\))?\s*\{\s*return\s+(?:null|undefined|false|0|''|"")\s*;?\s*\}/
const COMMENT_ONLY_CATCH = /catch\s*(?:\s*\([^)]*\))?\s*\{\s*\/\/.*\}/
const EMPTY_FINALLY = /finally\s*\{\s*\}/

/**
 * Scan a single line for silent catch patterns.
 */
function scanLine(line: string, lineIndex: number, rules: CatchRules): CatchMatch | null {
  // Only check added lines (+ prefix)
  if (!line.startsWith('+')) return null

  const content = line.slice(1)

  // Check language-specific empty catch patterns
  for (const pattern of rules.emptyCatchPatterns) {
    if (pattern.test(content)) {
      return { line, lineIndex, pattern: 'empty' }
    }
  }

  // Check language-specific todo patterns
  for (const pattern of rules.todoCatchPatterns) {
    if (pattern.test(content)) {
      return { line, lineIndex, pattern: 'todo' }
    }
  }

  // Check language-specific console-only patterns
  for (const pattern of rules.consoleOnlyCatchPatterns) {
    if (pattern.test(content)) {
      return { line, lineIndex, pattern: 'console_only' }
    }
  }

  // Universal patterns (apply to all C-like languages)
  if (RETURN_NULL_CATCH.test(content)) {
    return { line, lineIndex, pattern: 'return_null' }
  }
  if (COMMENT_ONLY_CATCH.test(content)) {
    return { line, lineIndex, pattern: 'comment_only' }
  }
  if (EMPTY_FINALLY.test(content)) {
    return { line, lineIndex, pattern: 'empty_finally' }
  }

  return null
}

/**
 * Map catch pattern to confidence.
 */
function patternToConfidence(pattern: CatchMatch['pattern']): Confidence {
  switch (pattern) {
    case 'empty':
      return 'high'
    case 'return_null':
      return 'high'
    case 'todo':
      return 'medium'
    case 'console_only':
      return 'low'        // Demoted: console.error(e) IS legitimate error handling, not silent
    case 'comment_only':
      return 'medium'
    case 'empty_finally':
      return 'low'
  }
}

/**
 * Map catch pattern to explanation.
 */
function patternToExplanation(pattern: CatchMatch['pattern']): string {
  switch (pattern) {
    case 'empty':
      return 'Empty catch block — silently swallows all exceptions. Errors will never surface.'
    case 'return_null':
      return 'Catch block returns null/undefined/false — silently converts errors into falsy values.'
    case 'todo':
      return 'Catch block contains only a TODO comment — error handling is intentionally deferred.'
    case 'console_only':
      return 'Catch block only logs to console — errors are printed but not handled. Tests may pass despite failures.'
    case 'comment_only':
      return 'Catch block only has a comment — no actual error handling logic.'
    case 'empty_finally':
      return 'Empty finally block — no cleanup or recovery logic.'
  }
}

/**
 * Get language-specific patterns for multi-line catch block detection.
 * Returns a regex that matches the opening of a catch/except/rescue block.
 */
function getCatchOpenPattern(lang: string | null): RegExp {
  switch (lang) {
    case 'python':
      return /except\s*\w*\s*:/i
    case 'ruby':
      return /rescue\s*\w*/i
    case 'go':
      return /if\s+err\s*!=\s*nil/i
    default:
      return /catch\s*(?:\s*\([^)]*\))?\s*\{?/i
  }
}

/**
 * Get language-specific pattern for block closing.
 */
function getBlockCloseChar(lang: string | null): string | null {
  switch (lang) {
    case 'python':
    case 'ruby':
      return null  // Skip multi-line — uses indentation, not braces
    case 'go':
      return '}'
    default:
      return '}'
  }
}

/**
 * Scan hunk content for silent catch patterns, including multi-line blocks.
 */
function scanForSilentCatches(hunkContent: string, baseLine: number, lang: string | null): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')
  const rules = getCatchRules(lang)

  // Single-line pattern matching
  for (let i = 0; i < lines.length; i++) {
    const match = scanLine(lines[i], baseLine + i, rules)
    if (match) {
      findings.push({
        patternType: 'silent_catch_and_pass',
        filePath: '',
        lineStart: match.lineIndex,
        lineEnd: match.lineIndex,
        confidence: patternToConfidence(match.pattern),
        explanation: patternToExplanation(match.pattern),
        evidenceExcerpt: lines[i].slice(1).trim().substring(0, 200),
      })
    }
  }

  // Multi-line catch block detection
  const catchOpenPattern = getCatchOpenPattern(lang)
  const blockClose = getBlockCloseChar(lang)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('+')) continue
    if (!catchOpenPattern.test(line)) continue

    // Check next few lines for empty/comment-only body
    // Skip if this is Rust's if-let pattern (not a catch block)
    const catchLine = line.slice(1).trim()
    if (/if\s+let\s+(Err|None)/i.test(catchLine)) continue
    // Skip Rust expect()/unwrap() — these panic on error, not silent
    if (/\.(expect|unwrap)\s*\(/.test(catchLine)) continue

    let hasRealCode = false
    let hasTodo = false
    let hasConsole = false
    let hasComments = false

    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const nextLine = lines[j]
      if (!nextLine.startsWith('+') && !nextLine.startsWith(' ')) continue

      const trimmed = nextLine.slice(1).trim()

      // Skip multi-line detection for Python/Ruby (use indentation, not braces)
      if (blockClose === null) break
      const isBlockEnd = trimmed === blockClose || trimmed.startsWith(blockClose)

      if (isBlockEnd) {
        if (!hasRealCode) {
          const alreadyFlagged = findings.some(
            (f) => f.lineStart === baseLine + i && f.patternType === 'silent_catch_and_pass'
          )
          if (!alreadyFlagged) {
            let confidence: Confidence = 'high'
            let explanation = 'Multi-line empty catch block — opens and closes with no meaningful error handling.'

            if (hasTodo) {
              confidence = 'medium'
              explanation = 'Multi-line catch block contains only a TODO comment — error handling is intentionally deferred.'
            } else if (hasConsole) {
              confidence = 'medium'
              explanation = 'Multi-line catch block only logs to console — errors are printed but not handled.'
            } else if (hasComments) {
              confidence = 'medium'
              explanation = 'Multi-line catch block contains only comments — no actual error handling logic.'
            }

            findings.push({
              patternType: 'silent_catch_and_pass',
              filePath: '',
              lineStart: baseLine + i,
              lineEnd: baseLine + j,
              confidence,
              explanation,
              evidenceExcerpt: `${lines[i].slice(1).trim()} ... ${nextLine.slice(1).trim()}`,
            })
          }
        }
        break
      }

      // Analyze the line content
      const cleanLine = trimmed.replace(/^\s*\{\s*$/, '').trim()
      if (cleanLine) {
        const isComment = /^\/\/|^\/\*|^#/.test(cleanLine)
        if (isComment) {
          hasComments = true
          if (/(TODO|FIXME|HACK)/i.test(cleanLine)) {
            hasTodo = true
          }
        } else if (/^console\.\w+\s*\(/.test(cleanLine) || /^print\s*\(/.test(cleanLine) || /^puts?\s+/.test(cleanLine) || /^echo\s+/.test(cleanLine)) {
          hasConsole = true
        } else {
          hasRealCode = true
        }
      }
    }
  }

  return findings
}

/**
 * Check if the file path is in a telemetry/analytics directory.
 * Silent catches in telemetry are intentional and not deceptive.
 */
function isTelemetryFile(filePath: string): boolean {
  return TELEMETRY_FILE_PATTERNS.some(p => p.test(filePath))
}

/**
 * Run the silent-catch-and-pass detector across all parsed files/hunks.
 * Multi-language support via Language Registry.
 */
export function detectSilentCatch(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    // Ignore deleted files
    if (file.newFile === '/dev/null') continue

    // Ignore React UI component files (.tsx, .jsx) for silent catch detection
    if (/\.(tsx|jsx)$/i.test(filePath)) continue

    // Skip telemetry/analytics files — empty catches here are intentional
    if (isTelemetryFile(filePath)) continue

    // Detect language for pattern matching
    const lang = detectLanguage(filePath)

    for (const hunk of file.hunks) {
      const hunkFindings = scanForSilentCatches(hunk.content, hunk.newStart, lang)
      for (const f of hunkFindings) {
        f.filePath = filePath
        findings.push(f)
      }
    }
  }

  return findings
}
