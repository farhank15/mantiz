import type { Finding, ParsedDiff } from '../types'

const NON_FUNCTIONAL_FILE_PATTERNS = [
  /\.(md|txt|json|yaml|yml|toml|cfg|ini|env|gitignore|editorconfig|npmrc)$/i,
  /\.(css|scss|sass|less|styl)$/i,
  /\.(svg|png|jpg|jpeg|gif|ico|webp|avif)$/i,
  /\.(lock|log|DS_Store)$/i,
  /^\.(github|vscode|husky|testsprite)\//,
  /^LICENSE$/i,
  /^CHANGELOG/i,
  /^README/i,
  /^CONTRIBUTING/i,
  /^CODE_OF_CONDUCT/i,
  /^SECURITY/i,
  /^SUPPORT/i,
]

const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i

export function isNonFunctional(filePath: string): boolean {
  return NON_FUNCTIONAL_FILE_PATTERNS.some((p) => p.test(filePath))
}

function hasMeaningfulChanges(hunkContent: string): boolean {
  const lines = hunkContent.split('\n')
  for (const line of lines) {
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    const content = line.slice(1).trim()
    if (!content) continue
    if (/^\/\/|^\/\*|^\*|^#/.test(content)) continue
    if (/^\s*$/.test(content)) continue
    return true
  }
  return false
}

function scanFiles(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  const nonFunctionalChanges = files.filter((f) => {
    const path = f.newFile || f.oldFile || ''
    return isNonFunctional(path)
  })

  const functionalChanges = files.filter((f) => {
    const path = f.newFile || f.oldFile || ''
    return !isNonFunctional(path)
  })

  if (nonFunctionalChanges.length > 0 && functionalChanges.length === 0) {
    const paths = nonFunctionalChanges.map((f) => f.newFile || f.oldFile).filter(Boolean).join(', ')
    findings.push({
      patternType: 'claim_diff_mismatch',
      filePath: paths,
      lineStart: 0,
      lineEnd: 0,
      confidence: 'high',
      explanation: `All changes are in non-functional files (${paths}). No test or source code was modified.`,
      evidenceExcerpt: `Non-functional files: ${paths}`,
    })
  }

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''
    if (TEST_FILE_PATTERN.test(filePath)) {
      const hasMeaningful = file.hunks.some((h) => hasMeaningfulChanges(h.content))
      if (!hasMeaningful) {
        findings.push({
          patternType: 'claim_diff_mismatch',
          filePath,
          lineStart: 0,
          lineEnd: 0,
          confidence: 'low',
          explanation: `Test file changed but only comments/whitespace — no actual test logic was modified.`,
          evidenceExcerpt: `${filePath}: Only cosmetic changes detected`,
        })
      }
    }
  }

  const hasSourceChanges = functionalChanges.some((f) => {
    const path = f.newFile || f.oldFile || ''
    return SOURCE_FILE_PATTERN.test(path) && !TEST_FILE_PATTERN.test(path)
  })
  const hasTestChanges = files.some((f) => {
    const path = f.newFile || f.oldFile || ''
    return TEST_FILE_PATTERN.test(path)
  })

  if (hasSourceChanges && !hasTestChanges && functionalChanges.length > 0) {
    const sourceFiles = functionalChanges
      .filter((f) => {
        const path = f.newFile || f.oldFile || ''
        return SOURCE_FILE_PATTERN.test(path) && !TEST_FILE_PATTERN.test(path)
      })
      .map((f) => f.newFile || f.oldFile)
      .filter(Boolean)
      .join(', ')

    findings.push({
      patternType: 'claim_diff_mismatch',
      filePath: sourceFiles,
      lineStart: 0,
      lineEnd: 0,
      confidence: 'medium',
      explanation: `Source code changed (${sourceFiles}) but no tests were updated. Claims of 'fixing tests' may be misleading.`,
      evidenceExcerpt: `Changed source: ${sourceFiles}`,
    })
  }

  return findings
}

export function detectClaimDiffMismatch(files: ParsedDiff[]): Finding[] {
  return scanFiles(files)
}
