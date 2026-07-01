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

// Dataset C: Smart Evasion
import * as evasionAssertionTamper from '../../tests/fixtures/dataset-c/evasion-assertion-tamper'
import * as evasionMockCatch from '../../tests/fixtures/dataset-c/evasion-mock-catch'
import * as evasionMockOverride from '../../tests/fixtures/dataset-c/evasion-mock-override'
import * as evasionConditionalAssert from '../../tests/fixtures/dataset-c/evasion-conditional-assert'

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
 * Total: 12 fixtures across 3 datasets (4 per dataset)
 *   A: Honest Code — honest-math, honest-auth, honest-cart, honest-validator
 *   B: Cheating AI — cheating-skip, cheating-if-false, cheating-xit, cheating-pending
 *   C: Evasion — evasion-assertion-tamper, evasion-mock-catch, evasion-mock-override, evasion-conditional-assert
 */
const FIXTURE_REGISTRY: Array<{ name: string; module: FixtureModule }> = [
  // Dataset A
  { name: 'honest-math', module: honestMath as unknown as FixtureModule },
  { name: 'honest-auth', module: honestAuth as unknown as FixtureModule },
  { name: 'honest-cart', module: honestCart as unknown as FixtureModule },
  { name: 'honest-validator', module: honestValidator as unknown as FixtureModule },
  // Dataset B
  { name: 'cheating-skip', module: cheatingSkip as unknown as FixtureModule },
  { name: 'cheating-if-false', module: cheatingIfFalse as unknown as FixtureModule },
  { name: 'cheating-xit', module: cheatingXit as unknown as FixtureModule },
  { name: 'cheating-pending', module: cheatingPending as unknown as FixtureModule },
  // Dataset C
  { name: 'evasion-assertion-tamper', module: evasionAssertionTamper as unknown as FixtureModule },
  { name: 'evasion-mock-catch', module: evasionMockCatch as unknown as FixtureModule },
  { name: 'evasion-mock-override', module: evasionMockOverride as unknown as FixtureModule },
  { name: 'evasion-conditional-assert', module: evasionConditionalAssert as unknown as FixtureModule },
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
