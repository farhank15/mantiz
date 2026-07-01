import type { Finding, ParsedDiff, Confidence } from './types'

/**
 * Patterns for empty/silent catch blocks.
 */
const EMPTY_CATCH_PATTERN = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/
const COMMENT_ONLY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\/\/.*\}/
const TODO_ONLY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\/\/\s*(TODO|FIXME|HACK).*\}/
const EMPTY_FINALLY = /finally\s*\{\s*\}/
const CONSOLE_ONLY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*console\.\w+\s*\([^)]*\)\s*;?\s*\}/
const RETURN_NULL_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*return\s+(?:null|undefined|false|0|''|"")\s*;?\s*\}/

interface CatchMatch {
  line: string
  lineIndex: number
  pattern: 'empty' | 'comment_only' | 'todo' | 'console_only' | 'return_null' | 'empty_finally'
}

/**
 * Scan a single line for silent catch patterns.
 */
function scanLine(line: string, lineIndex: number): CatchMatch | null {
  // Only check added lines (+ prefix)
  if (!line.startsWith('+')) return null

  const content = line.slice(1)

  if (EMPTY_CATCH_PATTERN.test(content)) {
    return { line, lineIndex, pattern: 'empty' }
  }
  if (TODO_ONLY_CATCH.test(content)) {
    return { line, lineIndex, pattern: 'todo' }
  }
  if (COMMENT_ONLY_CATCH.test(content)) {
    return { line, lineIndex, pattern: 'comment_only' }
  }
  if (RETURN_NULL_CATCH.test(content)) {
    return { line, lineIndex, pattern: 'return_null' }
  }
  if (CONSOLE_ONLY_CATCH.test(content)) {
    return { line, lineIndex, pattern: 'console_only' }
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
      return 'medium'
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
 * Scan hunk content for silent catch patterns, including multi-line blocks.
 * A simple single-line check catches most cases, but we also scan for
 * multi-line catch blocks that might span several lines.
 */
function scanForSilentCatches(hunkContent: string, baseLine: number): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')

  // Single-line pattern matching
  for (let i = 0; i < lines.length; i++) {
    const match = scanLine(lines[i], baseLine + i)
    if (match) {
      findings.push({
        patternType: 'silent_catch_and_pass',
        filePath: '', // will be set by caller
        lineStart: match.lineIndex,
        lineEnd: match.lineIndex,
        confidence: patternToConfidence(match.pattern),
        explanation: patternToExplanation(match.pattern),
        evidenceExcerpt: lines[i].slice(1).trim().substring(0, 200),
      })
    }
  }

  // Multi-line catch block detection:
  // Look for patterns like:
  // + } catch (e) {
  // +   // TODO: handle this
  // + }
  // We look for a closing brace that closes a catch block and count content between
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Detect opening of a catch block on an added line
    if (line.startsWith('+') && /catch\s*(?:\([^)]*\))?\s*$/.test(line)) {
      // Check next few lines for empty/comment-only body
      let hasRealCode = false
      let hasTodo = false
      let hasConsole = false
      let hasComments = false
      let linesCollected: string[] = []

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextLine = lines[j]
        if (nextLine.startsWith('+') || nextLine.startsWith(' ')) {
          const trimmed = nextLine.slice(1).trim()
          if (trimmed === '}') {
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
                  explanation = 'Multi-line catch block only logs to console — errors are printed but not handled. Tests may pass despite failures.'
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

          const cleanLine = trimmed.replace(/^\s*\{\s*$/, '').trim()
          if (cleanLine) {
            linesCollected.push(cleanLine)
            const isComment = /^\/\/|^\/\*/.test(cleanLine)
            if (isComment) {
              hasComments = true
              if (/(TODO|FIXME|HACK)/i.test(cleanLine)) {
                hasTodo = true
              }
            } else if (/^console\.\w+\s*\(/.test(cleanLine)) {
              hasConsole = true
            } else {
              hasRealCode = true
            }
          }
        }
      }
    }
  }

  return findings
}

/**
 * Run the silent-catch-and-pass detector across all parsed files/hunks.
 */
export function detectSilentCatch(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    for (const hunk of file.hunks) {
      const hunkFindings = scanForSilentCatches(hunk.content, hunk.newStart)
      for (const f of hunkFindings) {
        f.filePath = filePath
        findings.push(f)
      }
    }
  }

  return findings
}
