#!/usr/bin/env tsx
/**
 * Mantiz Benchmark CLI Runner
 * 
 * Runs all 16 fixtures and prints a detailed accuracy report.
 * Usage: npx tsx scripts/run-benchmark.ts
 */

import { runBenchmark } from '../src/benchmark/runner'

async function main() {
  console.log('\n═══════════════════════════════════════════════')
  console.log('  🔬 MANTIZ BENCHMARK')
  console.log('═══════════════════════════════════════════════\n')

  console.time('⏱  Benchmark completed in')

  const results = await runBenchmark()

  console.timeEnd('⏱  Benchmark completed in')

  let totalPassed = 0
  let totalFixtures = 0

  for (const dataset of results) {
    console.log(`\n┌─ Dataset ${dataset.dataset}: ${dataset.label}`)
    console.log(`│    Accuracy: ${dataset.summary.accuracyPct}% (${dataset.summary.passed}/${dataset.summary.total} passed)`)
    console.log(`│    Avg Score: ${dataset.summary.avgScore}/100`)
    console.log('│')
    
    for (const f of dataset.fixtures) {
      const icon = f.passed ? '✅' : '❌'
      const mark = f.passed ? 'PASS' : 'FAIL'
      console.log(`│  ${icon} ${f.name.padEnd(38)} ${mark}  expected=${f.expectedScore}  actual=${f.actualScore}  margin=${f.margin}  findings=${f.totalFindings}  high=${f.highCount}`)
    }
    
    totalPassed += dataset.summary.passed
    totalFixtures += dataset.summary.total
  }

  const overallPct = Math.round((totalPassed / totalFixtures) * 100)

  console.log('\n═══════════════════════════════════════════════')
  console.log(`  📊 OVERALL: ${overallPct}% (${totalPassed}/${totalFixtures} passed)`)
  console.log('═══════════════════════════════════════════════\n')
  
  // Show failing fixtures grouped
  const allFails = results.flatMap(d => d.fixtures.filter(f => !f.passed))
  if (allFails.length > 0) {
    console.log('⚠️  FAILURES TO INVESTIGATE:')
    for (const f of allFails) {
      console.log(`   - ${f.name}: expected ${f.expectedScore}, got ${f.actualScore} (diff: ${f.margin})`)
    }
    console.log()
  }
}

main().catch(console.error)
