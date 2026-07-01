import type { Finding, ParsedDiff } from '../types'

const ASSERTION_PATTERN =
  /expect\s*\([^)]*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(([^)]*)\)\s*$/m

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

function findTamperedAssertions(hunkContent: string, baseLine: number): Finding[] {
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

        findings.push({
          patternType: 'assertion_tampering',
          filePath: '',
          lineStart: nw.lineIndex,
          lineEnd: nw.lineIndex,
          confidence: 'high',
          explanation: `Assertion value changed from ${old.value} to ${nw.value} without corresponding source logic change.`,
          evidenceExcerpt: nw.line.slice(0, 200),
        })
      }
    }
  }

  for (const old of oldAssertions) {
    const hasEquivalentNew = newAssertions.some(
      (n) => n.method === old.method || n.value === old.value
    )
    if (!hasEquivalentNew) {
      findings.push({
        patternType: 'assertion_tampering',
        filePath: '',
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

export function detectAssertionTampering(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

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
