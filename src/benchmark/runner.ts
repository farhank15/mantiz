/**
 * Mantiz Benchmark Runner
 *
 * Runs all 5 detectors against every fixture file and reports accuracy.
 * Used by the /benchmark dashboard page to display results.
 */

import { scanDiff } from '../detectors/engine'

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

/**
 * Load all fixtures dynamically. Falls back to known fixtures.
 */
async function loadFixtures(): Promise<
  Array<{
    name: string
    diff: string
    expected: { trustScore: number; label: string; dataset: string }
  }>
> {
  // Dynamic import of all fixture files
  const modules = import.meta.glob('/tests/fixtures/**/*.ts', { eager: true })
  const fixtures: Array<{
    name: string
    diff: string
    expected: { trustScore: number; label: string; dataset: string }
  }> = []

  for (const [path, mod] of Object.entries(modules)) {
    const m = mod as { diff?: string; expected?: { trustScore: number; label: string; dataset: string } }
    if (m.diff && m.expected) {
      const name = path.split('/').pop()?.replace('.ts', '') || path
      fixtures.push({ name, diff: m.diff, expected: m.expected })
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
