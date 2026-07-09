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
 *
 * To add a new language, just add an entry to LANGUAGE_CONFIG.
 */

// ─── Types ───────────────────────────────────────────────────────

export interface LanguageDetectionRules {
  /** Patterns for disabled/skipped tests */
  disabledAssertion: {
    skipPatterns: RegExp[]
    focusPatterns: RegExp[]
    conditionalDisable: RegExp[]
    commentPatterns: RegExp[]
  }
  /** Patterns for assertion tampering */
  assertionTampering: {
    assertionPattern: RegExp
  }
  /** Patterns for mocking */
  mockToAvoid: {
    mockPatterns: RegExp[]
  }
  /** Patterns for silent catch/except */
  silentCatch: {
    emptyCatchPatterns: RegExp[]
    todoCatchPatterns: RegExp[]
    consoleOnlyCatchPatterns: RegExp[]
  }
  /** Known valid assertion matchers */
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

// ─── Language Configurations ─────────────────────────────────────

export const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {

  // ── JavaScript / TypeScript ──────────────────────────────────
  javascript: {
    name: 'JavaScript/TypeScript',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
    testPatterns: [
      /(\.(test|spec)\.(ts|tsx|js|jsx)$)/i,
      /(\/__tests__\/|\/tests?\/|\/fixtures\/)/i,
    ],
    sourcePatterns: [
      /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i,
    ],
    commentSyntax: {
      singleLine: ['//'],
      multiLine: ['/*', '*/'],
    },
    detectionRules: {
      disabledAssertion: {
        skipPatterns: [
          /\.skip\s*\(/,
          /\.todo\s*\(/,
          /\bxit\b/,
          /\bxtest\b/,
          /\bxdescribe\b/,
        ],
        focusPatterns: [
          /\bfit\b/,
          /\bfdescribe\b/,
          /\.only\s*\(/,
        ],
        conditionalDisable: [
          /if\s*\(\s*(?:false|0)\s*\)\s*\{/,
          /if\s*\(\s*(?:false|0)\s*\)/,
          /if\s*\(\s*process\.env\.\w*(?:SKIP|SKIP|DISABLE|BYPASS)/i,
          /if\s*\(\s*typeof\s+\w+\s*===?\s*['"]undefined['"]\s*\)/,
        ],
        commentPatterns: [
          /\/\/\s*(?:assert|expect|should|test|it)\s*\(/i,
        ],
      },
      assertionTampering: {
        assertionPattern: /expect\s*\((?:[^()]*|\([^()]*\))*\)\s*\.\s*(toBe|toEqual|toMatch|toContain|toStrictEqual|toBeNull|toBeUndefined|toBeDefined|toBeTruthy|toBeFalsy)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [
          /(jest|vi)\.\s*(?:doMock|mock)\s*\(/,
          /(jest|vi)\.\s*spyOn\s*\(/,
          /(jest|vi)\.\s*fn\s*\(/,
        ],
      },
      silentCatch: {
        // \bcatch to distinguish from Promise.catch() method
        emptyCatchPatterns: [
          /\bcatch\s*(?:\s*\([^)]*\))?\s*\{[\s\/]*\}/,
          /\bcatch\s*(?:\s*\([^)]*\))?\s*\{[\s]*\/\/.*\}/
        ],
        todoCatchPatterns: [
          /\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i,
        ],
        consoleOnlyCatchPatterns: [
          /\bcatch\s*(?:\s*\([^)]*\))?\s*\{\s*console\.\w+\s*\([^)]*\)\s*;?\s*\}/,
        ],
      },
      validAssertions: [
        'toBe', 'toEqual', 'toStrictEqual', 'toBeNull', 'toBeUndefined',
        'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeGreaterThan',
        'toBeLessThan', 'toContain', 'toHaveLength', 'toHaveProperty',
        'toMatch', 'toMatchObject', 'toThrow', 'toThrowError',
        'toHaveBeenCalled', 'toHaveBeenCalledTimes', 'toHaveBeenCalledWith',
        'resolves', 'rejects',
        // Additional common matchers — reduces false positives in D6
        'toBeNaN', 'toBeFinite',
        'toBeEmpty', 'toBeNil', 'toBeOneOf',
        'toBeBoolean', 'toBeString', 'toBeNumber', 'toBeArray', 'toBeObject',
        'toBeTypeOf', 'toSatisfy',
      ],
    },
  },

  // ── Python ──────────────────────────────────────────────────
  python: {
    name: 'Python',
    extensions: ['.py', '.pyw'],
    testPatterns: [
      /test_.*\.py$/i,
      /.*_test\.py$/i,
      /\/tests?\/.*\.py$/i,
    ],
    sourcePatterns: [
      /\.pyw?$/i,
    ],
    commentSyntax: {
      singleLine: ['#'],
      multiLine: ['"""', '"""'],
    },
    detectionRules: {
      disabledAssertion: {
        // @pytest.mark.skip, @unittest.skip, self.skipTest() — ref: docs.pytest.org, docs.python.org
        skipPatterns: [
          /@pytest\.mark\.skip/i,
          /@pytest\.mark\.skipif/i,
          /@unittest\.skip/i,
          /@unittest\.skipIf/i,
          /\.skipTest\s*\(/,
          /raise\s+unittest\.SkipTest/i,
        ],
        // pytest has NO built-in focus marker — use -k flag or custom marker
        focusPatterns: [],
        conditionalDisable: [
          /if\s+__name__\s*!=\s*['"]__main__['"]\s*:/,
          /if\s+False\s*:/,
          /if\s+0\s*:/,
        ],
        // pytest uses plain `assert`, not `pytest.assert` — ref: docs.pytest.org
        commentPatterns: [
          /#\s*(?:assert|self\.assert)\s*\(/i,
        ],
      },
      assertionTampering: {
        // pytest uses plain `assert` statements — ref: docs.pytest.org
        assertionPattern: /(?:assert|self\.assert)\s*\(/,
      },
      mockToAvoid: {
        mockPatterns: [
          /unittest\.mock\.patch\s*\(/,
          /@mock\.patch\s*\(/,
          /@patch\s*\(/,
          /MagicMock\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [
          /except\s*[^:]*:\s*pass/,
          /except\s*[^:]*:\s*$/m,
        ],
        todoCatchPatterns: [
          /except\s*[^:]*:\s*#\s*(TODO|FIXME|HACK)/i,
        ],
        consoleOnlyCatchPatterns: [
          /except\s*[^:]*:\s*print\s*\(/,
        ],
      },
      // All unittest.TestCase assert methods — ref: docs.python.org/3/library/unittest.html
      validAssertions: [
        'assertEqual', 'assertNotEqual', 'assertTrue', 'assertFalse',
        'assertIs', 'assertIsNot', 'assertIsNone', 'assertIsNotNone',
        'assertIn', 'assertNotIn', 'assertIsInstance', 'assertNotIsInstance',
        'assertRaises', 'assertRaisesRegex', 'assertWarns', 'assertWarnsRegex',
        'assertAlmostEqual', 'assertNotAlmostEqual', 'assertGreater',
        'assertGreaterEqual', 'assertLess', 'assertLessEqual',
        'assertRegex', 'assertNotRegex', 'assertCountEqual',
        'assertMultiLineEqual', 'assertSequenceEqual', 'assertListEqual',
        'assertTupleEqual', 'assertSetEqual', 'assertDictEqual',
      ],
    },
  },

  // ── Go ────────────────────────────────────────────────────
  go: {
    name: 'Go',
    extensions: ['.go'],
    testPatterns: [
      /.*_test\.go$/i,
    ],
    sourcePatterns: [
      /\.go$/i,
    ],
    commentSyntax: {
      singleLine: ['//'],
      multiLine: ['/*', '*/'],
    },
    detectionRules: {
      disabledAssertion: {
        // t.Skip, t.Skipf, t.SkipNow — ref: pkg.go.dev/testing
        skipPatterns: [
          /t\.Skip\s*\(/,
          /t\.Skipf\s*\(/,
          /t\.SkipNow\s*\(/,
          /t\.Log\s*\(.*skip/i,
        ],
        focusPatterns: [],
        conditionalDisable: [
          /if\s+false\s*\{/,
          /if\s+0\s*==\s*1\s*\{/,
          /\/\/\s*if/,
        ],
        commentPatterns: [
          /\/\/\s*(assert|require|Equal|NoError)\s*\(/i,
        ],
      },
      assertionTampering: {
        assertionPattern: /(t\.|assert\.|require\.|a\.)(Equal|NoError|Nil|NotNil|True|False|Contains|Len|Error|ErrorIs)\s*\(/,
      },
      mockToAvoid: {
        // testify mock + gomock — ref: pkg.go.dev/github.com/stretchr/testify/mock
        mockPatterns: [
          /testify\/mock/,
          /gomock\.NewController\s*\(/,
          /\.On\s*\(.*\).Return\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [
          /_\s*=\s*err/,
          /if\s+err\s*!=\s*nil\s*\{[\s]*return\s+nil[\s]*\}/,
        ],
        todoCatchPatterns: [
          /\/\/\s*(TODO|FIXME|HACK).*err/i,
        ],
        consoleOnlyCatchPatterns: [
          /fmt\.Print(ln|f)?\s*\(.*err/,
          /log\.\w+\s*\(.*err/,
        ],
      },
      // testify assert + require package — ref: pkg.go.dev/github.com/stretchr/testify/assert
      // NotErrorIs does NOT exist in testify — removed
      validAssertions: [
        'Equal', 'NotEqual', 'NoError', 'Nil', 'NotNil', 'True', 'False',
        'Contains', 'Len', 'Error', 'ErrorIs',
        'Empty', 'NotEmpty', 'Zero', 'NotZero', 'IsType',
        'JSONEq', 'YAMLEq', 'Same', 'NotSame',
        'Greater', 'GreaterOrEqual', 'Less', 'LessOrEqual',
        'WithinDuration', 'InDelta', 'InEpsilon',
      ],
    },
  },

  // ── Java ──────────────────────────────────────────────────
  java: {
    name: 'Java',
    extensions: ['.java'],
    testPatterns: [
      /.*Test\.java$/i,
      /.*Tests\.java$/i,
      /.*TestCase\.java$/i,
      /\/src\/test\/java\//i,
    ],
    sourcePatterns: [
      /\.java$/i,
    ],
    commentSyntax: {
      singleLine: ['//'],
      multiLine: ['/*', '*/'],
    },
    detectionRules: {
      disabledAssertion: {
        // JUnit 5 annotations — ref: docs.junit.org
        skipPatterns: [
          /@Disabled/i,
          /@Ignore/i,
          /@DisabledIf/i,
          /@DisabledOnOs/i,
          /@DisabledOnJre/i,
          /@DisabledForJreRange/i,
          /assumeTrue\s*\(/i,
          /assumeFalse\s*\(/i,
        ],
        focusPatterns: [
          /@EnabledOnOs/i,
        ],
        conditionalDisable: [
          /if\s*\(\s*false\s*\)/,
        ],
        commentPatterns: [
          /\/\/\s*(assert|assertEquals|assertTrue|verify)\s*\(/i,
        ],
      },
      assertionTampering: {
        assertionPattern: /(assertEquals|assertTrue|assertFalse|assertNull|assertNotNull|assertSame|assertNotSame|assertThat|verify)\s*\(/,
      },
      mockToAvoid: {
        // Mockito — ref: site.mockito.org
        mockPatterns: [
          /Mockito\.mock\s*\(/,
          /@Mock\b/,
          /@InjectMocks\b/,
          /Mockito\.spy\s*\(/,
          /Mockito\.when\s*\(/,
          /when\s*\(.*\)\.thenReturn\s*\(/,
          /mockStatic\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [
          /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
          /\bcatch\s*\([^)]*\)\s*\{\s*\/\/.*\}/,
        ],
        todoCatchPatterns: [
          /\bcatch\s*\([^)]*\)\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i,
        ],
        consoleOnlyCatchPatterns: [
          /\bcatch\s*\([^)]*\)\s*\{\s*System\.out\./,
          /\bcatch\s*\([^)]*\)\s*\{\s*logger\./,
        ],
      },
      // JUnit 5 assertions — ref: docs.junit.org
      // verifyZeroInteractions does NOT exist in Mockito — use verifyNoInteractions
      validAssertions: [
        'assertEquals', 'assertNotEquals', 'assertTrue', 'assertFalse',
        'assertNull', 'assertNotNull', 'assertSame', 'assertNotSame',
        'assertThat', 'assertThrows', 'assertTimeout', 'assertTimeoutPreemptively',
        'assertIterableEquals', 'assertLinesMatch',
        'verify', 'verifyNoInteractions', 'verifyNoMoreInteractions',
        'times', 'atLeast', 'atMost', 'only',
      ],
    },
  },

  // ── Ruby ──────────────────────────────────────────────────
  ruby: {
    name: 'Ruby',
    extensions: ['.rb'],
    testPatterns: [
      /.*_test\.rb$/i,
      /.*_spec\.rb$/i,
      /\/spec\/.*\.rb$/i,
      /\/test\/.*\.rb$/i,
    ],
    sourcePatterns: [
      /\.rb$/i,
    ],
    commentSyntax: {
      singleLine: ['#'],
      multiLine: ['=begin', '=end'],
    },
    detectionRules: {
      disabledAssertion: {
        // RSpec skip/pending + xit/xdescribe — ref: rspec.info
        // @skip does NOT exist in RSpec — use `skip` method or `skip: true` metadata
        skipPatterns: [
          /\bskip\s+/i,
          /\bpending\b/i,
          /xit\b/,
          /xdescribe\b/,
          /xcontext\b/,
          /xspecify\b/,
          /,\s*skip:\s*true/,
        ],
        focusPatterns: [
          /\bfit\b/,
          /\bfdescribe\b/,
          /\bfcontext\b/,
          /\bfspecify\b/,
          /,\s*focus:\s*true/,
        ],
        conditionalDisable: [
          /if\s+false\s*$/,
        ],
        commentPatterns: [
          /#\s*(assert|expect|should)\s*\(/i,
        ],
      },
      assertionTampering: {
        assertionPattern: /(expect\s*\(|assert\s*\(|should\s+|\.should\b)/,
      },
      mockToAvoid: {
        mockPatterns: [
          /allow\(.*\)\.to\s+receive/,
          /expect\(.*\)\.to\s+receive/,
          /double\s*\(/,
          /instance_double\s*\(/,
          /class_double\s*\(/,
          /spy\s*\(/,
          /stub_const/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [
          /rescue\s*$/,
          /rescue\s+\w+\s*$/,
          /rescue\s+\w+\s*$/m,
        ],
        todoCatchPatterns: [
          /rescue\s+\w*\s*#\s*(TODO|FIXME|HACK)/i,
        ],
        consoleOnlyCatchPatterns: [
          /rescue\s+\w*\s*puts\s*\(/,
          /rescue\s+\w*\s*p\s+/,
        ],
      },
      validAssertions: [
        'eq', 'eql', 'equal', 'be', 'be_true', 'be_false', 'be_nil',
        'be_truthy', 'be_falsey', 'be_valid', 'be_a', 'be_an', 'be_kind_of',
        'be_instance_of', 'respond_to', 'have_key', 'have_attributes',
        'include', 'match', 'raise_error', 'throw_symbol',
        'change', 'by', 'from', 'to',
        'contain_exactly', 'match_array', 'start_with', 'end_with',
      ],
    },
  },

  // ── Rust ──────────────────────────────────────────────────
  rust: {
    name: 'Rust',
    extensions: ['.rs'],
    testPatterns: [
      /.*\.rs$/i,  // Tests are inside source files with #[test] attribute
    ],
    sourcePatterns: [
      /\.rs$/i,
    ],
    commentSyntax: {
      singleLine: ['//'],
      multiLine: ['/*', '*/'],
    },
    detectionRules: {
      disabledAssertion: {
        // #[ignore] skips test — ref: doc.rust-lang.org/book/ch11-01-writing-tests.html
        // #[cfg(test)] is NOT a skip pattern — it's conditional compilation
        skipPatterns: [
          /#\[ignore\]/i,
        ],
        focusPatterns: [],
        conditionalDisable: [
          /if\s+false\s*\{/,
        ],
        commentPatterns: [
          /\/\/\s*(assert|assert_eq|assert_ne|assert!)\s*\(/i,
        ],
      },
      assertionTampering: {
        // assert_matches! is NOT in std — from assert_matches crate; removed
        assertionPattern: /(assert_eq!|assert_ne!|assert!)\s*\(/,
      },
      mockToAvoid: {
        // mockall + #[automock] — ref: docs.rs/mockall
        // MockServer is from wiremock, NOT mockall — removed
        mockPatterns: [
          /mockall::/,
          /#[automock]/,
          /mock\s*\(/,
        ],
      },
      silentCatch: {
        // NOTE: .unwrap() and .expect() are NOT silent catches — they PANIC on error.
        // These are the OPPOSITE of silent catching (they crash the program).
        // Only eprintln!/println! in catch-like context are suspicious.
        emptyCatchPatterns: [],
        todoCatchPatterns: [
          /\/\/\s*(TODO|FIXME|HACK).*unwrap/i,
        ],
        consoleOnlyCatchPatterns: [
          /eprintln!\s*\(/,
          /println!\s*\(/,
        ],
      },
      // std assertion macros only — ref: doc.rust-lang.org
      // assert_matches! is NOT in std — removed
      validAssertions: [
        'assert_eq', 'assert_ne', 'assert',
      ],
    },
  },

  // ── PHP ──────────────────────────────────────────────────
  php: {
    name: 'PHP',
    extensions: ['.php'],
    testPatterns: [
      /.*Test\.php$/i,
      /\/tests\/.*\.php$/i,
    ],
    sourcePatterns: [
      /\.php$/i,
    ],
    commentSyntax: {
      singleLine: ['//', '#'],
      multiLine: ['/*', '*/'],
    },
    detectionRules: {
      disabledAssertion: {
        // PHPUnit: markTestSkipped(), @requires, @group — ref: docs.phpunit.de
        // Pest: uses PHPUnit under the hood — ref: pestphp.com
        skipPatterns: [
          /markTestSkipped\s*\(/i,
          /markTestIncomplete\s*\(/i,
          /@requires/i,
          /@group\s+/i,
        ],
        // No built-in focus marker in PHPUnit
        focusPatterns: [],
        conditionalDisable: [
          /if\s*\(\s*false\s*\)/,
        ],
        commentPatterns: [
          /\/\/\s*(assert|expect|should)\s*\(/i,
          /#\s*(assert|expect|should)\s*\(/i,
        ],
      },
      assertionTampering: {
        assertionPattern: /(assertEquals|assertSame|assertTrue|assertFalse|assertNull|assertNotNull|assertThat|expect)\s*\(/,
      },
      mockToAvoid: {
        // PHPUnit createMock + Mockery — ref: docs.phpunit.de, docs.mockery.io
        mockPatterns: [
          /createMock\s*\(/,
          /getMockBuilder\s*\(/,
          /Mockery::mock\s*\(/,
          /m::mock\s*\(/,
          /shouldReceive/,
          /willReturn\s*\(/,
        ],
      },
      silentCatch: {
        emptyCatchPatterns: [
          /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
          /\bcatch\s*\([^)]*\)\s*\{\s*\/\/.*\}/,
        ],
        todoCatchPatterns: [
          /\bcatch\s*\([^)]*\)\s*\{\s*\/\/\s*(TODO|FIXME|HACK)/i,
        ],
        consoleOnlyCatchPatterns: [
          /\bcatch\s*\([^)]*\)\s*\{\s*echo\s+/,
          /\bcatch\s*\([^)]*\)\s*\{\s*var_dump\s*\(/,
        ],
      },
      // PHPUnit assertion methods — ref: docs.phpunit.de
      validAssertions: [
        'assertEquals', 'assertNotEquals', 'assertSame', 'assertNotSame',
        'assertTrue', 'assertFalse', 'assertNull', 'assertNotNull',
        'assertEmpty', 'assertNotEmpty', 'assertCount',
        'assertContains', 'assertNotContains', 'assertArrayHasKey',
        'assertArrayNotHasKey', 'assertInstanceOf', 'assertNotInstanceOf',
        'assertGreaterThan', 'assertGreaterThanOrEqual',
        'assertLessThan', 'assertLessThanOrEqual',
        'assertStringContainsString', 'assertStringNotContainsString',
        'assertMatchesRegularExpression', 'assertDoesNotMatchRegularExpression',
        'assertFileExists', 'assertFileNotExists',
        'assertIsReadable', 'assertIsWritable',
        'assertJson', 'assertJsonStringEqualsJsonString',
        'assertThat',
      ],
    },
  },
}

// ─── Language Detection ─────────────────────────────────────────

/**
 * Detect language from a file path.
 * Returns the language key (e.g. 'javascript', 'python', 'go') or null.
 */
export function detectLanguage(filePath: string): string | null {
  const lower = filePath.toLowerCase()

  for (const [key, config] of Object.entries(LANGUAGE_CONFIG)) {
    for (const ext of config.extensions) {
      if (lower.endsWith(ext)) return key
    }
  }

  return null
}

/**
 * Check if a file path is a test file for its detected language.
 */
export function isTestFile(filePath: string): boolean {
  const lang = detectLanguage(filePath)
  if (!lang) return false

  const config = LANGUAGE_CONFIG[lang]
  return config.testPatterns.some(p => p.test(filePath))
}

/**
 * Check if a file path is a source file for its detected language.
 */
export function isSourceFile(filePath: string): boolean {
  const lang = detectLanguage(filePath)
  if (!lang) return false

  const config = LANGUAGE_CONFIG[lang]
  return config.sourcePatterns.some(p => p.test(filePath))
}
