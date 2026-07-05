/**
 * Mantiz Auto-Heal Engine
 *
 * Takes scan findings and generates actual fixed code.
 * Mantiz doesn't JUST detect cheating — it can automatically
 * revert the cheating patterns and restore honest code.
 *
 * Multi-language support: Python, Go, Java, Ruby, Rust, PHP, JS/TS
 * Fix modes: template-based (fast) + AI-driven (smart fallback)
 *
 * Usage:
 *   npx mantiz scan --fix          # Auto-fix all fixable issues
 *   npx mantiz scan --fix=interactive  # Prompt before each fix
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Finding, ParsedDiff } from './types'
import { detectLanguage, LANGUAGE_CONFIG } from './language-registry'

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
  /** Whether this patch was AI-generated (vs template) */
  aiGenerated?: boolean
}

// ─── AI Configuration ────────────────────────────────────────────

interface AIProvider {
  name: string
  baseUrl: string
  model: string
  apiKey: string | undefined
}

const FIX_PROVIDER: AIProvider = {
  name: 'Fireworks AI',
  baseUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
  model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  apiKey: typeof process !== 'undefined' ? process.env.FIREWORKS_API_KEY : undefined,
}

const FIX_FALLBACK: AIProvider = {
  name: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile',
  apiKey: typeof process !== 'undefined' ? process.env.GROQ_API_KEY : undefined,
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Get comment syntax for a given language.
 */
function getComment(lang: string | null, text: string): string {
  const config = lang && LANGUAGE_CONFIG[lang] ? LANGUAGE_CONFIG[lang].commentSyntax : LANGUAGE_CONFIG.javascript.commentSyntax
  const prefix = config.singleLine[0] || '//'
  return `${prefix} ${text}`
}

/**
 * Detect language from a finding's file path.
 */
function detectLang(finding: Finding): string | null {
  return detectLanguage(finding.filePath)
}

// ─── Multi-Language Disabled Assertion Patches ────────────────────

function generateDisabledAssertionPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt
  const lang = detectLang(finding)

  // ── JS/TS: .skip() removal ──────────────────────────────────
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

  // ── JS/TS: xit/xtest/xdescribe → it/test/describe ───────────
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

  // ── JS/TS: fit/fdescribe → it/describe ──────────────────────
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

  // ── JS/TS: if(false) wrapping ───────────────────────────────
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

  // ── JS/TS: commented-out assertions ─────────────────────────
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

  // ── Python: @pytest.mark.skip ────────────────────────────────
  if (lang === 'python') {
    // @pytest.mark.skip → remove decorator
    const pySkipDecorator = evidence.match(/^\s*@pytest\.mark\.skip\s*$/)
    if (pySkipDecorator) {
      return {
        patternType: 'disabled_assertion',
        description: `Remove @pytest.mark.skip decorator — test will be silently skipped.`,
        originalCode: evidence,
        fixedCode: `# ${evidence.trim()}  # TODO: Remove skip or add proper skip condition`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }

    // @pytest.mark.skipif(...) → comment out
    const pySkipIf = evidence.match(/^\s*@pytest\.mark\.skipif\s*\(/)
    if (pySkipIf) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out @pytest.mark.skipif — conditional skip bypasses test execution.`,
        originalCode: evidence,
        fixedCode: `# ${evidence.trim()}  # TODO: Remove conditional skip or justify properly`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }

    // @unittest.skip / @unittest.skipIf → comment out
    const pyUnitSkip = evidence.match(/^\s*@unittest\.(?:skip|skipIf)\s*\(/)
    if (pyUnitSkip) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out @unittest.skip — test will not run.`,
        originalCode: evidence,
        fixedCode: `# ${evidence.trim()}  # TODO: Remove skip or justify`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }

    // self.skipTest(...) → comment out
    const pySelfSkip = evidence.match(/(\s*)self\.skipTest\s*\(/)
    if (pySelfSkip) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out self.skipTest() — test will skip execution at runtime.`,
        originalCode: evidence,
        fixedCode: `# ${evidence.trim()}  # TODO: Remove skipTest call`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }

    // if False: → comment out block (partial — marks line)
    const pyIfFalse = evidence.match(/if\s+False\s*:/)
    if (pyIfFalse) {
      return {
        patternType: 'disabled_assertion',
        description: `Remove if False: — condition always false, code never runs.`,
        originalCode: evidence,
        fixedCode: `${getComment(lang, 'TODO: Remove if False: wrapper — code never executes')}\n${evidence}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }
  }

  // ── Go: t.Skip() / t.Skipf() / t.SkipNow() ───────────────────
  if (lang === 'go') {
    const goSkip = evidence.match(/(\s*)t\.(?:Skip|Skipf|SkipNow)\s*\(/)
    if (goSkip) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out t.Skip() — test will be skipped without verification.`,
        originalCode: evidence,
        fixedCode: `${getComment(lang, `TODO: Remove t.Skip() — test should verify behavior`)}\n${goSkip[1]}// ${evidence.trim()}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }
  }

  // ── Java: @Disabled / @Ignore ─────────────────────────────────
  if (lang === 'java') {
    const javaDisabled = evidence.match(/^\s*@(?:Disabled|Ignore)\b/)
    if (javaDisabled) {
      return {
        patternType: 'disabled_assertion',
        description: `Remove @Disabled annotation — test will not run.`,
        originalCode: evidence,
        fixedCode: `// ${evidence.trim()}  // TODO: Remove @Disabled or add proper condition`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }

    const javaAssume = evidence.match(/(\s*)(assumeTrue|assumeFalse)\s*\(/)
    if (javaAssume) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out assumeTrue/assumeFalse — assumption failures skip the test silently.`,
        originalCode: evidence,
        fixedCode: `${getComment(lang, `TODO: Remove assumption — test may skip silently`)}\n${javaAssume[1]}// ${evidence.trim()}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }
  }

  // ── Ruby: xit / xdescribe / xcontext / pending ───────────────
  if (lang === 'ruby') {
    const rubyXit = evidence.match(/(\s*)(xit|xdescribe|xcontext|xspecify)\b/)
    if (rubyXit) {
      const prefix = rubyXit[2]
      const replacement = prefix === 'xit' ? 'it' : prefix === 'xdescribe' ? 'describe' : prefix === 'xcontext' ? 'context' : 'specify'
      return {
        patternType: 'disabled_assertion',
        description: `Change ${prefix} to ${replacement} — ${prefix} silently skips the test.`,
        originalCode: evidence,
        fixedCode: evidence.replace(prefix, replacement),
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'safe',
      }
    }

    const rubyPending = evidence.match(/(\s*)pending\b/)
    if (rubyPending) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out 'pending' — marks test as skipped without verification.`,
        originalCode: evidence,
        fixedCode: `${getComment(lang, `TODO: Remove pending — test should verify behavior`)}\n${rubyPending[1]}${evidence.trim()}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }
  }

  // ── Rust: #[ignore] ──────────────────────────────────────────
  if (lang === 'rust') {
    const rustIgnore = evidence.match(/^\s*#\[ignore\]/i)
    if (rustIgnore) {
      return {
        patternType: 'disabled_assertion',
        description: `Remove #[ignore] attribute — test will not run.`,
        originalCode: evidence,
        fixedCode: `// ${evidence.trim()}  // TODO: Remove #[ignore] or add conditional compilation`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }
  }

  // ── PHP: markTestSkipped() / markTestIncomplete() ────────────
  if (lang === 'php') {
    const phpSkip = evidence.match(/(\s*)(?:markTestSkipped|markTestIncomplete)\s*\(/)
    if (phpSkip) {
      return {
        patternType: 'disabled_assertion',
        description: `Comment out markTestSkipped() — test will skip without verification.`,
        originalCode: evidence,
        fixedCode: `${getComment(lang, `TODO: Remove skip — test should verify behavior`)}\n${phpSkip[1]}// ${evidence.trim()}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
      }
    }
  }

  return null
}

// ─── Multi-Language Silent Catch Patches ──────────────────────────

function generateSilentCatchPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt
  const lang = detectLang(finding)

  // ── JS/TS: empty catch ───────────────────────────────────────
  const emptyCatchMatch = evidence.match(/(catch\s*(?:\([^)]*\))?\s*\{)\s*(\}\s*$)/)
  if (emptyCatchMatch) {
    return {
      patternType: 'silent_catch_and_pass',
      description: `Add error logging to empty catch block — silent catch swallows errors.`,
      originalCode: evidence,
      fixedCode: `${emptyCatchMatch[1]}\n    console.error('[Mantiz] Caught error:', error);\n    ${getComment(lang, 'TODO: Add proper error handling')}\n  ${emptyCatchMatch[2]}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // ── JS/TS: TODO-only catch ───────────────────────────────────
  const todoCatchMatch = evidence.match(/(catch\s*(?:\([^)]*\))?\s*\{)\s*\/\/\s*(TODO|FIXME).*(\})/)
  if (todoCatchMatch) {
    return {
      patternType: 'silent_catch_and_pass',
      description: `Replace TODO-only catch with proper error handling.`,
      originalCode: evidence,
      fixedCode: evidence.replace(todoCatchMatch[0], `${todoCatchMatch[1]}\n    console.error('[Mantiz] Caught error:', error);\n    ${getComment(lang, 'TODO: Add proper error handling')}\n  ${todoCatchMatch[3]}`),
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // ── JS/TS: console-only catch ────────────────────────────────
  const consoleCatchMatch = evidence.match(/(catch\s*(?:\([^)]*\))?\s*\{)\s*console\.\w+\s*\([^)]*\)\s*;?\s*(\})/)
  if (consoleCatchMatch) {
    return {
      patternType: 'silent_catch_and_pass',
      description: `Replace console-only catch with proper error handling — logging without recovery is still a silent pass.`,
      originalCode: evidence,
      fixedCode: `${consoleCatchMatch[1]}\n    console.error('[Mantiz] Caught error:', error);\n    throw error; ${getComment(lang, 'Re-throw to fail the test')}\n  ${consoleCatchMatch[2]}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'risky',
    }
  }

  // ── Python: except: pass ──────────────────────────────────────
  if (lang === 'python') {
    const pyExceptPass = evidence.match(/(except\s*\w*\s*:)\s*pass\s*$/)
    if (pyExceptPass) {
      return {
        patternType: 'silent_catch_and_pass',
        description: `Replace 'except: pass' with proper error handling — silently swallows exceptions.`,
        originalCode: evidence,
        fixedCode: `${pyExceptPass[1]}\n    ${getComment(lang, 'TODO: Add proper error handling')}\n    print(f'[Mantiz] Caught error: {e}')\n    raise  # Re-raise to ensure test fails`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'risky',
      }
    }
  }

  // ── Go: if err != nil { return nil } ─────────────────────────
  if (lang === 'go') {
    const goReturnNil = evidence.match(/(if\s+err\s*!=\s*nil\s*\{\s*)return\s*(nil|0|"")\s*(\})/)
    if (goReturnNil) {
      return {
        patternType: 'silent_catch_and_pass',
        description: `Replace silent error return with error logging — errors are silently converted to zero values.`,
        originalCode: evidence,
        fixedCode: `${goReturnNil[1]}\n\t\t${getComment(lang, 'TODO: Add proper error handling')}\n\t\tlog.Printf("[Mantiz] Caught error: %v", err)\n\t\treturn fmt.Errorf("wrapping: %w", err)\n\t${goReturnNil[3]}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'risky',
      }
    }
  }

  // ── Java: catch (E e) { } ────────────────────────────────────
  if (lang === 'java') {
    const javaEmptyCatch = evidence.match(/(catch\s*\([^)]*\)\s*\{)\s*(\}\s*$)/)
    if (javaEmptyCatch) {
      return {
        patternType: 'silent_catch_and_pass',
        description: `Add error handling to empty catch block — silently swallows exceptions.`,
        originalCode: evidence,
        fixedCode: `${javaEmptyCatch[1]}\n        ${getComment(lang, 'TODO: Add proper error handling')}\n        System.err.println("[Mantiz] Caught error: " + e.getMessage());\n        throw e;  // Re-throw to fail the test\n    ${javaEmptyCatch[2]}`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'risky',
      }
    }
  }

  // ── Ruby: rescue => e; end (empty) ──────────────────────────
  if (lang === 'ruby') {
    const rubyEmptyRescue = evidence.match(/(rescue\s+\w*)\s*$/)
    if (rubyEmptyRescue) {
      return {
        patternType: 'silent_catch_and_pass',
        description: `Add error handling to rescue block — silently swallows exceptions.`,
        originalCode: evidence,
        fixedCode: `${rubyEmptyRescue[1]}\n  ${getComment(lang, 'TODO: Add proper error handling')}\n  puts "[Mantiz] Caught error: \#{e.message}"\n  raise  # Re-raise to fail the test`,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'risky',
      }
    }
  }

  return null
}

// ─── Hallucinated Assertion Patches ──────────────────────────────

function generateHallucinationPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt

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

// ─── Mock-to-Avoid Patches ───────────────────────────────────────

function generateMockPatches(
  finding: Finding,
  _file: ParsedDiff | undefined,
): CodePatch | null {
  const evidence = finding.evidenceExcerpt
  const lang = detectLang(finding)

  // JS/TS: jest.mock / vi.mock
  const jsMock = evidence.match(/(jest|vi)\.mock\s*\(/)
  if (jsMock) {
    return {
      patternType: 'mock_to_avoid_failure',
      description: `Add real-path test alongside mock — mock bypasses real implementation.`,
      originalCode: evidence,
      fixedCode: `${getComment(lang || 'javascript', 'TODO: Add real-path test for this module')}\n// ${evidence}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Python: @patch / unittest.mock.patch
  const pyPatch = evidence.match(/@(?:mock\.)?patch\s*\(/)
  if (pyPatch) {
    return {
      patternType: 'mock_to_avoid_failure',
      description: `Add real-path test alongside @patch — mock bypasses real implementation.`,
      originalCode: evidence,
      fixedCode: `${getComment('python', 'TODO: Add real-path test alongside this mock')}\n${evidence}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Java: Mockito.mock / @Mock
  const javaMock = evidence.match(/Mockito\.mock\s*\(|@Mock\b/)
  if (javaMock) {
    return {
      patternType: 'mock_to_avoid_failure',
      description: `Add real-path test alongside mock — Mockito bypasses real implementation.`,
      originalCode: evidence,
      fixedCode: `${getComment('java', 'TODO: Add real-path test alongside mock')}\n${evidence}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Go: testify mock
  const goMock = evidence.match(/\.On\s*\(.*\)\.Return\s*\(/)
  if (goMock) {
    return {
      patternType: 'mock_to_avoid_failure',
      description: `Add real-path test alongside testify mock — mock bypasses real implementation.`,
      originalCode: evidence,
      fixedCode: `${getComment('go', 'TODO: Add real-path test alongside mock')}\n${evidence}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  // Ruby: allow().to receive
  const rubyMock = evidence.match(/allow\(.*\)\.to\s+receive/)
  if (rubyMock) {
    return {
      patternType: 'mock_to_avoid_failure',
      description: `Add real-path test alongside RSpec mock — mock bypasses real implementation.`,
      originalCode: evidence,
      fixedCode: `${getComment('ruby', 'TODO: Add real-path test alongside mock')}\n${evidence}`,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      riskLevel: 'moderate',
    }
  }

  return null
}

// ─── AI-Driven Fix Generation ────────────────────────────────────

async function callAIForFix(
  evidence: string,
  patternType: string,
  lang: string | null,
  filePath: string,
): Promise<string | null> {
  const provider = FIX_PROVIDER.apiKey ? FIX_PROVIDER : FIX_FALLBACK
  if (!provider.apiKey) return null

  const langName = lang && LANGUAGE_CONFIG[lang] ? LANGUAGE_CONFIG[lang].name : 'Unknown'

  const prompt = `You are Mantiz, an AI code fixer. Given a detected cheating pattern in a ${langName} test file, generate the fixed version of the SINGLE line of code shown.

PATTERN TYPE: ${patternType}
LANGUAGE: ${langName}
BROKEN CODE: "${evidence}"

Rules:
1. Return ONLY the exact replacement line of code — no explanations, no markdown, no JSON
2. Keep the same indentation/structure as the original
3. The fix should be the MINIMAL change needed to make the test honest
4. If the code is a comment or TODO, return it as-is (revert to assertion)
5. If the code uses a hallucinated matcher, replace with the standard equivalent
6. If the code has empty catch/except, add console.error and re-throw

Return ONLY the fixed code line, nothing else.`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 256,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) return null

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>
    }
    return data.choices?.[0]?.message?.content || null
  } catch {
    return null
  }
}

/**
 * Generate AI-powered fix, falling back to template-based.
 */
async function generatePatchesAsync(
  findings: Finding[],
  files?: ParsedDiff[],
): Promise<CodePatch[]> {
  const patches = generatePatches(findings, files)
  if (patches.length > 0) return patches

  // If template-based didn't find a match, try AI-driven fix
  for (const finding of findings) {
    const aiFix = await callAIForFix(
      finding.evidenceExcerpt,
      finding.patternType,
      detectLang(finding),
      finding.filePath,
    )

    if (aiFix && aiFix !== finding.evidenceExcerpt) {
      patches.push({
        patternType: finding.patternType,
        description: `AI-generated fix for ${finding.patternType} in ${detectLang(finding) || 'unknown'} file.`,
        originalCode: finding.evidenceExcerpt,
        fixedCode: aiFix,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        riskLevel: 'moderate',
        aiGenerated: true,
      })
    }
  }

  return patches
}

// ─── Main Patch Generator ──────────────────────────────────────

/**
 * Generate all applicable code patches from findings (sync).
 */
export function generatePatches(
  findings: Finding[],
  files?: ParsedDiff[],
): CodePatch[] {
  const patches: CodePatch[] = []
  const seen = new Set<string>()

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

  const sorted = [...patches].sort((a, b) => b.lineStart - a.lineStart)

  for (const patch of sorted) {
    const escapedOriginal = patch.originalCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const regex = new RegExp(escapedOriginal, 'g')
      if (regex.test(result)) {
        result = result.replace(regex, patch.fixedCode)
      }
    } catch {
      continue
    }
  }

  return result
}

/**
 * Apply patches to actual source files (not diff).
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

export { generatePatchesAsync }
