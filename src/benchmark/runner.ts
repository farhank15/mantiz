/**
 * Mantiz Benchmark Runner
 *
 * Runs all 5 detectors against every fixture file and reports accuracy.
 * Used by the /benchmark dashboard page to display results.
 */

import { scanDiff } from '../detectors/engine'

// Hardcoded imports — avoids import.meta.glob which breaks on Vercel serverless
// Dataset A: Honest Code
import * as honestMath from '../../tests/fixtures/dataset-a/honest-math'
import * as honestAuth from '../../tests/fixtures/dataset-a/honest-auth'
import * as honestCart from '../../tests/fixtures/dataset-a/honest-cart'
import * as honestValidator from '../../tests/fixtures/dataset-a/honest-validator'

// Dataset B: Cheating AI
import * as cheatingSkip from '../../tests/fixtures/dataset-b/cheating-skip'
import * as cheatingIfFalse from '../../tests/fixtures/dataset-b/cheating-if-false'
import * as cheatingXit from '../../tests/fixtures/dataset-b/cheating-xit'
import * as cheatingPending from '../../tests/fixtures/dataset-b/cheating-pending'
import * as cheatingPythonSkip from '../../tests/fixtures/dataset-b/cheating-python-skip'
import * as cheatingGoSkip from '../../tests/fixtures/dataset-b/cheating-go-skip'

// External Benchmarks (from documented cheating patterns - DebugML/UC Berkeley)
import * as cheatingPythonExternal from '../../tests/fixtures/dataset-b/cheating-python-external'
import * as cheatingGoExternal from '../../tests/fixtures/dataset-b/cheating-go-external'

// Dataset C: Smart Evasion
import * as evasionAssertionTamper from '../../tests/fixtures/dataset-c/evasion-assertion-tamper'
import * as evasionMockCatch from '../../tests/fixtures/dataset-c/evasion-mock-catch'
import * as evasionMockOverride from '../../tests/fixtures/dataset-c/evasion-mock-override'
import * as evasionConditionalAssert from '../../tests/fixtures/dataset-c/evasion-conditional-assert'

// Dataset FP: False Positive Scenarios (legitimate code that looks like cheating)
import * as fpLegitimateSkip from '../../tests/fixtures/dataset-fp/fp-legitimate-skip'
import * as fpLegitimateDescribeSkip from '../../tests/fixtures/dataset-fp/fp-legitimate-describe-skip'
import * as fpLegitimateTodo from '../../tests/fixtures/dataset-fp/fp-legitimate-todo'
import * as fpLegitimateXit from '../../tests/fixtures/dataset-fp/fp-legitimate-xit'
import * as fpIfFalseDebug from '../../tests/fixtures/dataset-fp/fp-if-false-debug'
import * as fpWhileZero from '../../tests/fixtures/dataset-fp/fp-while-zero'
import * as fpConditionalSkipEnv from '../../tests/fixtures/dataset-fp/fp-conditional-skip-env'
import * as fpCommentedAssertionRefactor from '../../tests/fixtures/dataset-fp/fp-commented-assertion-refactor'
import * as fpAssertionLegitimateUpdate from '../../tests/fixtures/dataset-fp/fp-assertion-legitimate-update'
import * as fpLegitimateMockDb from '../../tests/fixtures/dataset-fp/fp-legitimate-mock-db'
import * as fpLegitimateMockApi from '../../tests/fixtures/dataset-fp/fp-legitimate-mock-api'
import * as fpMockSufficientAssertions from '../../tests/fixtures/dataset-fp/fp-mock-sufficient-assertions'
import * as fpConsoleErrorCatch from '../../tests/fixtures/dataset-fp/fp-console-error-catch'
import * as fpEmptyCatchBestEffort from '../../tests/fixtures/dataset-fp/fp-empty-catch-best-effort'
import * as fpEmptyFinallyResource from '../../tests/fixtures/dataset-fp/fp-empty-finally-resource'
import * as fpArrowFactory from '../../tests/fixtures/dataset-fp/fp-arrow-factory'
import * as fpSwitchDefaultNormal from '../../tests/fixtures/dataset-fp/fp-switch-default-normal'
import * as fpAsyncTryCatchLegit from '../../tests/fixtures/dataset-fp/fp-async-try-catch-legit'
import * as fpNativeArrayMethod from '../../tests/fixtures/dataset-fp/fp-native-array-method'
import * as fpValidCustomMatcher from '../../tests/fixtures/dataset-fp/fp-valid-custom-matcher'
import * as fpIntegrationSingleAssertion from '../../tests/fixtures/dataset-fp/fp-integration-single-assertion'
import * as fpSimpleUtilityTest from '../../tests/fixtures/dataset-fp/fp-simple-utility-test'
import * as fpGetterSetterTest from '../../tests/fixtures/dataset-fp/fp-getter-setter-test'

export interface BenchmarkResult {
  dataset: string
  label: string
  fixtures: FixtureResult[]
  summary: {
    total: number
    passed: number
    failed: number
    avgScore: number
    accuracyPct: number
  }
}

export interface FixtureResult {
  name: string
  expectedScore: number
  actualScore: number
  totalFindings: number
  highCount: number
  passed: boolean
  margin: number
}

interface FixtureModule {
  diff: string
  expected: {
    trustScore: number
    label: string
    dataset: string
  }
}

/**
 * All known fixtures with their names and module references.
 * This replaces import.meta.glob which is unreliable on Vercel serverless.
 *
 * Total: 38 fixtures across 4 datasets
 *   A: Honest Code — 4 fixtures
 *   B: Cheating AI — 8 fixtures
 *   C: Evasion — 4 fixtures
 *   FP: False Positive — 22 fixtures
 */
export const FIXTURE_REGISTRY: Array<{ name: string; module: FixtureModule }> = [
  // Dataset A: Honest Code
  { name: 'honest-math', module: honestMath as unknown as FixtureModule },
  { name: 'honest-auth', module: honestAuth as unknown as FixtureModule },
  { name: 'honest-cart', module: honestCart as unknown as FixtureModule },
  { name: 'honest-validator', module: honestValidator as unknown as FixtureModule },
  // Dataset B: Cheating AI
  { name: 'cheating-skip', module: cheatingSkip as unknown as FixtureModule },
  { name: 'cheating-if-false', module: cheatingIfFalse as unknown as FixtureModule },
  { name: 'cheating-xit', module: cheatingXit as unknown as FixtureModule },
  { name: 'cheating-pending', module: cheatingPending as unknown as FixtureModule },
  { name: 'cheating-python-skip', module: cheatingPythonSkip as unknown as FixtureModule },
  { name: 'cheating-go-skip', module: cheatingGoSkip as unknown as FixtureModule },
  // External Benchmarks (from documented cheating patterns)
  { name: 'cheating-python-external', module: cheatingPythonExternal as unknown as FixtureModule },
  { name: 'cheating-go-external', module: cheatingGoExternal as unknown as FixtureModule },
  // Dataset C: Smart Evasion
  { name: 'evasion-assertion-tamper', module: evasionAssertionTamper as unknown as FixtureModule },
  { name: 'evasion-mock-catch', module: evasionMockCatch as unknown as FixtureModule },
  { name: 'evasion-mock-override', module: evasionMockOverride as unknown as FixtureModule },
  { name: 'evasion-conditional-assert', module: evasionConditionalAssert as unknown as FixtureModule },
  // Dataset FP: False Positive Scenarios (22 fixtures)
  { name: 'fp-legitimate-skip', module: fpLegitimateSkip as unknown as FixtureModule },
  { name: 'fp-legitimate-describe-skip', module: fpLegitimateDescribeSkip as unknown as FixtureModule },
  { name: 'fp-legitimate-todo', module: fpLegitimateTodo as unknown as FixtureModule },
  { name: 'fp-legitimate-xit', module: fpLegitimateXit as unknown as FixtureModule },
  { name: 'fp-if-false-debug', module: fpIfFalseDebug as unknown as FixtureModule },
  { name: 'fp-while-zero', module: fpWhileZero as unknown as FixtureModule },
  { name: 'fp-conditional-skip-env', module: fpConditionalSkipEnv as unknown as FixtureModule },
  { name: 'fp-commented-assertion-refactor', module: fpCommentedAssertionRefactor as unknown as FixtureModule },
  { name: 'fp-assertion-legitimate-update', module: fpAssertionLegitimateUpdate as unknown as FixtureModule },
  { name: 'fp-legitimate-mock-db', module: fpLegitimateMockDb as unknown as FixtureModule },
  { name: 'fp-legitimate-mock-api', module: fpLegitimateMockApi as unknown as FixtureModule },
  { name: 'fp-mock-sufficient-assertions', module: fpMockSufficientAssertions as unknown as FixtureModule },
  { name: 'fp-console-error-catch', module: fpConsoleErrorCatch as unknown as FixtureModule },
  { name: 'fp-empty-catch-best-effort', module: fpEmptyCatchBestEffort as unknown as FixtureModule },
  { name: 'fp-empty-finally-resource', module: fpEmptyFinallyResource as unknown as FixtureModule },
  { name: 'fp-arrow-factory', module: fpArrowFactory as unknown as FixtureModule },
  { name: 'fp-switch-default-normal', module: fpSwitchDefaultNormal as unknown as FixtureModule },
  { name: 'fp-async-try-catch-legit', module: fpAsyncTryCatchLegit as unknown as FixtureModule },
  { name: 'fp-native-array-method', module: fpNativeArrayMethod as unknown as FixtureModule },
  { name: 'fp-valid-custom-matcher', module: fpValidCustomMatcher as unknown as FixtureModule },
  { name: 'fp-integration-single-assertion', module: fpIntegrationSingleAssertion as unknown as FixtureModule },
  { name: 'fp-simple-utility-test', module: fpSimpleUtilityTest as unknown as FixtureModule },
  { name: 'fp-getter-setter-test', module: fpGetterSetterTest as unknown as FixtureModule },
]

/**
 * Load all fixtures from the hardcoded registry.
 */
async function loadFixtures(): Promise<
  Array<{
    name: string
    diff: string
    expected: { trustScore: number; label: string; dataset: string }
  }>
> {
  const fixtures: Array<{
    name: string
    diff: string
    expected: { trustScore: number; label: string; dataset: string }
  }> = []

  for (const { name, module } of FIXTURE_REGISTRY) {
    if (module.diff && module.expected) {
      fixtures.push({ name, diff: module.diff, expected: module.expected })
    }
  }

  return fixtures
}

/**
 * Run benchmark: scan each fixture and compare with expected score.
 */
export async function runBenchmark(): Promise<BenchmarkResult[]> {
  const fixtures = await loadFixtures()

  // Group by dataset
  const grouped = new Map<string, FixtureResult[]>()
  const datasetLabels = new Map<string, string>()

  for (const fixture of fixtures) {
    const ds = fixture.expected.dataset
    datasetLabels.set(ds, fixture.expected.label)

    const result = scanDiff(fixture.diff)
    const actualScore = result.trustScore
    const expectedScore = fixture.expected.trustScore
    const margin = Math.abs(actualScore - expectedScore)
    const passed = margin <= 20 // Allow 20pt tolerance

    grouped.set(ds, [
      ...(grouped.get(ds) || []),
      {
        name: fixture.name,
        expectedScore,
        actualScore,
        totalFindings: result.summary.totalFindings,
        highCount: result.summary.highCount,
        passed,
        margin,
      },
    ])
  }

  // Build results per dataset
  const results: BenchmarkResult[] = []

  for (const [dataset, fixtures] of grouped) {
    const total = fixtures.length
    const passed = fixtures.filter((f) => f.passed).length
    const failed = total - passed
    const avgScore =
      fixtures.reduce((sum, f) => sum + f.actualScore, 0) / total
    const accuracyPct = Math.round((passed / total) * 100)

    results.push({
      dataset,
      label: datasetLabels.get(dataset) || dataset,
      fixtures,
      summary: { total, passed, failed, avgScore: Math.round(avgScore), accuracyPct },
    })
  }

  return results.sort((a, b) => a.dataset.localeCompare(b.dataset))
}
