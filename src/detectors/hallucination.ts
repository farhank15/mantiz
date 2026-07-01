import type { Finding, ParsedDiff } from './types'

const VALID_MATCHERS = new Set([
  'toBe', 'toEqual', 'toStrictEqual', 'toBeNull', 'toBeUndefined',
  'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeGreaterThan',
  'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual',
  'toBeCloseTo', 'toBeNaN', 'toBeTypeOf', 'toBeInstanceOf',
  'toContain', 'toContainEqual', 'toHaveLength', 'toHaveProperty',
  'toMatch', 'toMatchObject', 'toMatchSnapshot', 'toMatchInlineSnapshot',
  'toThrow', 'toThrowError', 'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',

  // Jest 29+ matchers — often falsely flagged
  'toHaveBeenCalledOnceWith',

  'toBeArray', 'toBeArrayOfSize', 'toBeBoolean', 'toBeDate',
  'toBeEmpty', 'toBeEmptyObject', 'toBeEven', 'toBeFinite',
  'toBeFloat', 'toBeFunction', 'toBeHexadecimal', 'toBeInteger',
  'toBeNegative', 'toBeNil', 'toBeNumber', 'toBeObject',
  'toBeOdd', 'toBeOneOf', 'toBePositive', 'toBeSealed',
  'toBeSerializable', 'toBeString', 'toBeSymbol', 'toBeWithin',
  'toEndWith', 'toInclude', 'toIncludeRepeated', 'toIncludeAllMembers',
  'toIncludeAnyMembers', 'toIncludeEqual', 'toStartWith', 'toSatisfy',

  'anything', 'any', 'arrayContaining', 'assertions', 'extend',
  'hasAssertions', 'not', 'objectContaining', 'stringContaining',
  'stringMatching', 'resolves', 'rejects',

  'describe', 'it', 'test', 'expect', 'beforeAll', 'afterAll',
  'beforeEach', 'afterEach', 'vi', 'jest',

  'should', 'assert', 'expect',
])

const KNOWN_HALLUCINATED_MATCHERS = [
  'toExist', 'toNotExist', 'toNotBe', 'toNotEqual', 'toNotMatch',
  'toHave', 'toNotHave', 'toHas', 'toNotHas', 'toBePresent',
  'toNotBePresent', 'toIncludeAll', 'toExclude', 'toExcludeAll',
  'toBeValid', 'toBeInvalid', 'toHaveBeenCalled', 'toHaveBeenCalledOnce',
  'toHaveBeenCalledTimes', 'toHaveBeenCalledWith', 'toHaveReturned',
  'toHaveReturnedWith',
]

function scanLineForHallucination(line: string, lineIndex: number, filePath: string): Finding | null {
  const content = line.startsWith('+') ? line.slice(1).trim() : ''
  if (!content) return null

  const matcherMatch = content.match(/\.\s*([a-zA-Z]+)\s*\(/)
  if (!matcherMatch) return null

  const matcher = matcherMatch[1]

  const isKnownHallucinated = KNOWN_HALLUCINATED_MATCHERS.includes(matcher)
  const isNotInWhitelist = matcher.startsWith('to') && !VALID_MATCHERS.has(matcher)

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
        ? `Potentially hallucinated assertion matcher "${matcher}" — this function does not exist in Jest/Vitest.`
        : `Unknown assertion matcher "${matcher}" — not found in the Jest/Vitest matcher whitelist.`,
      evidenceExcerpt: content.substring(0, 200),
    }
  }

  return null
}

export function detectHallucinatedAssertions(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    
    // Ignore deleted files
    if (file.newFile === '/dev/null') continue

    // Only scan test files
    if (!TEST_FILE_PATTERN.test(filePath)) continue

    for (const hunk of file.hunks) {
      const lines = hunk.content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const lineIndex = hunk.newStart + i

        const hallFinding = scanLineForHallucination(lines[i], lineIndex, filePath)
        if (hallFinding) {
          findings.push(hallFinding)
        }
      }
    }
  }

  return findings
}
