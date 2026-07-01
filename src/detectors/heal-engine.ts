/**
 * Mantiz Auto-Heal Engine
 *
 * Takes scan findings and generates actual fixed code.
 * Mantiz doesn't JUST detect cheating — it can automatically
 * revert the cheating patterns and restore honest code.
 *
 * This is the "Refactoring Gate" — if Mantiz detects an AI agent
 * trying to hide errors (e.g., adding empty catch {}, using .skip()),
 * it can auto-generate the honest version of the code.
 *
 * Usage:
 *   npx mantiz scan --fix          # Auto-fix all fixable issues
 *   npx mantiz scan --fix=interactive  # Prompt before each fix
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Finding, ParsedDiff } from './types'

export interface CodePatch {
  /** The pattern type this patch addresses */
  patternType: string
  /** Human-readable description of the fix */
  description: string
  /** Original (broken) code pattern */
  originalCode: string
  /** Fixed (honest) code replacement */
  fixedCode: string
  /** File path where the issue was found */
  filePath: string
  /** Line number where the fix applies */
  lineStart: number
  /** Line number where the fix ends */
  lineEnd: number
  /** Risk level of applying this fix automatically */
  riskLevel: 'safe' | 'moderate' | 'risky'
}

// ─── Patch Generators ───────────────────────────────────────────

/**
 * Generate patches for disabled assertion findings.
 * Removes .skip(), restores commented assertions, unwraps if(false).
 */
function generateDisabledAssertionPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt

  // Handle .skip() removal
  const skipMatch = evidence.match(/(\s*)(it|test|describe)\.skip\s*\(/)
  if (skipMatch) {
    return {
      patternType: 'disabled_assertion',
      description: `Remove .skip() from test — tests should run, not be silently ignored.`,
      originalCode: evidence,
      fixedCode: evidence.replace(/\.skip\s*\(/, '('),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'safe',
    }
  }

  // Handle xit/xtest/xdescribe → it/test/describe
  const xPrefixMatch = evidence.match(/(\s*)(xit|xtest|xdescribe)\s*\(/)
  if (xPrefixMatch) {
    const prefix = xPrefixMatch[2]
    const replacement = prefix === 'xit' ? 'it' : prefix === 'xtest' ? 'test' : 'describe'
    return {
      patternType: 'disabled_assertion',
      description: `Change ${prefix}() to ${replacement}() — ${prefix} silently skips the test.`,
      originalCode: evidence,
      fixedCode: evidence.replace(prefix, replacement),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'safe',
    }
  }

  // Handle fit/fdescribe → it/describe (remove focus)
  const fPrefixMatch = evidence.match(/(\s*)(fit|fdescribe)\s*\(/)
  if (fPrefixMatch) {
    const prefix = fPrefixMatch[2]
    const replacement = prefix === 'fit' ? 'it' : 'describe'
    return {
      patternType: 'disabled_assertion',
      description: `Change ${prefix}() to ${replacement}() — focused tests skip all other tests in the suite.`,
      originalCode: evidence,
      fixedCode: evidence.replace(prefix, replacement),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'safe',
    }
  }

  // Handle if(false) wrapping
  const ifFalseMatch = evidence.match(/if\s*\(\s*false\s*\)\s*\{/)
  if (ifFalseMatch) {
    return {
      patternType: 'disabled_assertion',
      description: `Remove if(false) wrapper — condition is always false, code never executes.`,
      originalCode: evidence,
      fixedCode: evidence.replace(/if\s*\(\s*false\s*\)\s*\{\s*\n?/, ''),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Handle commented-out assertions (uncomment them)
  const commentedAssertMatch = evidence.match(/\/\/\s*(assert|expect|should)/)
  if (commentedAssertMatch) {
    return {
      patternType: 'disabled_assertion',
      description: `Uncomment assertion — commented assertions don't verify anything.`,
      originalCode: evidence,
      fixedCode: evidence.replace(/\/\/\s*/, ''),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  return null
}

/**
 * Generate patches for silent catch findings.
 * Adds proper error handling to empty catch blocks.
 */
function generateSilentCatchPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt

  // Handle empty catch: catch (e) { }
  const emptyCatchMatch = evidence.match(/(catch\s*(?:\([^)]*\))?\s*\{)\s*(\}\s*$)/)
  if (emptyCatchMatch) {
    return {
      patternType: 'silent_catch_and_pass',
      description: `Add error logging to empty catch block — silent catch swallows errors.`,
      originalCode: evidence,
      fixedCode: evidence.replace(
        emptyCatchMatch[0],
        `${emptyCatchMatch[1]}\n    console.error('[Mantiz] Caught error:', error);\n    // TODO: Add proper error handling\n  ${emptyCatchMatch[2]}`,
      ),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Handle TODO-only catch: catch (e) { // TODO }
  const todoCatchMatch = evidence.match(/(catch\s*(?:\([^)]*\))?\s*\{)\s*\/\/\s*(TODO|FIXME).*(\})/)
  if (todoCatchMatch) {
    return {
      patternType: 'silent_catch_and_pass',
      description: `Replace TODO-only catch with proper error handling.`,
      originalCode: evidence,
      fixedCode: evidence.replace(todoCatchMatch[0], ''), // Will be regenerated properly
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Handle console-only catch: catch(e) { console.log(e) }
  const consoleCatchMatch = evidence.match(/(catch\s*(?:\([^)]*\))?\s*\{)\s*console\.\w+\s*\([^)]*\)\s*;?\s*(\})/)
  if (consoleCatchMatch) {
    return {
      patternType: 'silent_catch_and_pass',
      description: `Replace console-only catch with proper error handling — logging without recovery is still a silent pass.`,
      originalCode: evidence,
      fixedCode: evidence.replace(
        consoleCatchMatch[0],
        `${consoleCatchMatch[1]}\n    console.error('[Mantiz] Caught error:', error);\n    throw error; // Re-throw to fail the test\n  ${consoleCatchMatch[2]}`,
      ),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'risky',
    }
  }

  return null
}

/**
 * Generate patches for hallucinated assertion findings.
 * Replaces hallucinated matchers with valid alternatives.
 */
function generateHallucinationPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt

  // Known hallucinated → valid mapping
  const MATCHER_MAP: Record<string, string> = {
    toExist: 'toBeDefined',
    toNotExist: 'toBeNull',
    toNotBe: 'not.toBe',
    toNotEqual: 'not.toEqual',
    toNotMatch: 'not.toMatch',
    toHave: 'toHaveProperty',
    toNotHave: 'not.toHaveProperty',
    toHas: 'toHaveProperty',
    toNotHas: 'not.toHaveProperty',
    toBePresent: 'toBeDefined',
    toNotBePresent: 'toBeNull',
    toBeValid: 'toBeTruthy',
    toBeInvalid: 'toBeFalsy',
    toIncludeAll: 'toContain',
    toExclude: 'not.toContain',
    toExcludeAll: 'not.toContain',
  }

  for (const [hallucinated, valid] of Object.entries(MATCHER_MAP)) {
    if (evidence.includes(`.${hallucinated}(`)) {
      return {
        patternType: 'hallucinated_assertion',
        description: `Replace hallucinated matcher .${hallucinated}() with valid .${valid}().`,
        originalCode: evidence,
        fixedCode: evidence.replace(new RegExp(`\\.${hallucinated}\\(`, 'g'), `.${valid}(`),
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'safe',
      }
    }
  }

  return null
}

/**
 * Generate patches for mock-to-avoid findings.
 * Adds a comment suggesting real-path test coverage.
 */
function generateMockPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt

  const mockMatch = evidence.match(/(jest|vi)\.mock\s*\(/)
  if (mockMatch) {
    return {
      patternType: 'mock_to_avoid_failure',
      description: `Add real-path test alongside mock — mock bypasses real implementation.`,
      originalCode: evidence,
      fixedCode: `// TODO: Add real-path test for this module\n// ${evidence}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  return null
}

// ─── Main Patch Generator ──────────────────────────────────────

/**
 * Generate all applicable code patches from findings.
 */
export function generatePatches(
  findings: Finding[],
  files?: ParsedDiff[],
): CodePatch[] {
  const patches: CodePatch[] = []
  const seen = new Set<string>() // deduplicate by filePath:lineStart

  // Build a map for quick file lookups
  const fileMap = new Map<string, ParsedDiff>()
  if (files) {
    for (const f of files) {
      const path = f.newFile || f.oldFile || ''
      if (path) fileMap.set(path, f)
    }
  }

  for (const finding of findings) {
    const key = `${finding.filePath}:${finding.lineStart}:${finding.patternType}`
    if (seen.has(key)) continue
    seen.add(key)

    const file = fileMap.get(finding.filePath)

    let patch: CodePatch | null = null

    switch (finding.patternType) {
      case 'disabled_assertion':
        patch = generateDisabledAssertionPatches(finding, file)
        break
      case 'silent_catch_and_pass':
        patch = generateSilentCatchPatches(finding, file)
        break
      case 'hallucinated_assertion':
        patch = generateHallucinationPatches(finding, file)
        break
      case 'mock_to_avoid_failure':
        patch = generateMockPatches(finding, file)
        break
    }

    if (patch) {
      patches.push(patch)
    }
  }

  return patches
}

/**
 * Apply patches to generate a fully fixed diff.
 * Returns the modified diff content.
 */
export function applyPatches(
  originalDiff: string,
  patches: CodePatch[],
): string {
  if (patches.length === 0) return originalDiff

  let result = originalDiff

  // Apply patches in reverse line order (bottom-up) to preserve line numbers
  const sorted = [...patches].sort((a, b) => b.lineStart - a.lineStart)

  for (const patch of sorted) {
    // Try to find and replace the original code in the diff
    const escapedOriginal = patch.originalCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const regex = new RegExp(escapedOriginal, 'g')
      if (regex.test(result)) {
        result = result.replace(regex, patch.fixedCode)
      }
    } catch {
      // If regex fails, skip this patch
      continue
    }
  }

  return result
}

/**
 * Apply patches to actual source files (not diff).
 * This modifies the working tree — use with caution.
 * Only applies 'safe' and 'moderate' risk level patches by default.
 */
export function applyPatchesToFiles(
  patches: CodePatch[],
  options: { includeRisky?: boolean } = {},
): { applied: number; skipped: number }[] {
  const results: { applied: number; skipped: number }[] = []

  for (const patch of patches) {
    if (patch.riskLevel === 'risky' && !options.includeRisky) {
      results.push({ applied: 0, skipped: 1 })
      continue
    }

    try {
      const filePath = patch.filePath

      if (!existsSync(filePath)) {
        results.push({ applied: 0, skipped: 1 })
        continue
      }

      // Findings report line numbers relative to the diff hunk, not absolute file lines.
      // Instead of trying to match exact positions, we do a content-based search:
      // Search for the pattern across the entire file content.
      let content = readFileSync(filePath, 'utf-8')
      const searchStr = patch.originalCode.trim()

      if (content.includes(searchStr)) {
        content = content.replace(searchStr, patch.fixedCode)
        writeFileSync(filePath, content, 'utf-8')
        results.push({ applied: 1, skipped: 0 })
      } else {
        results.push({ applied: 0, skipped: 1 })
      }
    } catch {
      results.push({ applied: 0, skipped: 1 })
    }
  }

  return results
}
