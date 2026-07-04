/**
 * Mantiz Hallucinated Assertion Detector — Multi-Language
 *
 * Detects assertion matchers that don't exist in any known testing framework.
 * AI agents often "hallucinate" fake assertion methods that look plausible
 * but would cause runtime errors.
 *
 * Uses the Language Registry for per-language valid assertion lists.
 * Cross-references matchers against the correct language's known assertions.
 *
 * Supported: JavaScript/TypeScript, Python, Go, Java, Ruby, Rust, PHP
 */

import type { Finding, ParsedDiff } from './types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from './language-registry'

/**
 * Non-assertion method calls that are often mistaken as matchers.
 * These are standard JS/TS methods that should NEVER be flagged.
 */
const NON_ASSERTION_METHODS = new Set([
  'filter', 'map', 'reduce', 'forEach', 'flat', 'flatMap',
  'then', 'catch', 'finally',
  'entries', 'values', 'keys', 'fromEntries',
  'every', 'some', 'find', 'findIndex',
  'sort', 'reverse', 'splice', 'slice',
  'join', 'split', 'trim', 'trimStart', 'trimEnd',
  'replace', 'replaceAll', 'match', 'matchAll',
  'test', 'exec', 'search',
  'includes', 'indexOf', 'lastIndexOf',
  'startsWith', 'endsWith', 'charAt', 'charCodeAt',
  'toUpperCase', 'toLowerCase', 'toString',
  'concat', 'push', 'pop', 'shift', 'unshift',
  'then', 'resolve', 'reject',
  'length', 'name', 'prototype',
])

/**
 * Matchers KNOWN to be hallucinated across ALL frameworks.
 * These have been confirmed as non-existent in any major testing library.
 */
const KNOWN_HALLUCINATED_MATCHERS = new Set([
  'toExist', 'toNotExist', 'toNotBe', 'toNotEqual', 'toNotMatch',
  'toHave', 'toNotHave', 'toHas', 'toNotHas', 'toBePresent',
  'toNotBePresent', 'toIncludeAll', 'toExclude', 'toExcludeAll',
  'toBeValid', 'toBeInvalid',
])

/**
 * All Jest/Vitest matchers for JS/TS detection.
 * This is the most comprehensive set since JS/TS is the primary target.
 */
const JEST_MATCHERS = new Set([
  'toBe', 'toEqual', 'toStrictEqual', 'toBeNull', 'toBeUndefined',
  'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeGreaterThan',
  'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual',
  'toBeCloseTo', 'toBeNaN', 'toBeTypeOf', 'toBeInstanceOf',
  'toBeEmpty', 'toBeNil', 'toBeOneOf',
  'toBeBoolean', 'toBeString', 'toBeNumber', 'toBeArray', 'toBeObject',
  'toBeFinite',
  'toContain', 'toContainEqual', 'toHaveLength', 'toHaveProperty',
  'toMatch', 'toMatchObject', 'toMatchSnapshot', 'toMatchInlineSnapshot',
  'toThrow', 'toThrowError', 'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
  'toHaveBeenCalledOnceWith',
  'toHaveBeenCalled', 'toHaveBeenCalledOnce', 'toHaveBeenCalledTimes',
  'toHaveBeenCalledWith', 'toHaveReturned', 'toHaveReturnedWith',
  'toBeArray', 'toBeArrayOfSize', 'toBeBoolean', 'toBeDate',
  'toBeEmptyObject', 'toBeEven', 'toBeFloat', 'toBeFunction',
  'toBeHexadecimal', 'toBeInteger', 'toBeNegative', 'toBeNumber',
  'toBeObject', 'toBeOdd', 'toBePositive', 'toBeSealed',
  'toBeSerializable', 'toBeSymbol', 'toBeWithin',
  'toEndWith', 'toInclude', 'toIncludeRepeated', 'toIncludeAllMembers',
  'toIncludeAnyMembers', 'toIncludeEqual', 'toStartWith', 'toSatisfy',
  'toBeDisabled', 'toBeEnabled', 'toBeEmptyDOMElement',
  'toBeInTheDocument', 'toBeInvalid', 'toBeRequired',
  'toBeValid', 'toBeVisible', 'toContainElement',
  'toContainHTML', 'toHaveAttribute', 'toHaveClass',
  'toHaveDisplayValue', 'toHaveErrorMessage', 'toHaveFocus',
  'toHaveFormValues', 'toHaveStyle', 'toHaveTextContent',
  'toHaveValue', 'toHaveTitle', 'toHaveText', 'toContainText',
  'toHaveValues', 'toHaveCSS', 'toHaveId',
  'toHaveJSProperty', 'toHaveScreenshot', 'toBeChecked',
  'toBeFocused', 'toBeHidden', 'toBeInViewport', 'toBeOK',
])

/**
 * Jest/Vitest mock methods and globals (frequently chained).
 */
const JEST_GLOBALS = new Set([
  'mock', 'mocked', 'fn', 'spyOn',
  'mockReturnValue', 'mockReturnValueOnce', 'mockResolvedValue',
  'mockResolvedValueOnce', 'mockRejectedValue', 'mockRejectedValueOnce',
  'mockImplementation', 'mockImplementationOnce', 'mockRestore',
  'mockClear', 'mockReset',
  'anything', 'any', 'arrayContaining', 'assertions', 'extend',
  'hasAssertions', 'not', 'objectContaining', 'stringContaining',
  'stringMatching',
  'describe', 'it', 'test', 'expect', 'beforeAll', 'afterAll',
  'beforeEach', 'afterEach', 'vi', 'jest',
  'should', 'assert',
  'todo', 'resolves', 'rejects',
])

/**
 * Playwright-specific matchers.
 */
const PLAYWRIGHT_MATCHERS = new Set([
  'toHaveURL', 'toHaveTitle', 'toHaveText', 'toContainText',
  'toHaveValue', 'toHaveValues', 'toHaveAttribute',
  'toHaveClass', 'toHaveCount', 'toHaveCSS', 'toHaveId',
  'toHaveJSProperty', 'toHaveScreenshot', 'toBeChecked',
  'toBeDisabled', 'toBeEnabled', 'toBeFocused', 'toBeHidden',
  'toBeVisible', 'toBeInViewport', 'toBeOK', 'toPass',
])

/**
 * Get valid assertion matchers for a given language.
 */
function getValidMatchers(lang: string | null): Set<string> {
  if (!lang || !LANGUAGE_CONFIG[lang]) {
    // Default: JS/TS (most comprehensive)
    return new Set([...JEST_MATCHERS, ...JEST_GLOBALS, ...PLAYWRIGHT_MATCHERS])
  }

  // Use language-specific valid assertions from the registry
  const registryAssertions = LANGUAGE_CONFIG[lang].detectionRules.validAssertions

  if (lang === 'javascript') {
    return new Set([...JEST_MATCHERS, ...JEST_GLOBALS, ...PLAYWRIGHT_MATCHERS, ...registryAssertions])
  }

  // For other languages, use the registry assertions as base
  const matchers = new Set(registryAssertions)

  // Add common cross-language patterns for rich frameworks
  if (lang === 'java') {
    // Add EasyMock patterns
    matchers.add('expect').add('andReturn').add('andThrow').add('andAnswer')
    matchers.add('times').add('once').add('atLeastOnce').add('anyTimes')
    matchers.add('expectLastCall')
  }

  if (lang === 'rust') {
    // Core Rust test macros
    matchers.add('assert').add('assert_eq').add('assert_ne')
    matchers.add('assert_matches').add('assert_approx_eq')
    matchers.add('assert_ok').add('assert_err').add('assert_none').add('assert_some')
    // Result combinators — NOT silent catches, legitimate patterns
    matchers.add('unwrap').add('expect')
    matchers.add('unwrap_or').add('unwrap_or_else')
    matchers.add('ok').add('err')
    matchers.add('is_ok').add('is_err').add('is_some').add('is_none')
    matchers.add('map_err').add('and_then').add('or_else')
  }

  if (lang === 'python') {
    // Standard unittest
    matchers.add('assertEqual').add('assertNotEqual')
    matchers.add('assertTrue').add('assertFalse')
    matchers.add('assertIs').add('assertIsNot')
    matchers.add('assertIsNone').add('assertIsNotNone')
    matchers.add('assertIn').add('assertNotIn')
    matchers.add('assertIsInstance').add('assertNotIsInstance')
    matchers.add('assertRaises').add('assertWarns')
    matchers.add('assertAlmostEqual').add('assertNotAlmostEqual')
    matchers.add('assertGreater').add('assertGreaterEqual')
    matchers.add('assertLess').add('assertLessEqual')
    matchers.add('assertRegex').add('assertNotRegex')
    matchers.add('assertCountEqual')
    matchers.add('assertLogs').add('assertNoLogs')
    // pytest helpers
    matchers.add('raises').add('warns')
    matchers.add('approx')
  }

  return matchers
}

/**
 * Check if a method name looks like an assertion matcher.
 * Only flag methods that look like assertions (toXxx, assertXxx, shouldXxx)
 * or are known to be hallucinated.
 */
function isAssertionLike(name: string): boolean {
  return name.startsWith('to') || name.startsWith('assert') || name.startsWith('should')
}

/**
 * Scan a single line for potentially hallucinated assertion matchers.
 */
function scanLineForHallucination(line: string, lineIndex: number, filePath: string, lang: string | null): Finding | null {
  const content = line.startsWith('+') ? line.slice(1).trim() : ''
  if (!content) return null

  const validMatchers = getValidMatchers(lang)

  // Find matcher calls: .methodName(
  const matcherMatch = content.match(/\.\s*([a-zA-Z]+)\s*\(/)
  if (!matcherMatch) return null

  const matcher = matcherMatch[1]

  // Skip non-assertion method calls (filter, map, then, catch, etc.)
  if (NON_ASSERTION_METHODS.has(matcher)) return null

  // Only analyze methods that look like assertions or are known-hallucinated
  const isKnownHallucinated = KNOWN_HALLUCINATED_MATCHERS.has(matcher)
  const looksLikeMatcher = isAssertionLike(matcher)

  // Skip methods that clearly aren't assertions
  if (!isKnownHallucinated && !looksLikeMatcher) return null

  // Check if it's in the valid list
  const inValidList = validMatchers.has(matcher) || JEST_GLOBALS.has(matcher)

  // Check chained matchers: .method(...).method2(
  // Only suspicious if the chained method also looks like an assertion
  const chainMatch = content.match(/\.\s*\w+\s*\([^)]*\)\s*\.\s*(\w+)\s*\(/)
  const chainSuspicious = chainMatch && isAssertionLike(chainMatch[1]) && !validMatchers.has(chainMatch[1])

  if (isKnownHallucinated || (looksLikeMatcher && !inValidList) || chainSuspicious) {
    const confidence: 'high' | 'medium' = isKnownHallucinated ? 'high' : 'medium'

    return {
      patternType: 'hallucinated_assertion',
      filePath,
      lineStart: lineIndex,
      lineEnd: lineIndex,
      confidence,
      explanation: isKnownHallucinated
        ? `Potentially hallucinated assertion matcher "${matcher}" — this function does not exist in any known testing framework.`
        : `Unknown assertion matcher "${matcher}" — not in the ${(lang && LANGUAGE_CONFIG[lang]?.name) || 'expected'} whitelist. May be valid in a different framework.`,
      evidenceExcerpt: content.substring(0, 200),
    }
  }

  return null
}

/**
 * Run the hallucinated-assertion detector across all parsed files/hunks.
 * Multi-language support via Language Registry.
 */
export function detectHallucinatedAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    // Ignore deleted files
    if (file.newFile === '/dev/null') continue

    // Only scan test files (language-agnostic via registry)
    if (!isTestFile(filePath)) continue

    // Detect language for pattern matching
    const lang = detectLanguage(filePath)

    for (const hunk of file.hunks) {
      const lines = hunk.content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const lineIndex = hunk.newStart + i

        const hallFinding = scanLineForHallucination(lines[i], lineIndex, filePath, lang)
        if (hallFinding) {
          findings.push(hallFinding)
        }
      }
    }
  }

  return findings
}
