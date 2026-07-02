import type { Finding, ParsedDiff } from './types'

/**
 * Non-functional file patterns — files that don't affect test behavior.
 */
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

/**
 * Test-related file patterns.
 */
const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i

/**
 * File importance classification for weighted scoring.
 */
const CONFIG_EXT_PATTERN = /\.(json|yaml|yml|toml|cfg|ini)$/i
const DOCS_EXT_PATTERN = /\.(md|txt|css|scss|sass|less|styl|svg|png|jpg|jpeg|gif|ico|webp|avif)$/i

export type FileImportance = 'core' | 'test' | 'source' | 'config' | 'artifact' | 'docs'

export function classifyImportance(filePath: string): FileImportance {
  if (TEST_FILE_PATTERN.test(filePath)) return 'test'
  if (SOURCE_FILE_PATTERN.test(filePath)) return 'source'
  if (CONFIG_EXT_PATTERN.test(filePath)) return 'config'
  if (DOCS_EXT_PATTERN.test(filePath)) return 'docs'
  return 'docs'
}

/**
 * Known bot authors whose PRs typically only touch non-functional files 
 * (dependencies, config, translations, formatting, releases).
 * When such a bot opens a PR where all changes are non-functional, 
 * Mantiz downgrades the claim-diff mismatch severity from HIGH → LOW.
 */
const KNOWN_BOTS = new Set([
  // Dependency update bots
  'renovate[bot]',
  'dependabot[bot]',
  'dependabot',
  'greenkeeper[bot]',
  'snyk-bot',
  'snyk[bot]',
  'pyup-bot',
  'scala-steward',
  // Platform automation bots
  'angular-robot',
  'github-actions[bot]',
  'github-actions',
  // Translation / localization
  'crowdin[bot]',
  'weblate[bot]',
  'gitlocalize[bot]',
  // Release & versioning
  'changesets[bot]',
  'semantic-release-bot',
  'release-drafter[bot]',
  // Documentation & contribution
  'allcontributors[bot]',
  // Code quality & publishing
  'deepsource-autofix[bot]',
  'pre-commit-ci[bot]',
  'pkg-pr-new[bot]',
  // Asset optimization
  'imgbot[bot]',
])

/**
 * PR title patterns that honestly describe dependency/configuration updates.
 */
const HONEST_DEP_TITLE_PATTERN = /^(build|chore|ci|fix|refactor)\s*:.*(depend|update|bump|upgrade|pin|roll|lock|unlock|migrate)/i

/**
 * Check if a PR context suggests a legitimate dependency update.
 * Only called when ALL files are already confirmed non-functional (Flag 1 context),
 * so no need to re-check files — just check author + title signals.
 */
function isLegitimateDepUpdate(
  prContext: { title?: string; author?: string } | undefined,
): boolean {
  if (!prContext) return false
  const isBot = prContext.author ? KNOWN_BOTS.has(prContext.author) : false
  const isHonestTitle = prContext.title ? HONEST_DEP_TITLE_PATTERN.test(prContext.title) : false
  return isBot || isHonestTitle
}

/**
 * Check if a file path is non-functional (docs, config, styles, etc.)
 */
export function isNonFunctional(filePath: string): boolean {
  return NON_FUNCTIONAL_FILE_PATTERNS.some((p) => p.test(filePath))
}

/**
 * Check if a hunk contains meaningful code changes (not just whitespace/comments).
 */
function hasMeaningfulChanges(hunkContent: string): boolean {
  const lines = hunkContent.split('\n')
  for (const line of lines) {
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    const content = line.slice(1).trim()
    if (!content) continue
    // Skip pure comment changes
    if (/^\/\/|^\/\*|^\*|^#/.test(content)) continue
    // Skip whitespace-only changes
    if (/^\s*$/.test(content)) continue
    return true
  }
  return false
}

/**
 * Scan files for claim-diff mismatch: non-functional changes or missing test/behavior changes.
 */
function scanFiles(files: ParsedDiff[], prContext?: { title?: string; author?: string }): Finding[] {
  const findings: Finding[] = []

  // Categorize files
  const nonFunctionalChanges = files.filter((f) => {
    const path = f.newFile || f.oldFile || ''
    return isNonFunctional(path)
  })

  const functionalChanges = files.filter((f) => {
    const path = f.newFile || f.oldFile || ''
    return !isNonFunctional(path)
  })

  // Flag 1: All changes are non-functional
  if (nonFunctionalChanges.length > 0 && functionalChanges.length === 0) {
    const paths = nonFunctionalChanges
      .map((f) => f.newFile || f.oldFile)
      .filter(Boolean)
      .join(', ')

    // Check if this is a legitimate dependency update (bot author or honest title)
    const isLegitDep = isLegitimateDepUpdate(prContext)

    findings.push({
      patternType: 'claim_diff_mismatch',
      filePath: paths,
      lineStart: 0,
      lineEnd: 0,
      confidence: isLegitDep ? 'low' : 'high',
      explanation: isLegitDep
        ? `All changes are in non-functional files (${paths}) — likely a legitimate dependency update.`
        : `All changes are in non-functional files (${paths}). No test or source code was modified.`,
      evidenceExcerpt: `Non-functional files: ${paths}`,
    })
  }

  // Flag 2: Test files changed but no meaningful logic changes
  // ⚠️ Only flag if total changed lines > 3 to avoid FP on tiny import/comment changes
  for (const file of files) {
    const filePath = file.newFile || file.oldFile || ''

    // If it's a test file with changes
    if (TEST_FILE_PATTERN.test(filePath)) {
      // Count total changed lines across all hunks
      const totalLines = file.hunks.reduce((sum, h) => sum + h.content.split('\n').length, 0)
      if (totalLines < 5) continue // Skip tiny test changes (<5 lines total)

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

  // Flag 3: Source files changed but NO test files changed
  const hasSourceChanges = functionalChanges.some((f) => {
    const path = f.newFile || f.oldFile || ''
    return SOURCE_FILE_PATTERN.test(path) && !TEST_FILE_PATTERN.test(path)
  })
  const hasTestChanges = files.some((f) => {
    const path = f.newFile || f.oldFile || ''
    return TEST_FILE_PATTERN.test(path)
  })

  const TEST_CLAIM_KEYWORDS = /\b(test|spec|assert|expect|check|coverage|validation|smoke)\b/i
  const claimsTestMod = prContext?.title ? TEST_CLAIM_KEYWORDS.test(prContext.title) : false

  if (hasSourceChanges && !hasTestChanges && functionalChanges.length > 0 && claimsTestMod) {
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

/**
 * Run the claim-diff-mismatch detector across all parsed files.
 * Pass prContext (title, author) to reduce noise on legitimate bot/dep PRs.
 */
export function detectClaimDiffMismatch(
  files: ParsedDiff[],
  prContext?: { title?: string; author?: string },
): Finding[] {
  return scanFiles(files, prContext)
}
