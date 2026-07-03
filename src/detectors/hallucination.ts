import type { Finding, ParsedDiff } from './types'

const VALID_MATCHERS = new Set([
  // ── Jest / Vitest Core Matchers ──
  'toBe', 'toEqual', 'toStrictEqual', 'toBeNull', 'toBeUndefined',
  'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeGreaterThan',
  'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual',
  'toBeCloseTo', 'toBeNaN', 'toBeTypeOf', 'toBeInstanceOf',
  'toContain', 'toContainEqual', 'toHaveLength', 'toHaveProperty',
  'toMatch', 'toMatchObject', 'toMatchSnapshot', 'toMatchInlineSnapshot',
  'toThrow', 'toThrowError', 'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',

  // Jest 29+ matchers
  'toHaveBeenCalledOnceWith',
  'toHaveBeenCalled', 'toHaveBeenCalledOnce', 'toHaveBeenCalledTimes',
  'toHaveBeenCalledWith', 'toHaveReturned', 'toHaveReturnedWith',

  // Mock methods (frequently chained)
  'mock', 'mocked', 'fn', 'spyOn',
  'mockReturnValue', 'mockReturnValueOnce', 'mockResolvedValue',
  'mockResolvedValueOnce', 'mockRejectedValue', 'mockRejectedValueOnce',
  'mockImplementation', 'mockImplementationOnce', 'mockRestore',
  'mockClear', 'mockReset',

  // Jest Extended / Community matchers
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

  // Jest / Vitest global functions
  'describe', 'it', 'test', 'expect', 'beforeAll', 'afterAll',
  'beforeEach', 'afterEach', 'vi', 'jest',

  // Chai-style (should, assert)
  'should', 'assert',

  // test.todo is a valid Jest/Vitest function for planned tests
  'todo',

  // ── JUnit 5 / AssertJ (Java) ──
  'assertEquals', 'assertNotEquals', 'assertTrue', 'assertFalse',
  'assertNull', 'assertNotNull', 'assertSame', 'assertNotSame',
  'assertThrows', 'assertDoesNotThrow', 'assertTimeout', 'assertArrayEquals',
  'assertThat', 'assertIterableEquals', 'assertLinesMatch',
  'as', 'describedAs', 'is', 'isNot', 'isEqualTo', 'isNotEqualTo',
  'isSameAs', 'isNotSameAs', 'isInstanceOf', 'isNotInstanceOf',
  'isNull', 'isNotNull', 'isTrue', 'isFalse', 'isZero', 'isNotZero',
  'isPositive', 'isNotPositive', 'isNegative', 'isNotNegative',
  'isIn', 'isNotIn', 'hasSize', 'hasToString', 'doesNotHaveToString',
  'contains', 'doesNotContain', 'containsExactly', 'containsOnlyOnce',
  'containsAnyOf', 'startsWith', 'endsWith', 'matches', 'doesNotMatch',
  'hasMessage', 'hasCause', 'hasNoCause', 'hasStackTraceContaining',

  // ── EasyMock (Java) ──
  'expect', 'andReturn', 'andThrow', 'andAnswer', 'times',
  'once', 'atLeastOnce', 'anyTimes', 'expectLastCall',

  // ── Mockito (Java) ──
  'when', 'thenReturn', 'thenThrow', 'thenAnswer', 'thenCallRealMethod',
  'verify', 'verifyZeroInteractions', 'verifyNoMoreInteractions',
  'doReturn', 'doThrow', 'doAnswer', 'doCallRealMethod',
  'any', 'anyInt', 'anyString', 'anyList', 'anySet', 'anyMap',
  'eq', 'same', 'isA', 'isNull', 'isNotNull', 'contains',
  'argThat', 'intThat', 'stringThat',
  'capture', 'captor',

  // ── Rust testing ──
  'assert_eq', 'assert_ne', 'assert', 'assert_matches',
  'panic', 'unwrap', 'expect', 'ok', 'err',
  'is_ok', 'is_err', 'is_some', 'is_none',

  // ── Kotest (Kotlin) ──
  'shouldBe', 'shouldNotBe', 'shouldEqual', 'shouldNotEqual',
  'shouldBeTrue', 'shouldBeFalse', 'shouldBeNull', 'shouldNotBeNull',
  'shouldContain', 'shouldNotContain', 'shouldHaveSize',
  'shouldThrow', 'shouldNotThrow', 'shouldMatch',
  'shouldStartWith', 'shouldEndWith', 'shouldBeInstanceOf',

  // ── pytest (Python) ──
  'assert_raises', 'assert_warns', 'raises', 'warns',
  'approx', 'almost_equal',

  // ── Playwright / CLI Output Testing ──
  'toHaveURL', 'toHaveTitle', 'toHaveText', 'toContainText',
  'toHaveValue', 'toHaveValues', 'toHaveAttribute',
  'toHaveClass', 'toHaveCount', 'toHaveCSS', 'toHaveId',
  'toHaveJSProperty', 'toHaveScreenshot', 'toBeChecked',
  'toBeDisabled', 'toBeEnabled', 'toBeFocused', 'toBeHidden',
  'toBeVisible', 'toBeInViewport', 'toBeOK', 'toMatchSnapshot',
  'toPass', 'toOutput',

  // ── jest-dom (testing-library) ──
  'toBeDisabled', 'toBeEnabled', 'toBeEmptyDOMElement',
  'toBeInTheDocument', 'toBeInvalid', 'toBeRequired',
  'toBeValid', 'toBeVisible', 'toContainElement',
  'toContainHTML', 'toHaveAttribute', 'toHaveClass',
  'toHaveDisplayValue', 'toHaveErrorMessage', 'toHaveFocus',
  'toHaveFormValues', 'toHaveStyle', 'toHaveTextContent',
  'toHaveValue',

  // ── Hardhat (Ethereum) ──
  'emit', 'withArgs', 'revertedWith', 'reverted',

  // ── Google Test / Google Mock (C++) ──
  'EXPECT_EQ', 'EXPECT_NE', 'EXPECT_LT', 'EXPECT_LE',
  'EXPECT_GT', 'EXPECT_GE', 'EXPECT_TRUE', 'EXPECT_FALSE',
  'EXPECT_THROW', 'EXPECT_NO_THROW', 'EXPECT_ANY_THROW',
  'EXPECT_STREQ', 'EXPECT_STRNE', 'EXPECT_STRCASEEQ',
  'ASSERT_EQ', 'ASSERT_NE', 'ASSERT_TRUE', 'ASSERT_FALSE',
  'ASSERT_THROW', 'ASSERT_NO_THROW',
  'EXPECT_CALL', 'ON_CALL', 'Return', 'ReturnOnce', 'WillOnce',
  'WillRepeatedly', 'Times', 'AtLeast', 'AtMost',
])

const KNOWN_HALLUCINATED_MATCHERS = [
  'toExist', 'toNotExist', 'toNotBe', 'toNotEqual', 'toNotMatch',
  'toHave', 'toNotHave', 'toHas', 'toNotHas', 'toBePresent',
  'toNotBePresent', 'toIncludeAll', 'toExclude', 'toExcludeAll',
  'toBeValid', 'toBeInvalid',
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
    // Reserve 'high' confidence only for matchers known to be hallucinated
    // across ALL frameworks. Unknown matchers get 'medium' because they might
    // be valid in a non-Jest framework.
    const confidence: 'high' | 'medium' = isKnownHallucinated ? 'high' : 'medium'

    return {
      patternType: 'hallucinated_assertion',
      filePath,
      lineStart: lineIndex,
      lineEnd: lineIndex,
      confidence,
      explanation: isKnownHallucinated
        ? `Potentially hallucinated assertion matcher "${matcher}" — this function does not exist in any known testing framework.`
        : `Unknown assertion matcher "${matcher}" — not in Jest/Vitest whitelist. May be valid in a different framework (EasyMock, AssertJ, Playwright, etc).`,
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
