/**
 * Hallucinated Assertion Detector — 6th Detection Pattern
 *
 * AI agents sometimes invent assertion functions that don't exist in the
 * testing framework (Jest, Vitest) to make it look like they're adding
 * tests while avoiding real verification.
 *
 * This detector maintains a whitelist of valid Jest/Vitest matchers and
 * flags any usage of matchers not in the list.
 */
import type { Finding, ParsedDiff } from '../types'

/**
 * Comprehensive whitelist of valid Jest/Vitest matchers.
 * Source: https://jestjs.io/docs/expect, https://vitest.dev/api/expect.html
 */
const VALID_MATCHERS = new Set([
  // Core matchers
  'toBe', 'toEqual', 'toStrictEqual', 'toBeNull', 'toBeUndefined',
  'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeGreaterThan',
  'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual',
  'toBeCloseTo', 'toBeNaN', 'toBeTypeOf', 'toBeInstanceOf',
  'toContain', 'toContainEqual', 'toHaveLength', 'toHaveProperty',
  'toMatch', 'toMatchObject', 'toMatchSnapshot', 'toMatchInlineSnapshot',
  'toThrow', 'toThrowError', 'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',

  // Jest 29+ matchers (VALID — NOT hallucinated)
  'toHaveBeenCalledOnceWith',
  'toHaveBeenCalled', 'toHaveBeenCalledOnce', 'toHaveBeenCalledTimes',
  'toHaveBeenCalledWith', 'toHaveReturned', 'toHaveReturnedWith',

  // Mock methods (frequently chained in tests)
  'mock', 'mocked', 'fn', 'spyOn',
  'mockReturnValue', 'mockReturnValueOnce', 'mockResolvedValue',
  'mockResolvedValueOnce', 'mockRejectedValue', 'mockRejectedValueOnce',
  'mockImplementation', 'mockImplementationOnce', 'mockRestore',
  'mockClear', 'mockReset',

  // Extend matchers (from jest-extended / vitest matchers)
  'toBeArray', 'toBeArrayOfSize', 'toBeBoolean', 'toBeDate',
  'toBeEmpty', 'toBeEmptyObject', 'toBeEven', 'toBeFinite',
  'toBeFloat', 'toBeFunction', 'toBeHexadecimal', 'toBeInteger',
  'toBeNegative', 'toBeNil', 'toBeNumber', 'toBeObject',
  'toBeOdd', 'toBeOneOf', 'toBePositive', 'toBeSealed',
  'toBeSerializable', 'toBeString', 'toBeSymbol', 'toBeWithin',
  'toEndWith', 'toInclude', 'toIncludeRepeated', 'toIncludeAllMembers',
  'toIncludeAnyMembers', 'toIncludeEqual', 'toStartWith', 'toSatisfy',

  // Asymmetric matchers
  'anything', 'any', 'arrayContaining', 'assertions', 'extend',
  'hasAssertions', 'not', 'objectContaining', 'stringContaining',
  'stringMatching', 'resolves', 'rejects',

  // Jest/Vitest global functions
  'describe', 'it', 'test', 'expect', 'beforeAll', 'afterAll',
  'beforeEach', 'afterEach', 'vi', 'jest',

  // Chai-style (should, assert)
  'should', 'assert', 'expect',

  // test.todo is a valid Jest/Vitest function for planned tests
  'todo',
])

/**
 * Patterns for detecting potential hallucinated imports.
 * E.g., `import { toBeSomething } from 'jest-extended'` — if the
 * import doesn't exist, it's likely a hallucination.
 */
const SUSPICIOUS_IMPORT = /import\s+\{[^}]*\}\s*from\s*['"](?:jest|vitest|@testing-library)[^'"]*['"]/

/**
 * Common hallucinated matchers that AI agents frequently invent.
 */
const KNOWN_HALLUCINATED_MATCHERS = [
  'toExist', 'toNotExist', 'toNotBe', 'toNotEqual', 'toNotMatch',
  'toHave', 'toNotHave', 'toHas', 'toNotHas', 'toBePresent',
  'toNotBePresent', 'toIncludeAll', 'toExclude', 'toExcludeAll',
  'toBeValid', 'toBeInvalid',
]

/**
 * Check if a diff line contains a potentially hallucinated assertion matcher.
 */
function scanLineForHallucination(line: string, lineIndex: number, filePath: string): Finding | null {
  const content = line.startsWith('+') ? line.slice(1).trim() : ''
  if (!content) return null

  // Pattern: expect(X).toSomething(...) or expect(X).resolves.toSomething(...)
  const matcherMatch = content.match(/\.\s*([a-zA-Z]+)\s*\(/)
  if (!matcherMatch) return null

  const matcher = matcherMatch[1]

  // Check if it's a known hallucinated matcher
  const isKnownHallucinated = KNOWN_HALLUCINATED_MATCHERS.includes(matcher)

  // Check if it's NOT in the valid whitelist (and starts with 'to' — assertion-like)
  const isNotInWhitelist = matcher.startsWith('to') && !VALID_MATCHERS.has(matcher)

  // Check for suspicious chaining like expect(X).toBeDefined().toYyy()
  const chainMatch = content.match(/\.\s*\w+\s*\([^)]*\)\s*\.\s*(\w+)\s*\(/)
  const chainSuspicious = chainMatch && !VALID_MATCHERS.has(chainMatch[1])

  if (isKnownHallucinated || isNotInWhitelist || chainSuspicious) {
    return {
      patternType: 'hallucinated_assertion',
      filePath,
      lineStart: lineIndex,
      lineEnd: lineIndex,
      confidence: 'high',
      explanation: isKnownHallucinated
        ? `Potentially hallucinated assertion matcher "${matcher}" — this function does not exist in Jest/Vitest. AI agents frequently invent this matcher.`
        : `Unknown assertion matcher "${matcher}" — not found in the Jest/Vitest matcher whitelist. Verify this is a valid custom matcher.`,
      evidenceExcerpt: content.substring(0, 200),
    }
  }

  return null
}

/**
 * Check for hallucinated module imports.
 */
function scanForHallucinatedImport(line: string, lineIndex: number, filePath: string): Finding | null {
  const content = line.startsWith('+') ? line.slice(1).trim() : ''
  if (!content) return null

  // Check for suspicious import patterns
  if (SUSPICIOUS_IMPORT.test(content)) {
    // Extract the import names
    const namesMatch = content.match(/import\s+\{([^}]*)\}\s*from/)
    if (namesMatch) {
      const names = namesMatch[1].split(',').map(n => n.trim()).filter(Boolean)
      const suspicious = names.filter(name => {
        const clean = name.replace(/as\s+\w+/, '').trim()
        return !VALID_MATCHERS.has(clean) && !clean.startsWith('//')
      })

      if (suspicious.length > 0) {
        return {
          patternType: 'hallucinated_assertion',
          filePath,
          lineStart: lineIndex,
          lineEnd: lineIndex,
          confidence: 'medium',
          explanation: `Potentially hallucinated import(s): ${suspicious.join(', ')}. These may not exist in the imported library.`,
          evidenceExcerpt: content.substring(0, 200),
        }
      }
    }
  }

  return null
}

/**
 * Run the hallucinated-assertion detector across all parsed files.
 */
export function detectHallucinatedAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'

    for (const hunk of file.hunks) {
      const lines = hunk.content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const lineIndex = hunk.newStart + i

        // Check for hallucinated matchers
        const hallFinding = scanLineForHallucination(lines[i], lineIndex, filePath)
        if (hallFinding) {
          findings.push(hallFinding)
          continue
        }

        // Check for hallucinated imports
        const importFinding = scanForHallucinatedImport(lines[i], lineIndex, filePath)
        if (importFinding) {
          findings.push(importFinding)
        }
      }
    }
  }

  return findings
}
