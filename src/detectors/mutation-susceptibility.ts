/**
 * Mantiz Mutation Susceptibility Analyzer
 *
 * STATIC analysis of mutation testing vulnerability.
 * Instead of running actual mutation testing (which requires a test runner),
 * this analyzes code structure to ESTIMATE how likely tests would survive mutation.
 *
 * Academic basis:
 * - Papadakis et al. (2018) — Mutation score is the definitive indicator of test verification
 * - Inozemtseva & Holmes (2014) — Coverage alone is not sufficient
 * - Liu et al. (2025) — AI agents generate tests that "pass but don't verify"
 *
 * Detection patterns:
 * 1. Low Assertion Density — Few assertions relative to code complexity
 * 2. Generic Matcher Usage — Using toBeTruthy() instead of toBe(42) — weaker verification
 * 3. No Negative Assertions — Not testing error cases
 * 4. Shallow Path Coverage — Only testing happy path
 * 5. Mock Overuse — Mocks bypass actual logic, reducing mutation detection
 *
 * Each finding indicates a potential "surviving mutant" — code changes that
 * wouldn't be caught by the existing tests.
 */

import type { Finding, ParsedDiff } from './types'
import { LANGUAGE_CONFIG, detectLanguage, isTestFile } from './language-registry'

// ─── Constants ───────────────────────────────────────────────────

/** Minimum assertion count per function before we flag low density */
const MIN_ASSERTIONS_PER_FUNCTION = 2

/** Minimum assertion lines per 100 lines of code */
const MIN_ASSERTION_DENSITY = 2 // 2 assertions per 100 lines (was 3 — lowered to reduce FP on small files)

/** Minimum lines for meaningful mutation analysis */
const MIN_LINES_FOR_MUTATION_ANALYSIS = 50 // Skip files under 50 lines (was 35 — raised to reduce FP on small test stubs)

/** Small file threshold — files under this get more lenient density check */
const SMALL_FILE_LINES = 80 // Files under 80 lines use relaxed threshold (was 50)

/** Relaxed density for files under SMALL_FILE_LINES */
const RELAXED_DENSITY = 1.0 // 1 assertion per 100 lines for small files (was 0.5 — raised to reduce FP)

// ─── Types ───────────────────────────────────────────────────────

interface CodeBlock {
  type: 'function' | 'test_block' | 'class'
  name: string
  lineStart: number
  lineEnd: number
  body: string
  assertions: number
  hasNegativeAssertion: boolean
  hasMock: boolean
  complexity: number
}

interface MutationAnalysis {
  totalFunctions: number
  totalAssertions: number
  totalLines: number
  blocks: CodeBlock[]
  assertionDensity: number // assertions per 100 lines
  genericMatcherCount: number
  negativeAssertionCount: number
  mockCount: number
  vulnerabilityScore: number // 0-100, higher = more vulnerable
}

// ─── Pattern Helpers ─────────────────────────────────────────────

/**
 * Get assertion regex and valid assertions for a language.
 */
function getLanguagePatterns(lang: string) {
  const config = LANGUAGE_CONFIG[lang]
  if (!config) return null

  return {
    assertionPattern: config.detectionRules.assertionTampering.assertionPattern,
    validAssertions: config.detectionRules.validAssertions,
    mockPatterns: config.detectionRules.mockToAvoid.mockPatterns,
  }
}

/**
 * Identify code blocks (functions, test blocks) from source lines.
 * Uses indentation-aware heuristic block detection.
 */
function extractCodeBlocks(lines: string[], lang: string | null): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const patterns = lang ? getLanguagePatterns(lang) : null

  const functionPatterns = getFunctionPatterns(lang)
  const testPatterns = getTestBlockPatterns(lang)

  let currentBlock: CodeBlock | null = null
  let blockIndent = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.search(/\S/)

    // Check for function/block start
    if (functionPatterns.some(p => p.test(line))) {
      if (currentBlock) blocks.push(currentBlock)

      const name = extractFunctionName(line, lang)
      currentBlock = {
        type: 'function',
        name,
        lineStart: i + 1,
        lineEnd: i + 1,
        body: line,
        assertions: 0,
        hasNegativeAssertion: false,
        hasMock: false,
        complexity: 0,
      }
      blockIndent = indent
      continue
    }

    // Test block patterns (it, test, describe, etc.)
    if (testPatterns.some(p => p.test(line))) {
      if (currentBlock) blocks.push(currentBlock)

      const name = extractTestName(line, lang)
      currentBlock = {
        type: 'test_block',
        name,
        lineStart: i + 1,
        lineEnd: i + 1,
        body: line,
        assertions: 0,
        hasNegativeAssertion: false,
        hasMock: false,
        complexity: 0,
      }
      blockIndent = indent
      continue
    }

    // If we're inside a block, analyze the line
    if (currentBlock) {
      currentBlock.lineEnd = i + 1
      currentBlock.body += '\n' + line

      // Count assertions (using language-specific patterns)
      if (isAssertionLine(line, lang, patterns)) {
        currentBlock.assertions++
      }

      // Detect negative assertions (testing error cases)
      if (isNegativeAssertion(line, lang)) {
        currentBlock.hasNegativeAssertion = true
      }

      // Detect mocks
      if (patterns?.mockPatterns.some(p => p.test(line))) {
        currentBlock.hasMock = true
      }

      // Count complexity indicators
      if (isComplexityIndicator(line, lang)) {
        currentBlock.complexity++
      }

      // Check if block ended (indent decreased to less than block indent)
      if (indent >= 0 && indent < blockIndent && line.trim()) {
        blocks.push(currentBlock)
        currentBlock = null
        blockIndent = -1
      }
    }
  }

  // Flush last block
  if (currentBlock) {
    blocks.push(currentBlock)
  }

  return blocks
}

/**
 * Get language-specific function definition patterns.
 */
function getFunctionPatterns(lang: string | null): RegExp[] {
  const common: RegExp[] = [
    /^\s*(?:function|def|fn|func|sub)\s+\w+\s*\(/i,
    /^\s*(?:public|private|protected|internal)?\s*(?:async\s+)?(?:function|def|fn)?\s*\w+\s*\(/i,
    /^\s*const\s+\w+\s*=\s*(?:async\s*)?\(?/,
    /^\s*(?:export\s+)?(?:default\s+)?(?:function|class)\s+\w+/,
  ]

  switch (lang) {
    case 'python':
      return [/^\s*def\s+\w+\s*\(/, /^\s*class\s+\w+/, /^\s*@\w+\.\w+\s*$/, ...common]
    case 'go':
      return [/^\s*func\s+\w+\s*\(/, ...common]
    case 'java':
      return [/^\s*(?:public|private|protected)\s+\w+\s+\w+\s*\(/, /^\s*@\w+\s*$/, ...common]
    case 'ruby':
      return [/^\s*def\s+\w+/, /^\s*describe\s+/, /^\s*context\s+/, ...common]
    case 'rust':
      return [/^\s*fn\s+\w+\s*\(/, /^\s*#\[test\]/, /^\s*#\[tokio::test\]/, ...common]
    case 'php':
      return [/^\s*(?:public|private|protected)?\s*function\s+\w+\s*\(/, /^\s*@\w+\s*$/, ...common]
    default:
      return common
  }
}

/**
 * Get language-specific test block patterns.
 */
function getTestBlockPatterns(lang: string | null): RegExp[] {
  const common: RegExp[] = [
    /\b(it|test|describe)\s*\(/i,
  ]

  switch (lang) {
    case 'python':
      return [/^\s*def\s+test_\w+\s*\(/, /^\s*class\s+\w+Test/, ...common]
    case 'go':
      return [/^\s*func\s+Test\w+\s*\(/, ...common]
    case 'java':
      return [/@Test/, /public\s+void\s+test\w+\s*\(/, ...common]
    case 'ruby':
      return [/^\s*(it|specify|example|scenario)\s+['"]/, /^\s*describe\s+/, /^\s*context\s+/]
    case 'rust':
      return [/^\s*#\[test\]/, /^\s*fn\s+\w+/, ...common]
    case 'php':
      return [/^\s*function\s+test\w+\s*\(/, /@test/, ...common]
    default:
      return common
  }
}

/**
 * Extract function name from a definition line.
 */
function extractFunctionName(line: string, _lang: string | null): string {
  const patterns = [
    /(?:function|def|fn|func)\s+(\w+)/i,
    /(\w+)\s*=\s*(?:async\s*)?\(/,
    /(?:class|struct)\s+(\w+)/,
    /const\s+(\w+)\s*=\s*/,
  ]

  for (const p of patterns) {
    const match = line.match(p)
    if (match) return match[1]
  }

  return 'anonymous'
}

/**
 * Extract test name from a test block line.
 */
function extractTestName(line: string, _lang: string | null): string {
  const patterns = [
    /(?:it|test|describe|scenario)\s*\(?\s*['"]([^'"]+)['"]/i,
    /def\s+(test_\w+)/i,
    /func\s+(Test\w+)/i,
    /public\s+void\s+(test\w+)/i,
  ]

  for (const p of patterns) {
    const match = line.match(p)
    if (match) return match[1]
  }

  return 'unnamed_test'
}

/**
 * Check if a line contains an assertion.
 */
function isAssertionLine(line: string, _lang: string | null, patterns: ReturnType<typeof getLanguagePatterns> | null): boolean {
  if (!patterns) {
    // Fallback: check for common assertion patterns
    return /(?:assert|expect|should)\s*\(/.test(line)
  }

  return patterns.assertionPattern.test(line) ||
    /(?:expect|should)\s*\(/.test(line)
}

/**
 * Check if a line contains a negative assertion (error case testing).
 */
function isNegativeAssertion(line: string, _lang: string | null): boolean {
  const patterns = [
    /toThrow/,
    /assertRaises/,
    /assertThrows/,
    /rejects/,
    /Error/,
    /raises/,
    /panic/,
    /fail\s*\(/i,
    /error/,
    /exception/,
  ]

  return patterns.some(p => p.test(line))
}

/**
 * Check if a line contributes to code complexity.
 */
function isComplexityIndicator(line: string, _lang: string | null): boolean {
  const patterns = [
    /\bif\s*\(/,
    /\belif\s*\(/,
    /\belse\b/,
    /\bfor\s*\(/,
    /\bwhile\s*\(/,
    /\bswitch\s*\(/,
    /\bcase\s+/,
    /\bcatch\s*\(/,
    /\b&&\b/,
    /\b\|\|\b/,
    /\?.*:/,  // ternary
    /\bmap\b/,
    /\bfilter\b/,
    /\breduce\b/,
    /\.forEach/,
  ]

  return patterns.some(p => p.test(line))
}

// ─── Analysis Engine ─────────────────────────────────────────────

/**
 * Analyze a single file's code for mutation susceptibility.
 */
function analyzeFile(filePath: string, hunkContent: string): MutationAnalysis | null {
  const lang = detectLanguage(filePath)

  // Only analyze test files
  if (!isTestFile(filePath)) return null

  // Extract only added lines (the test content)
  const lines = hunkContent.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
  const codeLines = lines.map(l => l.slice(1))

  if (codeLines.length < MIN_LINES_FOR_MUTATION_ANALYSIS) return null // Too short to analyze

  const blocks = extractCodeBlocks(codeLines, lang)
  const totalLines = codeLines.length

  let totalAssertions = 0
  let genericMatcherCount = 0
  let negativeAssertionCount = 0
  let mockCount = 0

  for (const block of blocks) {
    totalAssertions += block.assertions
    if (block.hasNegativeAssertion) negativeAssertionCount++
    if (block.hasMock) mockCount++
  }

  // Calculate assertion density (assertions per 100 lines)
  const assertionDensity = totalLines > 0 ? (totalAssertions / totalLines) * 100 : 0

  // Count generic matchers
  const genericMatcherPatterns = [
    /toBeTruthy/,
    /toBeFalsy/,
    /toBeDefined/,
    /toBeUndefined/,
    /toBeNull/,
    /assertTrue/,
    /assertFalse/,
    /assertNull/,
    /assertNotNull/,
  ]
  for (const line of codeLines) {
    if (genericMatcherPatterns.some(p => p.test(line))) {
      genericMatcherCount++
    }
  }

  // Calculate vulnerability score (0-100)
  let vulnerabilityScore = 0

  // Factor 1: Low assertion density (score contribution: 0-30)
  // Small files (< 50 lines) use relaxed threshold to avoid penalizing concise tests
  const effectiveDensityMin = totalLines < SMALL_FILE_LINES ? RELAXED_DENSITY : MIN_ASSERTION_DENSITY
  if (assertionDensity < effectiveDensityMin) {
    const densityRatio = assertionDensity / effectiveDensityMin
    // For small files, reduce factor 1 weight by half
    const weight = totalLines < SMALL_FILE_LINES ? 15 : 30
    vulnerabilityScore += Math.round(weight * (1 - densityRatio))
  }

  // Factor 2: No negative assertions (score contribution: 0-25)
  // Small files are exempt — they naturally may not have error cases
  if (totalLines >= SMALL_FILE_LINES && negativeAssertionCount === 0 && blocks.filter(b => b.type === 'function' || b.type === 'test_block').length > 0) {
    vulnerabilityScore += 25
  }

  // Factor 3: Generic matchers (score contribution: 0-20)
  const totalChecks = totalAssertions || 1
  const genericRatio = genericMatcherCount / totalChecks
  vulnerabilityScore += Math.round(20 * genericRatio)

  // Factor 4: Mock overuse (score contribution: 0-15)
  const functionCount = blocks.filter(b => b.type === 'function').length || 1
  const mockRatio = mockCount / functionCount
  vulnerabilityScore += Math.round(15 * Math.min(mockRatio, 1))

  // Factor 5: Complexity without assertions (score contribution: 0-10)
  const assertionsPerFunc = functionCount > 0 ? totalAssertions / functionCount : 0
  if (assertionsPerFunc < MIN_ASSERTIONS_PER_FUNCTION && functionCount > 0) {
    const ratio = assertionsPerFunc / MIN_ASSERTIONS_PER_FUNCTION
    vulnerabilityScore += Math.round(10 * (1 - ratio))
  }

  // Cap at 100
  vulnerabilityScore = Math.min(100, vulnerabilityScore)

  return {
    totalFunctions: blocks.length,
    totalAssertions,
    totalLines,
    blocks,
    assertionDensity: Math.round(assertionDensity * 10) / 10,
    genericMatcherCount,
    negativeAssertionCount,
    mockCount,
    vulnerabilityScore,
  }
}

/**
 * Check if there's a comment-only/empty catch that suppresses errors.
 * This is a key contributor to mutation survival (mutations in try block
 * wouldn't be caught if catch is empty).
 */
function countEmptyCatches(codeLines: string[]): number {
  let count = 0
  const catchPattern = /^\s*catch\s*(?:\([^)]*\))?\s*\{\s*[\/\s]*\}/
  for (const line of codeLines) {
    if (catchPattern.test(line)) count++
  }
  return count
}

/**
 * Check assertion coverage across the diff.
 */
function checkCoverageGaps(codeLines: string[]): string[] {
  const gaps: string[] = []

  // Check if there are conditional statements without corresponding assertions
  let inConditional = false
  let conditionalLine = 0
  let hasAssertionNearby = false

  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i]

    if (/\bif\s*\(/.test(line) || /\bfor\s*\(/.test(line) || /\bwhile\s*\(/.test(line)) {
      if (inConditional && !hasAssertionNearby) {
        gaps.push(`Conditional at line ${conditionalLine + 1} has no nearby assertion`)
      }
      inConditional = true
      conditionalLine = i
      hasAssertionNearby = false
    }

    if (inConditional && /(?:expect|assert|should)/.test(line)) {
      hasAssertionNearby = true
    }

    // End of block or line that decreases indent
    if (inConditional && (line.trim() === '}' || line.trim() === 'end' || line.match(/^\s*\)\s*;/))) {
      if (!hasAssertionNearby) {
        gaps.push(`Conditional at line ${conditionalLine + 1}:${i + 1} has no assertion`)
      }
      inConditional = false
    }
  }

  // Flush last
  if (inConditional && !hasAssertionNearby) {
    gaps.push(`Conditional at line ${conditionalLine + 1} has no nearby assertion`)
  }

  return gaps
}

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Detect mutation susceptibility in all test files.
 *
 * This analyzer looks for patterns that indicate tests would
 * FAIL to catch mutations (surviving mutants).
 *
 * High vulnerability score means:
 * - Low assertion density (few assertions per line of code)
 * - Generic matchers used instead of specific ones
 * - No negative/error case testing
 * - Heavy mock usage that bypasses actual logic
 * - Code complexity without corresponding assertions
 */
export function detectMutationSusceptibility(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue

    // Only analyze potential test files (where mutation testing matters most)
    if (!isTestFile(filePath)) continue

    for (const hunk of file.hunks) {
      const analysis = analyzeFile(filePath, hunk.content)
      if (!analysis) continue

      // Determine severity based on vulnerability score
      let confidence: 'high' | 'medium' | 'low'

      if (analysis.vulnerabilityScore >= 65) {
        confidence = 'high'
      } else if (analysis.vulnerabilityScore >= 45) {
        confidence = 'medium'
      } else {
        continue // Skip <45 — raised from 35 to reduce FP (28 FP @ 30% precision)
      }

      const evidenceLines = [
        `Vulnerability Score: ${analysis.vulnerabilityScore}/100`,
        `Assertion Density: ${analysis.assertionDensity} per 100 lines (threshold: ${MIN_ASSERTION_DENSITY})`,
        `Generic Matchers: ${analysis.genericMatcherCount}`,
        `Negative Assertions: ${analysis.negativeAssertionCount}`,
        `Mock Usage: ${analysis.mockCount}`,
        `Functions: ${analysis.totalFunctions}`,
      ]

      // Add coverage gap info
      const codeLines = hunk.content.split('\n').filter(l => l.startsWith('+'))
      const gaps = checkCoverageGaps(codeLines.map(l => l.slice(1)))
      if (gaps.length > 0) {
        evidenceLines.push(`Coverage Gaps: ${gaps[0]}`)
        if (gaps.length > 1) {
          evidenceLines.push(`  +${gaps.length - 1} more gap(s)`)
        }
      }

      // Add empty catch info
      const emptyCatches = countEmptyCatches(codeLines.map(l => l.slice(1)))
      if (emptyCatches > 0) {
        evidenceLines.push(`Empty Catch Blocks: ${emptyCatches} (mutations in try will survive)`)
      }

      findings.push({
        patternType: 'mutation_susceptibility' as const,
        filePath,
        lineStart: analysis.blocks[0]?.lineStart || 1,
        lineEnd: analysis.blocks[analysis.blocks.length - 1]?.lineEnd || analysis.totalLines,
        confidence,
        explanation: `🧬 [Mutation] Test suite has ${analysis.vulnerabilityScore}/100 vulnerability score — ${calculateExplanation(analysis)}`,
        evidenceExcerpt: evidenceLines.join('\n'),
      })
    }
  }

  return findings
}

/**
 * Generate a human-readable explanation of the vulnerability.
 */
function calculateExplanation(analysis: MutationAnalysis): string {
  const issues: string[] = []

  if (analysis.assertionDensity < MIN_ASSERTION_DENSITY) {
    issues.push('low assertion density')
  }
  if (analysis.negativeAssertionCount === 0 && analysis.totalFunctions > 0) {
    issues.push('no negative/error testing')
  }
  if (analysis.genericMatcherCount > analysis.totalAssertions * 0.5) {
    issues.push('overuse of generic matchers')
  }
  if (analysis.mockCount > 0) {
    issues.push('heavy mocking may bypass real logic')
  }

  if (issues.length === 0) return 'moderate risk — consider adding more specific assertions'
  return issues.join(', ')
}
