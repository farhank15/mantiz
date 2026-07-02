#!/usr/bin/env tsx
/**
 * Mantiz Async Benchmark Runner
 * 
 * Uses scanDiffAsync (Tree-sitter WASM) instead of scanDiff (heuristic).
 * Compares results with the sync (heuristic) benchmark.
 * 
 * Supported languages via Tree-sitter:
 * - Python (verified)
 * - Go (verified)
 * 
 * Runs against ALL 39 fixtures and reports:
 * - Async scores
 * - Delta from heuristic scores
 * - Which fixtures changed (improved/got worse)
 */

import { scanDiff, scanDiffAsync } from '../src/detectors/engine'

// ─── Fixture imports ─────────────────────────────────────────────
import * as honestMath from '../tests/fixtures/dataset-a/honest-math'
import * as honestAuth from '../tests/fixtures/dataset-a/honest-auth'
import * as honestCart from '../tests/fixtures/dataset-a/honest-cart'
import * as honestValidator from '../tests/fixtures/dataset-a/honest-validator'
import * as cheatingSkip from '../tests/fixtures/dataset-b/cheating-skip'
import * as cheatingIfFalse from '../tests/fixtures/dataset-b/cheating-if-false'
import * as cheatingXit from '../tests/fixtures/dataset-b/cheating-xit'
import * as cheatingPending from '../tests/fixtures/dataset-b/cheating-pending'
import * as cheatingPythonSkip from '../tests/fixtures/dataset-b/cheating-python-skip'
import * as cheatingGoSkip from '../tests/fixtures/dataset-b/cheating-go-skip'
import * as cheatingPythonExternal from '../tests/fixtures/dataset-b/cheating-python-external'
import * as cheatingGoExternal from '../tests/fixtures/dataset-b/cheating-go-external'
import * as evasionAssertionTamper from '../tests/fixtures/dataset-c/evasion-assertion-tamper'
import * as evasionMockCatch from '../tests/fixtures/dataset-c/evasion-mock-catch'
import * as evasionMockOverride from '../tests/fixtures/dataset-c/evasion-mock-override'
import * as evasionConditionalAssert from '../tests/fixtures/dataset-c/evasion-conditional-assert'
import * as fpLegitimateSkip from '../tests/fixtures/dataset-fp/fp-legitimate-skip'
import * as fpLegitimateDescribeSkip from '../tests/fixtures/dataset-fp/fp-legitimate-describe-skip'
import * as fpLegitimateTodo from '../tests/fixtures/dataset-fp/fp-legitimate-todo'
import * as fpLegitimateXit from '../tests/fixtures/dataset-fp/fp-legitimate-xit'
import * as fpIfFalseDebug from '../tests/fixtures/dataset-fp/fp-if-false-debug'
import * as fpWhileZero from '../tests/fixtures/dataset-fp/fp-while-zero'
import * as fpConditionalSkipEnv from '../tests/fixtures/dataset-fp/fp-conditional-skip-env'
import * as fpCommentedAssertionRefactor from '../tests/fixtures/dataset-fp/fp-commented-assertion-refactor'
import * as fpAssertionLegitimateUpdate from '../tests/fixtures/dataset-fp/fp-assertion-legitimate-update'
import * as fpLegitimateMockDb from '../tests/fixtures/dataset-fp/fp-legitimate-mock-db'
import * as fpLegitimateMockApi from '../tests/fixtures/dataset-fp/fp-legitimate-mock-api'
import * as fpMockSufficientAssertions from '../tests/fixtures/dataset-fp/fp-mock-sufficient-assertions'
import * as fpConsoleErrorCatch from '../tests/fixtures/dataset-fp/fp-console-error-catch'
import * as fpEmptyCatchBestEffort from '../tests/fixtures/dataset-fp/fp-empty-catch-best-effort'
import * as fpEmptyFinallyResource from '../tests/fixtures/dataset-fp/fp-empty-finally-resource'
import * as fpArrowFactory from '../tests/fixtures/dataset-fp/fp-arrow-factory'
import * as fpSwitchDefaultNormal from '../tests/fixtures/dataset-fp/fp-switch-default-normal'
import * as fpAsyncTryCatchLegit from '../tests/fixtures/dataset-fp/fp-async-try-catch-legit'
import * as fpNativeArrayMethod from '../tests/fixtures/dataset-fp/fp-native-array-method'
import * as fpValidCustomMatcher from '../tests/fixtures/dataset-fp/fp-valid-custom-matcher'
import * as fpIntegrationSingleAssertion from '../tests/fixtures/dataset-fp/fp-integration-single-assertion'
import * as fpSimpleUtilityTest from '../tests/fixtures/dataset-fp/fp-simple-utility-test'
import * as fpGetterSetterTest from '../tests/fixtures/dataset-fp/fp-getter-setter-test'

interface FixtureEntry {
  name: string
  diff: string
  expected: { trustScore: number; label: string; dataset: string }
}

const FIXTURES: FixtureEntry[] = [
  // Dataset A
  { name: 'honest-math', ...honestMath },
  { name: 'honest-auth', ...honestAuth },
  { name: 'honest-cart', ...honestCart },
  { name: 'honest-validator', ...honestValidator },
  // Dataset B
  { name: 'cheating-skip', ...cheatingSkip },
  { name: 'cheating-if-false', ...cheatingIfFalse },
  { name: 'cheating-xit', ...cheatingXit },
  { name: 'cheating-pending', ...cheatingPending },
  { name: 'cheating-python-skip', ...cheatingPythonSkip },
  { name: 'cheating-go-skip', ...cheatingGoSkip },
  { name: 'cheating-python-external', ...cheatingPythonExternal },
  { name: 'cheating-go-external', ...cheatingGoExternal },
  // Dataset C
  { name: 'evasion-assertion-tamper', ...evasionAssertionTamper },
  { name: 'evasion-mock-catch', ...evasionMockCatch },
  { name: 'evasion-mock-override', ...evasionMockOverride },
  { name: 'evasion-conditional-assert', ...evasionConditionalAssert },
  // Dataset FP
  { name: 'fp-legitimate-skip', ...fpLegitimateSkip },
  { name: 'fp-legitimate-describe-skip', ...fpLegitimateDescribeSkip },
  { name: 'fp-legitimate-todo', ...fpLegitimateTodo },
  { name: 'fp-legitimate-xit', ...fpLegitimateXit },
  { name: 'fp-if-false-debug', ...fpIfFalseDebug },
  { name: 'fp-while-zero', ...fpWhileZero },
  { name: 'fp-conditional-skip-env', ...fpConditionalSkipEnv },
  { name: 'fp-commented-assertion-refactor', ...fpCommentedAssertionRefactor },
  { name: 'fp-assertion-legitimate-update', ...fpAssertionLegitimateUpdate },
  { name: 'fp-legitimate-mock-db', ...fpLegitimateMockDb },
  { name: 'fp-legitimate-mock-api', ...fpLegitimateMockApi },
  { name: 'fp-mock-sufficient-assertions', ...fpMockSufficientAssertions },
  { name: 'fp-console-error-catch', ...fpConsoleErrorCatch },
  { name: 'fp-empty-catch-best-effort', ...fpEmptyCatchBestEffort },
  { name: 'fp-empty-finally-resource', ...fpEmptyFinallyResource },
  { name: 'fp-arrow-factory', ...fpArrowFactory },
  { name: 'fp-switch-default-normal', ...fpSwitchDefaultNormal },
  { name: 'fp-async-try-catch-legit', ...fpAsyncTryCatchLegit },
  { name: 'fp-native-array-method', ...fpNativeArrayMethod },
  { name: 'fp-valid-custom-matcher', ...fpValidCustomMatcher },
  { name: 'fp-integration-single-assertion', ...fpIntegrationSingleAssertion },
  { name: 'fp-simple-utility-test', ...fpSimpleUtilityTest },
  { name: 'fp-getter-setter-test', ...fpGetterSetterTest },
]

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  🔬 MANTIZ ASYNC BENCHMARK (Tree-sitter WASM vs Heuristic)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  let syncPassed = 0
  let asyncPassed = 0
  let changed = 0
  let improved = 0
  let gotWorse = 0

  const results: Array<{
    name: string
    dataset: string
    syncScore: number
    asyncScore: number
    delta: number
    syncFindings: number
    asyncFindings: number
  }> = []

  for (const fixture of FIXTURES) {
    process.stdout.write(`  ⏳ ${fixture.name.padEnd(35)}`)

    // Sync (heuristic)
    const syncResult = scanDiff(fixture.diff)
    
    // Async (Tree-sitter WASM) — wrapped in try/catch for safety
    let asyncResult
    try {
      asyncResult = await scanDiffAsync(fixture.diff)
    } catch {
      asyncResult = syncResult // Fallback to sync if async fails
    }

    const syncScore = syncResult.trustScore
    const asyncScore = asyncResult.trustScore
    const delta = asyncScore - syncScore
    const expected = fixture.expected.trustScore

    const syncPass = Math.abs(syncScore - expected) <= 20
    const asyncPass = Math.abs(asyncScore - expected) <= 20
    if (syncPass) syncPassed++
    if (asyncPass) asyncPassed++

    if (delta !== 0) {
      changed++
      if (delta > 0) improved++
      else gotWorse++
    }

    results.push({
      name: fixture.name,
      dataset: fixture.expected.dataset,
      syncScore,
      asyncScore,
      delta,
      syncFindings: syncResult.summary.totalFindings,
      asyncFindings: asyncResult.summary.totalFindings,
    })

    const icon = delta > 0 ? '✅' : delta < 0 ? '📉' : '➖'
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`
    console.log(`\r  ${delta === 0 ? '➖' : icon} ${fixture.name.padEnd(35)} sync=${syncScore}  async=${asyncScore}  Δ=${deltaStr}  findings:${syncResult.summary.totalFindings}→${asyncResult.summary.totalFindings}`)
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  📊 COMPARISON SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const totalChangedForDataset = (ds: string) => results.filter(r => r.dataset === ds && r.delta !== 0)
  const avgDeltaForDataset = (ds: string) => {
    const r = results.filter(r => r.dataset === ds)
    if (r.length === 0) return 0
    return Math.round(r.reduce((s, r) => s + r.delta, 0) / r.length)
  }

  for (const ds of ['A', 'B', 'C', 'FP']) {
    const r = results.filter(r => r.dataset === ds)
    const changed = totalChangedForDataset(ds)
    const avgDelta = avgDeltaForDataset(ds)
    const improved = r.filter(x => x.delta > 0).length
    const worsened = r.filter(x => x.delta < 0).length
    console.log(`  Dataset ${ds}: ${r.length} fixtures, ${changed.length} changed, avg Δ=${avgDelta > 0 ? '+' : ''}${avgDelta} (${improved} improved, ${worsened} worse)`)
  }

  console.log(`\n  Total changed: ${changed}/${FIXTURES.length} fixtures`)
  console.log(`  Improved (Tree-sitter better): ${improved}`)
  console.log(`  Got worse (Tree-sitter worse): ${gotWorse}`)

  console.log('\n  --- Per-fixture delta > 5 ---')
  for (const r of results) {
    if (Math.abs(r.delta) > 5) {
      const dir = r.delta > 0 ? '🔺 IMPROVED' : '🔻 WORSENED'
      console.log(`  ${dir} ${r.name}: ${r.syncScore} → ${r.asyncScore} (Δ=${r.delta})`)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
