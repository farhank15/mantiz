import type { Finding, ParsedDiff, Confidence } from '../types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from '../language-registry'
import type { LanguageDetectionRules } from '../language-registry'

type MatchPattern = 'skip' | 'skip_with_reason' | 'focus' | 'if_false' | 'comment' | 'todo' | 'empty_test'

interface MatchResult {
  lineIndex: number
  lineContent: string
  pattern: MatchPattern
  lang: string
}

function getRules(lang: string | null): LanguageDetectionRules {
  if (lang && LANGUAGE_CONFIG[lang]) {
    return LANGUAGE_CONFIG[lang].detectionRules
  }
  return LANGUAGE_CONFIG.javascript.detectionRules
}

function scanHunk(hunkContent: string, baseLine: number, lang: string | null): MatchResult[] {
  const rules = getRules(lang)
  const lines = hunkContent.split('\n')
  const matches: MatchResult[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith(' ')) continue
    const content = line.slice(1).trim()
    const lineIdx = baseLine + i
    let matched = false

    if (!matched) {
      for (const pattern of rules.disabledAssertion.skipPatterns) {
        if (pattern.test(line) || pattern.test(content)) {
          // Check if it's a .todo() pattern (it.todo, test.todo)
          const isTodo = /\.todo\s*\(/.test(line) || /\.todo\s*\(/.test(content)
          if (isTodo) {
            matches.push({
              lineIndex: lineIdx,
              lineContent: content,
              pattern: 'todo',
              lang: lang || 'javascript',
            })
            matched = true
            break
          }

          // describe.skip always = HIGH (suite-level skip bypasses all tests)
          const isDescribeSkip = /describe\s*\.\s*skip\s*\(/.test(line)
          const hasReason = !isDescribeSkip && (
            /\.skip\s*\(\s*['"`]/.test(line)
            || /@pytest\.mark\.skip\s*\(/.test(line)
            || /@pytest\.mark\.skipif\s*\(/.test(line)
            || /@unittest\.skip\(/.test(line)
          )
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

    if (!matched) {
      for (const pattern of rules.disabledAssertion.focusPatterns) {
        if (pattern.test(line) || pattern.test(content)) {
          matches.push({ lineIndex: lineIdx, lineContent: content, pattern: 'focus', lang: lang || 'javascript' })
          matched = true
          break
        }
      }
    }

    if (!matched) {
      for (const pattern of rules.disabledAssertion.conditionalDisable) {
        if (pattern.test(line) || pattern.test(content)) {
          matches.push({ lineIndex: lineIdx, lineContent: content, pattern: 'if_false', lang: lang || 'javascript' })
          matched = true
          break
        }
      }
    }

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

  // Empty test body detection (JS/TS style)
  const EMPTY_TEST_INLINE = /\b(it|test)\s*\(\s*['"][^'"]+['"]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*\}/m
  const TEST_OPEN_LINE = /\b(it|test)\s*\(\s*['"][^'"]+['"]/m

  if (EMPTY_TEST_INLINE.test(hunkContent)) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('+') && EMPTY_TEST_INLINE.test(lines[i])) {
        const lineIdx = baseLine + i
        if (!matches.some(m => Math.abs(m.lineIndex - lineIdx) < 3)) {
          matches.push({ lineIndex: lineIdx, lineContent: lines[i].slice(1).trim(), pattern: 'empty_test', lang: lang || 'javascript' })
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('+')) continue
    if (!TEST_OPEN_LINE.test(lines[i])) continue
    const lineIdx = baseLine + i
    if (matches.some(m => Math.abs(m.lineIndex - lineIdx) < 3)) continue

    let hasAssertion = false
    let bodyEnded = false
    let braceDepth = 0
    let inBody = false

    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      const scanLine = lines[j]
      const openBrace = (scanLine.match(/{/g) || []).length
      const closeBrace = (scanLine.match(/}/g) || []).length
      braceDepth += openBrace - closeBrace
      if (braceDepth > 0) inBody = true
      if (inBody && braceDepth === 0) { bodyEnded = true; break }
      if (inBody && !/^\s*\/\//.test(scanLine)) {
        if (/\b(expect|assert|vi\.|jest\.|cy\.|should|assertion)\b/.test(scanLine)) {
          hasAssertion = true
          break
        }
      }
    }
    if (bodyEnded && !hasAssertion) {
      matches.push({ lineIndex: lineIdx, lineContent: lines[i].slice(1).trim(), pattern: 'empty_test', lang: lang || 'javascript' })
    }
  }

  return matches
}

function patternToConfidence(pattern: MatchPattern): Confidence {
  switch (pattern) {
    case 'skip': return 'high'
    case 'skip_with_reason': return 'low'
    case 'focus': return 'high'
    case 'if_false': return 'high'
    case 'empty_test': return 'medium'
    case 'comment': return 'medium'
    case 'todo': return 'low'
  }
}

function patternToExplanation(pattern: MatchPattern, lang: string): string {
  const langName = LANGUAGE_CONFIG[lang]?.name || lang
  switch (pattern) {
    case 'skip': return `Test or test suite skipped without reason (${langName}) — will be silently ignored by the test runner.`
    case 'skip_with_reason': return `Test or test suite skipped with a reason (${langName}) — may be legitimate but still disables the assertion.`
    case 'focus': return `Focused test or test suite (${langName}) — will cause the runner to skip all other tests in the project.`
    case 'if_false': return `Assertion wrapped in conditional that always evaluates to false (${langName}) — the assertion will never execute.`
    case 'comment': return `Assertion commented out (${langName}) — the test no longer verifies the expected behavior.`
    case 'empty_test': return `Empty test body (${langName}) — the test is defined but contains no assertions, so it passes without verifying anything.`
    case 'todo': return `TODO test placeholder (${langName}) — marks a test as pending/not yet implemented.`
  }
}

export function detectDisabledAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  const hasSourceChange = files.some(f => {
    const fp = f.newFile || f.oldFile || ''
    if (fp === '/dev/null' || !fp) return false
    return !isTestFile(fp) && detectLanguage(fp) !== null
  })

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    const lang = detectLanguage(filePath)
    if (!isTestFile(filePath)) continue

    for (const hunk of file.hunks) {
      const baseLine = hunk.newStart
      const matches = scanHunk(hunk.content, baseLine, lang)

      const hasActiveAssertions = /\bexpect\s*\(|\bassert\s*\(/.test(
        hunk.content.split('\n')
          .filter(l => l.startsWith('+') && !l.startsWith('+++'))
          .map(l => l.slice(1))
          .filter(l => !/^\s*\/\//.test(l))
          .join('\n')
      )
      const hasCommentedAssert = matches.some(m => m.pattern === 'comment')

      for (const match of matches) {
        let confidence = patternToConfidence(match.pattern)
        if (match.pattern === 'comment' && hasSourceChange) confidence = 'low'
        if (match.pattern === 'comment' && hasActiveAssertions && hasCommentedAssert) confidence = 'low'

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
