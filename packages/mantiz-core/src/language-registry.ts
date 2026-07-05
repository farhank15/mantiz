/**
 * Mantiz Language Registry
 *
 * Central configuration for multi-language support.
 * Maps file extensions → language → detection patterns.
 *
 * Each language defines:
 * - testPatterns: Regex patterns to identify test files
 * - sourcePatterns: Regex patterns to identify source files
 * - detectionRules: Language-specific patterns for each detector type
 * - validAssertions: Known valid assertion/matcher names
 * - commentSyntax: How comments look (for filtering)
 */

// ─── Types ───────────────────────────────────────────────────────

export interface LanguageDetectionRules {
  disabledAssertion: {
    skipPatterns: RegExp[]
    focusPatterns: RegExp[]
    conditionalDisable: RegExp[]
    commentPatterns: RegExp[]
  }
  assertionTampering: {
    assertionPattern: RegExp
  }
  mockToAvoid: {
    mockPatterns: RegExp[]
  }
  silentCatch: {
    emptyCatchPatterns: RegExp[]
    todoCatchPatterns: RegExp[]
    consoleOnlyCatchPatterns: RegExp[]
  }
  validAssertions: string[]
}

export interface LanguageConfig {
  name: string
  extensions: string[]
  testPatterns: RegExp[]
  sourcePatterns: RegExp[]
  commentSyntax: {
    singleLine: string[]
    multiLine: string[]
  }
  detectionRules: LanguageDetectionRules
}

export const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {
  javascript: {
    name: 'JavaScript/TypeScript',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
    testPatterns: [
      /(\.(test|spec)\.(ts|tsx|js|jsx)$)/i,
      /(\/__tests__\/|\/tests?\/|\/fixtures\/)/i,
    ],
    sourcePatterns: [/(\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$)/i],
    commentSyntax: { singleLine: ['//'], multiLine: ['/*', '*/'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [/\.skip\s*\(/, /\.todo\s*\(/, /\bxit\b/, /\bxtest\b/, /\bxdescribe\b/],
        focusPatterns: [/\bfit\b/, /\bfdescribe\b/, /\.only\s*\(/],
        conditionalDisable: [
          /if\s*\(\s*(?:false|0)\s*\)\s*\{/,
          /if\s*\(\s*(?:false|0)\s*\)/,
          /if\s*\(\s*process\.env\.\w*(?:SKIP|DISABLE|BYPASS)/i,
        ],
        commentPatterns: [/\/\/\s*(?:assert|expect|should|test|it)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /expect\s*\((?:[^()]*|\([^()]*\))*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [
          /(jest|vi)\.\s*mock\s*\(/,
          /(jest|vi)\.\s*spyOn\s*\(/,
          /(jest|vi)\.\s*fn\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [
          /\bcatch\s*(?:\s*\([^)]*\))?\s*\{[\s\/]*\}/,
          /\bcatch\s*(?:\s*\([^)]*\))?\s*\{[\s]*\/\/.*\}/,
        ],
        todoCatchPatterns: [/\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i],
        consoleOnlyCatchPatterns: [/\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*console\.\w+\s*\([^)]*\)\s*;?\s*\}/],
      },
      validAssertions: [
        'toBe', 'toEqual', 'toStrictEqual', 'toBeNull', 'toBeUndefined',
        'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeGreaterThan',
        'toBeLessThan', 'toContain', 'toHaveLength', 'toHaveProperty',
        'toMatch', 'toMatchObject', 'toThrow', 'toThrowError',
        'toHaveBeenCalled', 'toHaveBeenCalledTimes', 'toHaveBeenCalledWith',
        'resolves', 'rejects',
      ],
    },
  },

  python: {
    name: 'Python',
    extensions: ['.py', '.pyw'],
    testPatterns: [/test_.*\.py$/i, /.*_test\.py$/i, /\/tests?\/.*\.py$/i],
    sourcePatterns: [/\.pyw?$/i],
    commentSyntax: { singleLine: ['#'], multiLine: ['"""', '"""'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [
          /@pytest\.mark\.skip/i, /@pytest\.mark\.skipif/i,
          /@unittest\.skip/i, /@unittest\.skipIf/i,
          /\.skipTest\s*\(/, /raise\s+unittest\.SkipTest/i,
        ],
        focusPatterns: [],
        conditionalDisable: [
          /if\s+__name__\s*!=\s*['"]__main__['"]\s*:/,
          /if\s+False\s*:/, /if\s+0\s*:/,
        ],
        commentPatterns: [/#\s*(?:assert|self\.assert)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /(?:assert|self\.assert)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [
          /unittest\.mock\.patch\s*\(/, /@mock\.patch\s*\(/,
          /@patch\s*\(/, /MagicMock\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [/except\s*\w*\s*:\s*pass/, /except\s*:\s*$/m],
        todoCatchPatterns: [/except\s*\w*\s*:\s*#\s*(TODO|FIXME|HACK)/i],
        consoleOnlyCatchPatterns: [/except\s*\w*\s*:\s*print\s*\(/],
      },
      validAssertions: [
        'assertEqual', 'assertNotEqual', 'assertTrue', 'assertFalse',
        'assertIs', 'assertIsNot', 'assertIsNone', 'assertIsNotNone',
        'assertIn', 'assertNotIn', 'assertIsInstance', 'assertNotIsInstance',
        'assertRaises', 'assertRaisesRegex', 'assertWarns', 'assertWarnsRegex',
        'assertAlmostEqual', 'assertNotAlmostEqual',
      ],
    },
  },

  go: {
    name: 'Go',
    extensions: ['.go'],
    testPatterns: [/.*_test\.go$/i],
    sourcePatterns: [/\.go$/i],
    commentSyntax: { singleLine: ['//'], multiLine: ['/*', '*/'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [/t\.Skip\s*\(/, /t\.Skipf\s*\(/, /t\.SkipNow\s*\(/, /t\.Log\s*\(.*skip/i],
        focusPatterns: [],
        conditionalDisable: [/if\s+false\s*\{/, /if\s+0\s*==\s*1\s*\{/, /\/\/\s*if/],
        commentPatterns: [/\/\/\s*(assert|require|Equal|NoError)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /(t\.|assert\.|require\.|a\.)(Equal|NoError|Nil|NotNil|True|False|Contains|Len|Error|ErrorIs)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [/testify\/mock/, /gomock\.NewController\s*\(/, /\.On\s*\(.*\)\.Return\s*\(/],
      },
      silentCatch: {
        emptyCatchPatterns: [/_=\s*err/, /if\s+err\s*!=\s*nil\s*\{\s*return\s*nil\s*\}/],
        todoCatchPatterns: [/\/\/\s*(TODO|FIXME|HACK).*err/i],
        consoleOnlyCatchPatterns: [/fmt\.Print(ln|f)?\s*\(.*err/, /log\.\w+\s*\(.*err/],
      },
      validAssertions: [
        'Equal', 'NotEqual', 'NoError', 'Nil', 'NotNil', 'True', 'False',
        'Contains', 'Len', 'Error', 'ErrorIs',
      ],
    },
  },

  java: {
    name: 'Java',
    extensions: ['.java'],
    testPatterns: [/.*Test\.java$/i, /.*Tests\.java$/i, /.*TestCase\.java$/i, /\/src\/test\/java\//i],
    sourcePatterns: [/\.java$/i],
    commentSyntax: { singleLine: ['//'], multiLine: ['/*', '*/'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [
          /@Disabled/i, /@Ignore/i, /@DisabledIf/i, /@DisabledOnOs/i,
          /@DisabledOnJre/i, /@DisabledForJreRange/i,
          /assumeTrue\s*\(/i, /assumeFalse\s*\(/i,
        ],
        focusPatterns: [/@EnabledOnOs/i],
        conditionalDisable: [/if\s*\(\s*false\s*\)/],
        commentPatterns: [/\/\/\s*(assert|assertEquals|assertTrue|verify)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /(assertEquals|assertTrue|assertFalse|assertNull|assertNotNull|assertSame|assertNotSame|assertThat|verify)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [
          /Mockito\.mock\s*\(/, /@Mock\b/, /@InjectMocks\b/,
          /Mockito\.spy\s*\(/, /Mockito\.when\s*\(/,
          /when\s*\(.*\)\.thenReturn\s*\(/, /mockStatic\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [/\bcatch\s*\([^)]*\)\s*\{\s*\}/, /\bcatch\s*\([^)]*\)\s*\{\s*\/\/.*\}/],
        todoCatchPatterns: [/\bcatch\s*\([^)]*\)\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i],
        consoleOnlyCatchPatterns: [/\bcatch\s*\([^)]*\)\s*\{\s*System\.out\./, /\bcatch\s*\([^)]*\)\s*\{\s*logger\./],
      },
      validAssertions: [
        'assertEquals', 'assertNotEquals', 'assertTrue', 'assertFalse',
        'assertNull', 'assertNotNull', 'assertSame', 'assertNotSame',
        'assertThat', 'assertThrows', 'assertTimeout', 'assertTimeoutPreemptively',
        'verify', 'verifyNoInteractions', 'verifyNoMoreInteractions',
      ],
    },
  },

  ruby: {
    name: 'Ruby',
    extensions: ['.rb'],
    testPatterns: [/.*_test\.rb$/i, /.*_spec\.rb$/i, /\/spec\/.*\.rb$/i, /\/test\/.*\.rb$/i],
    sourcePatterns: [/\.rb$/i],
    commentSyntax: { singleLine: ['#'], multiLine: ['=begin', '=end'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [/\bskip\s+/i, /\bpending\b/, /xit\b/, /xdescribe\b/, /xcontext\b/, /xspecify\b/, /,\s*skip:\s*true/],
        focusPatterns: [/\bfit\b/, /\bfdescribe\b/, /\bfcontext\b/, /\bfspecify\b/, /,\s*focus:\s*true/],
        conditionalDisable: [/if\s+false\s*$/],
        commentPatterns: [/#\s*(assert|expect|should)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /(expect\s*\(|assert\s*\(|should\s+|\.should\b)/,
      },
      mockToAvoid: {
        mockPatterns: [
          /allow\(.*\)\.to\s+receive/, /expect\(.*\)\.to\s+receive/,
          /double\s*\(/, /instance_double\s*\(/, /class_double\s*\(/,
          /spy\s*\(/, /stub_const/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [/rescue\s*$/, /rescue\s+\w+\s*$/, /rescue\s+\w+\s*$/m],
        todoCatchPatterns: [/rescue\s+\w*\s*#\s*(TODO|FIXME|HACK)/i],
        consoleOnlyCatchPatterns: [/rescue\s+\w*\s*puts\s*\(/, /rescue\s+\w*\s*p\s+/],
      },
      validAssertions: [
        'eq', 'eql', 'equal', 'be', 'be_true', 'be_false', 'be_nil',
        'be_truthy', 'be_falsey', 'be_a', 'be_an', 'be_kind_of',
        'be_instance_of', 'respond_to', 'have_key', 'have_attributes',
        'include', 'match', 'raise_error',
      ],
    },
  },

  rust: {
    name: 'Rust',
    extensions: ['.rs'],
    testPatterns: [/.*\.rs$/i],
    sourcePatterns: [/\.rs$/i],
    commentSyntax: { singleLine: ['//'], multiLine: ['/*', '*/'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [/#\[ignore\]/i],
        focusPatterns: [],
        conditionalDisable: [/if\s+false\s*\{/],
        commentPatterns: [/\/\/\s*(assert|assert_eq|assert_ne|assert!)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /(assert_eq!|assert_ne!|assert!)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [/mockall::/, /#\[automock\]/, /mock\s*\(/],
      },
      silentCatch: {
        emptyCatchPatterns: [],
        todoCatchPatterns: [/\/\/\s*(TODO|FIXME|HACK).*unwrap/i],
        consoleOnlyCatchPatterns: [/eprintln!\s*\(/, /println!\s*\(/],
      },
      validAssertions: ['assert_eq', 'assert_ne', 'assert'],
    },
  },

  php: {
    name: 'PHP',
    extensions: ['.php'],
    testPatterns: [/.*Test\.php$/i, /\/tests\/.*\.php$/i],
    sourcePatterns: [/\.php$/i],
    commentSyntax: { singleLine: ['//', '#'], multiLine: ['/*', '*/'] },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [/markTestSkipped\s*\(/i, /markTestIncomplete\s*\(/i, /@requires/i, /@group\s+/i],
        focusPatterns: [],
        conditionalDisable: [/if\s*\(\s*false\s*\)/],
        commentPatterns: [/\/\/\s*(assert|expect|should)\s*\(/i, /#\s*(assert|expect|should)\s*\(/i],
      },
      assertionTampering: {
        assertionPattern: /(assertEquals|assertSame|assertTrue|assertFalse|assertNull|assertNotNull|assertThat|expect)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [
          /createMock\s*\(/, /getMockBuilder\s*\(/,
          /Mockery::mock\s*\(/, /m::mock\s*\(/,
          /shouldReceive/, /willReturn\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [/\bcatch\s*\([^)]*\)\s*\{\s*\}/, /\bcatch\s*\([^)]*\)\s*\{\s*\/\/.*\}/],
        todoCatchPatterns: [/\bcatch\s*\([^)]*\)\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i],
        consoleOnlyCatchPatterns: [/\bcatch\s*\([^)]*\)\s*\{\s*echo\s+/, /\bcatch\s*\([^)]*\)\s*\{\s*var_dump\s*\(/],
      },
      validAssertions: [
        'assertEquals', 'assertNotEquals', 'assertSame', 'assertNotSame',
        'assertTrue', 'assertFalse', 'assertNull', 'assertNotNull',
        'assertEmpty', 'assertNotEmpty', 'assertCount',
        'assertContains', 'assertNotContains',
      ],
    },
  },
}

export function detectLanguage(filePath: string): string | null {
  const lower = filePath.toLowerCase()
  for (const [key, config] of Object.entries(LANGUAGE_CONFIG)) {
    for (const ext of config.extensions) {
      if (lower.endsWith(ext)) return key
    }
  }
  return null
}

export function isTestFile(filePath: string): boolean {
  const lang = detectLanguage(filePath)
  if (!lang) return false
  return LANGUAGE_CONFIG[lang].testPatterns.some(p => p.test(filePath))
}

export function isSourceFile(filePath: string): boolean {
  const lang = detectLanguage(filePath)
  if (!lang) return false
  return LANGUAGE_CONFIG[lang].sourcePatterns.some(p => p.test(filePath))
}
