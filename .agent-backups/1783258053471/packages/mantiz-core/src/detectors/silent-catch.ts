import type { Finding, ParsedDiff, Confidence } from '../types'
import { detectLanguage, LANGUAGE_CONFIG } from '../language-registry'

const FALLBACK_EMPTY_CATCH = /\bcatch\s*(?:\s*\([^)]*\))?\s*\{[\s\/]*\}/
const FALLBACK_TODO_CATCH = /\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i
const FALLBACK_CONSOLE_CATCH = /\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*console\.\w+\s*\([^)]*\)\s*;?\s*\}/
const RETURN_NULL_CATCH = /\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*return\s+(?:null|undefined|false|0|''|"")\s*;?\s*\}/
const COMMENT_ONLY_CATCH = /\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*\/\/.*\}/
const EMPTY_FINALLY = /finally\s*\{\s*\}/

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

function getCatchRules(lang: string | null): CatchRules {
  if (lang && LANGUAGE_CONFIG[lang]) {
    const rules = LANGUAGE_CONFIG[lang].detectionRules.silentCatch
    return {
      emptyCatchPatterns: rules.emptyCatchPatterns.length > 0 ? rules.emptyCatchPatterns : [FALLBACK_EMPTY_CATCH],
      todoCatchPatterns: rules.todoCatchPatterns.length > 0 ? rules.todoCatchPatterns : [FALLBACK_TODO_CATCH],
      consoleOnlyCatchPatterns: rules.consoleOnlyCatchPatterns.length > 0 ? rules.consoleOnlyCatchPatterns : [FALLBACK_CONSOLE_CATCH],
    }
  }
  return {
    emptyCatchPatterns: [FALLBACK_EMPTY_CATCH],
    todoCatchPatterns: [FALLBACK_TODO_CATCH],
    consoleOnlyCatchPatterns: [FALLBACK_CONSOLE_CATCH],
  }
}

function scanLine(line: string, lineIndex: number, rules: CatchRules): CatchMatch | null {
  if (!line.startsWith('+')) return null
  const content = line.slice(1)

  for (const pattern of rules.emptyCatchPatterns) { if (pattern.test(content)) return { line, lineIndex, pattern: 'empty' } }
  for (const pattern of rules.todoCatchPatterns) { if (pattern.test(content)) return { line, lineIndex, pattern: 'todo' } }
  for (const pattern of rules.consoleOnlyCatchPatterns) { if (pattern.test(content)) return { line, lineIndex, pattern: 'console_only' } }

  if (RETURN_NULL_CATCH.test(content)) return { line, lineIndex, pattern: 'return_null' }
  if (COMMENT_ONLY_CATCH.test(content)) return { line, lineIndex, pattern: 'comment_only' }
  if (EMPTY_FINALLY.test(content)) return { line, lineIndex, pattern: 'empty_finally' }

  return null
}

function patternToConfidence(pattern: CatchMatch['pattern']): Confidence {
  switch (pattern) {
    case 'empty': return 'high'
    case 'return_null': return 'high'
    case 'todo': return 'medium'
    case 'console_only': return 'low'
    case 'comment_only': return 'medium'
    case 'empty_finally': return 'low'
  }
}

function patternToExplanation(pattern: CatchMatch['pattern']): string {
  switch (pattern) {
    case 'empty': return 'Empty catch block — silently swallows all exceptions.'
    case 'return_null': return 'Catch block returns null/undefined/false — silently converts errors into falsy values.'
    case 'todo': return 'Catch block contains only a TODO comment — error handling is deferred.'
    case 'console_only': return 'Catch block only logs to console — errors are printed but not handled.'
    case 'comment_only': return 'Catch block only has a comment — no actual error handling.'
    case 'empty_finally': return 'Empty finally block — no cleanup or recovery logic.'
  }
}

function getCatchOpenPattern(lang: string | null): RegExp {
  switch (lang) {
    case 'python': return /except\s*\w*\s*:/i
    case 'ruby': return /rescue\s*\w*/i
    case 'go': return /if\s+err\s*!=\s*nil/i
    default: return /\bcatch\s*(?:\s*\([^)]*\))?\s*\{?/i
  }
}

function getBlockCloseChar(lang: string | null): string | null {
  switch (lang) {
    case 'python': case 'ruby': return null
    default: return '}'
  }
}

function scanForSilentCatches(hunkContent: string, baseLine: number, lang: string | null): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')
  const rules = getCatchRules(lang)

  for (let i = 0; i < lines.length; i++) {
    const match = scanLine(lines[i], baseLine + i, rules)
    if (match) {
      findings.push({
        patternType: 'silent_catch_and_pass', filePath: '', lineStart: match.lineIndex, lineEnd: match.lineIndex,
        confidence: patternToConfidence(match.pattern), explanation: patternToExplanation(match.pattern),
        evidenceExcerpt: lines[i].slice(1).trim().substring(0, 200),
      })
    }
  }

  const catchOpenPattern = getCatchOpenPattern(lang)      const blockClose = getBlockCloseChar(lang)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.startsWith('+')) continue
        if (!catchOpenPattern.test(line)) continue
        // Skip multi-line detection for Python/Ruby (use indentation, not braces)
        if (blockClose === null) continue

        let hasRealCode = false, hasTodo = false, hasConsole = false, hasComments = false

        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j]
          if (!nextLine.startsWith('+') && !nextLine.startsWith(' ')) continue
          const trimmed = nextLine.slice(1).trim()
          const isBlockEnd = trimmed === blockClose || trimmed.startsWith(blockClose)

      if (isBlockEnd) {
        if (!hasRealCode) {
          const alreadyFlagged = findings.some(f => f.lineStart === baseLine + i && f.patternType === 'silent_catch_and_pass')
          if (!alreadyFlagged) {
            let confidence: Confidence = 'high'
            let explanation = 'Multi-line empty catch block.'
            if (hasTodo) { confidence = 'medium'; explanation = 'Multi-line catch block contains only TODO comments.' }
            else if (hasConsole) { confidence = 'medium'; explanation = 'Multi-line catch block only logs to console.' }
            else if (hasComments) { confidence = 'medium'; explanation = 'Multi-line catch block contains only comments.' }
            findings.push({
              patternType: 'silent_catch_and_pass', filePath: '', lineStart: baseLine + i, lineEnd: baseLine + j,
              confidence, explanation,
              evidenceExcerpt: `${lines[i].slice(1).trim()} ... ${nextLine.slice(1).trim()}`,
            })
          }
        }
        break
      }

      const cleanLine = trimmed.replace(/^\s*\{\s*$/, '').trim()
      if (cleanLine) {
        const isComment = /^\/\/|^\/\*|^#/.test(cleanLine)
        if (isComment) { hasComments = true; if (/(TODO|FIXME|HACK)/i.test(cleanLine)) hasTodo = true }
        else if (/^console\.\w+\s*\(/.test(cleanLine) || /^print\s*\(/.test(cleanLine) || /^puts?\s+/.test(cleanLine) || /^echo\s+/.test(cleanLine)) hasConsole = true
        else hasRealCode = true
      }
    }
  }

  return findings
}

export function detectSilentCatch(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    // Skip React UI files
    if (file.newFile === '/dev/null') continue
    if (/\.(tsx|jsx)$/i.test(filePath)) continue
    const lang = detectLanguage(filePath)

    for (const hunk of file.hunks) {
      const hunkFindings = scanForSilentCatches(hunk.content, hunk.newStart, lang)
      for (const f of hunkFindings) { f.filePath = filePath; findings.push(f) }
    }
  }

  return findings
}
