/**
 * Mantiz Hallucinated Assertion Detector — Multi-Language
 *
 * Detects assertion matchers that don't exist in any known testing framework.
 * AI agents often "hallucinate" fake assertion methods that look plausible
 * but would cause runtime errors.
 *
 * Custom matchers registered via `expect.extend()` are auto-detected
 * via the Custom Matcher Registry (custom-matchers.ts) to prevent FP.
 *
 * Uses the Language Registry for per-language valid assertion lists.
 * Cross-references matchers against the correct language's known assertions.
 *
 * Supported: JavaScript/TypeScript, Python, Go, Java, Ruby, Rust, PHP
 */

import type { Finding, ParsedDiff } from './types'
import { detectLanguage, isTestFile, LANGUAGE_CONFIG } from './language-registry'
import { isCustomMatcher, registerCustomMatchersFromDiff } from './custom-matchers'

/**
 * Non-assertion method calls that start with 'to' but are NOT matchers.
 * These standard JS/TS string/number methods look like assertions (start with 'to')
 * but would cause false positives if checked against the valid matcher list.
 * All other non-assertion methods (filter, map, then, catch, etc.) are
 * already filtered by isAssertionLike() — they don't start with assertion prefixes.
 */
const NON_ASSERTION_METHODS = new Set([
  'toUpperCase', 'toLowerCase', 'toString',
  'toExponential', 'toFixed', 'toPrecision',
  'toLocaleString', 'toLocaleUpperCase', 'toLocaleLowerCase',
  'toDateString', 'toTimeString', 'toISOString',
  'toJSON', 'toSource',
])

/**
 * Matchers KNOWN to be hallucinated across ALL frameworks.
 * These have been confirmed as non-existent in any major testing library.
 * Includes common AI-hallucinated patterns across testing style families:
 * - 'to' prefix (Jest/Vitest-inspired but non-existent)
 * - 'must' prefix (RSpec/Capybara-inspired)
 * - 'has/have' prefix (Chai-inspired)
 * - 'will' prefix (Mockito-inspired)
 */
const KNOWN_HALLUCINATED_MATCHERS = new Set([
  // to* patterns — look real but don't exist
  'toExist', 'toNotExist', 'toNotBe', 'toNotEqual', 'toNotMatch',
  'toHave', 'toNotHave', 'toHas', 'toNotHas', 'toBePresent',
  'toNotBePresent', 'toIncludeAll', 'toExclude', 'toExcludeAll',
  // must* patterns — RSpec-inspired (must not should)
  'mustBe', 'mustNotBe', 'mustEqual', 'mustNotEqual',
  'mustHave', 'mustNotHave', 'mustReturn', 'mustNotReturn',
  'mustThrow', 'mustNotThrow', 'mustCall', 'mustNotCall',
  'mustExist', 'mustNotExist', 'mustMatch', 'mustNotMatch',
  'mustBeNull', 'mustNotBeNull', 'mustBeTrue', 'mustBeFalse',
  'mustResolve', 'mustReject',
  // has*/have* patterns — Chai-inspired
  'hasLength', 'hasProperty', 'hasKey', 'hasItem',
  'hasBeenCalled', 'hasBeenCalledWith', 'hasReturned',
  'haveProperty', 'haveKey', 'haveItem', 'haveLength',
  'haveBeenCalled', 'haveBeenCalledWith', 'haveReturned',
  // will* patterns — Mockito-inspired
  'willReturn', 'willThrow', 'willCall', 'willResolve',
  'willReject', 'willBe', 'willHave',
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
  'toBePartiallyChecked',
  'toHaveAccessibleName', 'toHaveAccessibleDescription', 'toHaveRole',
  'toHaveAccessibleErrorMessage',
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
 * Covers multiple testing framework families:
 * - 'to' prefix (Jest/Vitest/Playwright)
 * - 'assert' prefix (Node built-in, Chai assert, unittest)
 * - 'should' prefix (Chai BDD, RSpec)
 * - 'must' prefix (RSpec, minitest)
 * - 'has/have' prefix (Chai property expectations)
 * - 'will' prefix (Mockito-style action verification)
 */
function isAssertionLike(name: string): boolean {
  return name.startsWith('to') || name.startsWith('assert') || name.startsWith('should')
    || name.startsWith('must') || name.startsWith('has') || name.startsWith('have')
    || name.startsWith('will')
}

/**
 * Scan a single line for potentially hallucinated assertion matchers.
 * Also checks the Custom Matcher Registry to avoid FP on legitimate custom matchers.
 */
function scanLineForHallucination(line: string, lineIndex: number, filePath: string, lang: string | null): Finding | null {
  const content = line.startsWith('+') ? line.slice(1).trim() : ''
  if (!content) return null

  const validMatchers = getValidMatchers(lang)

  // Find ALL method calls on the line: .methodName(
  // Then check BOTH the first method AND any chained methods for hallucinations
  const allMethodMatches = content.matchAll(/\.\s*([a-zA-Z]+)\s*\(/g)
  const methods = [...allMethodMatches].map(m => m[1])
  if (methods.length === 0) return null

  // Skip if the FIRST method is a known non-assertion (toString, toUpperCase, etc.)
  // These look like assertions but are standard JS/TS methods
  if (NON_ASSERTION_METHODS.has(methods[0])) return null

  // Check ALL methods on the line — not just the first one.
  // A line like `.somePromise().mustBe(true)` has FIRST method 'somePromise'
  // (not assertion-like) but SECOND method 'mustBe' (hallucinated assertion).
  // Without checking all methods, we'd miss hallucinated assertions in chains.
  let flaggedMethod: string | null = null
  let isKnownHallucinated = false
  let fromChain = false

  for (const method of methods) {
    if (NON_ASSERTION_METHODS.has(method)) continue
    if (KNOWN_HALLUCINATED_MATCHERS.has(method)) {
      flaggedMethod = method
      isKnownHallucinated = true
      break
    }
    // Check Custom Matcher Registry before flagging as unknown
    if (isCustomMatcher(method)) continue
    if (isAssertionLike(method) && !validMatchers.has(method) && !JEST_GLOBALS.has(method)) {
      flaggedMethod = method
      isKnownHallucinated = false
      fromChain = method !== methods[0]
      break
    }
  }

  if (!flaggedMethod) return null

  const confidence: 'high' | 'medium' | 'low' = isKnownHallucinated ? 'high' : fromChain ? 'low' : 'medium'

  return {
    patternType: 'hallucinated_assertion',
    filePath,
    lineStart: lineIndex,
    lineEnd: lineIndex,
    confidence,
    explanation: isKnownHallucinated
      ? `Potentially hallucinated assertion matcher "${flaggedMethod}" — this function does not exist in any known testing framework.`
      : fromChain
        ? `Unknown assertion matcher "${flaggedMethod}" in chained call — not in the ${(lang && LANGUAGE_CONFIG[lang]?.name) || 'expected'} whitelist. May be valid in a different framework.`
        : `Unknown assertion matcher "${flaggedMethod}" — not in the ${(lang && LANGUAGE_CONFIG[lang]?.name) || 'expected'} whitelist. May be valid in a different framework.`,
    evidenceExcerpt: content.substring(0, 200),
  }
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
