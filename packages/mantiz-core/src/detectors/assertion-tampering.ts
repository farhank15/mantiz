import type { Finding, ParsedDiff, Confidence } from '../types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from '../language-registry'

function getAssertionRules(lang: string | null) {
  const config = lang && LANGUAGE_CONFIG[lang]
    ? LANGUAGE_CONFIG[lang].detectionRules
    : LANGUAGE_CONFIG.javascript.detectionRules
  return {
    assertionPattern: config.assertionTampering.assertionPattern,
    validAssertions: config.validAssertions,
  }
}

interface AssertionMatch {
  line: string
  lineIndex: number
  method: string
  value: string
  rawContent: string
}

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

function extractAssertions(line: string, lineIndex: number, lang: string | null): AssertionMatch | null {
  const content = line.slice(1)
  const commentSyntax = lang && LANGUAGE_CONFIG[lang]
    ? LANGUAGE_CONFIG[lang].commentSyntax
    : LANGUAGE_CONFIG.javascript.commentSyntax
  const isCommented = commentSyntax.singleLine.some(s => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(content))
  if (isCommented) return null
  if (!isSafeForRegex(content)) return null

  const rules = getAssertionRules(lang)

  // JS/TS
  if (lang === 'javascript' || lang === null) {
    const ASSERTION_PATTERN = /expect\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*;?\s*$/m
    const match = content.match(ASSERTION_PATTERN)
    if (!match) return null
    return { line, lineIndex, method: match[1], value: match[2].trim(), rawContent: content.substring(0, 120) }
  }

  // Python
  if (lang === 'python') {
    if (!/(?:assert|self\.assertEqual|self\.assertNotEqual|self\.assertTrue|self\.assertFalse)\s*\(/.test(content)) return null
    const valueMatch = content.match(/(?:assert|assertEqual|assertNotEqual|assertTrue|assertFalse)\s*\(?\s*([^,)]+)/)
    return { line, lineIndex, method: 'assert', value: valueMatch ? valueMatch[1].trim() : '<unknown>', rawContent: content.substring(0, 120) }
  }

  // Go
  if (lang === 'go') {
    if (!rules.assertionPattern.test(content)) return null
    const valueMatch = content.match(/(?:Equal|NoError|Nil|NotNil|True|False|Contains|Len)\s*\(\s*t\.\w*\s*,\s*([^,)]+)/)
    return { line, lineIndex, method: valueMatch ? valueMatch[1] : 'assert', value: valueMatch ? valueMatch[1].trim() : '<unknown>', rawContent: content.substring(0, 120) }
  }

  // Java
  if (lang === 'java') {
    const jRules = getAssertionRules('java')
    if (!jRules.assertionPattern.test(content)) return null
    const valueMatch = content.match(/(?:assertEquals|assertSame|assertNotSame)\s*\(\s*([^,)]+)/)
    return { line, lineIndex, method: 'assertEquals', value: valueMatch ? valueMatch[1].trim() : '<unknown>', rawContent: content.substring(0, 120) }
  }

  // Other languages
  if (rules.assertionPattern.test(content)) {
    const valueMatch = content.match(/(?:assertEquals|assertSame|expect)\s*\(?\s*['"]?([^,'")]+)/)
    return { line, lineIndex, method: 'assert', value: valueMatch ? valueMatch[1].trim() : '<unknown>', rawContent: content.substring(0, 120) }
  }

  return null
}

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

function hasCorrespondingSourceChange(testFilePath: string, changedSourceFiles: Set<string>): boolean {
  const basename = testFilePath.split('/').pop()?.replace(/\.(test|spec|_test|Test)\.?\w*$/, '').toLowerCase() || ''
  return changedSourceFiles.has(basename)
}

function findTamperedAssertions(
  hunkContent: string,
  baseLine: number,
  hasSourceChange: 'specific' | 'any' | false,
  lang: string | null,
): Finding[] {
  const findings: Finding[] = []
  const lines = hunkContent.split('\n')
  const oldAssertions: AssertionMatch[] = []
  const newAssertions: AssertionMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('-')) { const m = extractAssertions(line, baseLine + i, lang); if (m) oldAssertions.push(m) }
    else if (line.startsWith('+')) { const m = extractAssertions(line, baseLine + i, lang); if (m) newAssertions.push(m) }
  }

  for (const old of oldAssertions) {
    for (const nw of newAssertions) {
      if (old.method !== nw.method || old.value === nw.value) continue
      const normalize = (v: string) => v.replace(/['"`]/g, '').replace(/\s+/g, '')
      if (normalize(old.value) === normalize(nw.value)) continue

      if (hasSourceChange === 'specific') {
        findings.push({ patternType: 'assertion_tampering', filePath: '', lineStart: nw.lineIndex, lineEnd: nw.lineIndex, confidence: 'low' as Confidence, explanation: `Assertion value updated from ${old.value} to ${nw.value} — corresponding source file also changed.`, evidenceExcerpt: nw.rawContent })
      } else if (hasSourceChange === 'any') {
        findings.push({ patternType: 'assertion_tampering', filePath: '', lineStart: nw.lineIndex, lineEnd: nw.lineIndex, confidence: 'medium' as Confidence, explanation: `Assertion value updated from ${old.value} to ${nw.value} — source files also changed elsewhere.`, evidenceExcerpt: nw.rawContent })
      } else {
        const oldValueAppearsInNew = newAssertions.some(na => na.method === old.method && na.value === old.value)
        const nwValueExistedInOld = oldAssertions.some(oa => oa.method === nw.method && oa.value === nw.value)
        const isValueSwap = oldValueAppearsInNew && nwValueExistedInOld
        const oldIsQuoted = /^['"`]/.test(old.value) && /['"`]$/.test(old.value)
        const newIsUnquoted = /^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(nw.value) && !/^['"`]/.test(nw.value)
        const isRefactoring = oldIsQuoted && newIsUnquoted

        if (isRefactoring) {
          findings.push({ patternType: 'assertion_tampering', filePath: '', lineStart: nw.lineIndex, lineEnd: nw.lineIndex, confidence: 'low' as Confidence, explanation: `Assertion refactored: hardcoded value ${old.value} extracted to variable ${nw.value}.`, evidenceExcerpt: nw.rawContent })
        } else if (isValueSwap) {
          findings.push({ patternType: 'assertion_tampering', filePath: '', lineStart: nw.lineIndex, lineEnd: nw.lineIndex, confidence: 'medium' as Confidence, explanation: `Assertion values appear to be swapped/restructured.`, evidenceExcerpt: nw.rawContent })
        } else if (oldValueAppearsInNew && newAssertions.length >= oldAssertions.length) {
          findings.push({ patternType: 'assertion_tampering', filePath: '', lineStart: nw.lineIndex, lineEnd: nw.lineIndex, confidence: 'low' as Confidence, explanation: `Assertion value updated — old assertion retained and new value added, indicating test was expanded.`, evidenceExcerpt: nw.rawContent })
        } else {
          findings.push({ patternType: 'assertion_tampering', filePath: '', lineStart: nw.lineIndex, lineEnd: nw.lineIndex, confidence: 'high' as Confidence, explanation: `Assertion value changed from ${old.value} to ${nw.value} without any source code changes.`, evidenceExcerpt: nw.rawContent })
        }
      }
    }
  }

  for (const old of oldAssertions) {
    const hasEquivalentNew = newAssertions.some(n => n.method === old.method || n.value === old.value)
    if (hasEquivalentNew) continue
    if (newAssertions.length >= oldAssertions.length && newAssertions.length > 0) continue
    const removedConfidence = hasSourceChange ? 'low' as Confidence : 'medium' as Confidence
    findings.push({
      patternType: 'assertion_tampering', filePath: '', lineStart: old.lineIndex, lineEnd: old.lineIndex,
      confidence: removedConfidence,
      explanation: hasSourceChange ? `Assertion "${old.method}(${old.value})" was removed alongside source changes.` : `Assertion "${old.method}(${old.value})" was removed without source changes.`,
      evidenceExcerpt: old.rawContent,
    })
  }

  return findings
}

export function detectAssertionTampering(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const changedSourceFiles = buildChangedSourceFiles(files)

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (!isTestFile(filePath)) continue
    const lang = detectLanguage(filePath)
    const specificMatch = hasCorrespondingSourceChange(filePath, changedSourceFiles)
    const hasSourceChange = specificMatch ? 'specific' : changedSourceFiles.size > 0 ? 'any' : false

    for (const hunk of file.hunks) {
      const hunkFindings = findTamperedAssertions(hunk.content, hunk.newStart, hasSourceChange, lang)
      for (const f of hunkFindings) { f.filePath = filePath; findings.push(f) }
    }
  }

  return findings
}
