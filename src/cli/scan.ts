#!/usr/bin/env node
/**
 * Mantiz CLI — AI Lie Detector for Coding Agents
 *
 * Usage: npx tsx src/cli/scan.ts
 *
 * Reads the current git diff, runs all 5 detectors, prints results,
 * auto-appends a row to LOOP.md, and exits with code 1 if trust score < 70.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanDiffAsync } from '../detectors/engine'
import { generatePatches, applyPatchesToFiles } from '../detectors/heal-engine'
import type { CodePatch } from '../detectors/heal-engine'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')
const LOOP_MD_PATH = resolve(PROJECT_ROOT, 'LOOP.md')

const PASS_THRESHOLD = 70

/**
 * Get the current git diff. Falls back to staged diff if no unstaged changes.
 */
function getGitDiff(): string {
  try {
    // Try unstaged diff first
    const diff = execSync('git diff', { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    if (diff.trim()) return diff

    // Fall back to staged diff
    const staged = execSync('git diff --staged', { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    if (staged.trim()) return staged

    // Fall back to HEAD~1 diff
    const head = execSync('git diff HEAD~1', { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return head
  } catch {
    return ''
  }
}

/**
 * Get the current LOOP.md iteration number, or 0 if file doesn't exist.
 */
function getCurrentIteration(): number {
  if (!existsSync(LOOP_MD_PATH)) return 0
  const content = readFileSync(LOOP_MD_PATH, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim().startsWith('|'))
  // Subtract header (2 rows minimum: header + separator)
  return Math.max(0, lines.length - 2)
}

/**
 * Append a row to LOOP.md with scan results.
 */
function appendToLOOPMD(
  iteration: number,
  score: number,
  totalFindings: number,
  highCount: number,
  status: 'PASSED' | 'FAILED' | 'BLOCKED'
): void {
  const now = new Date().toISOString().split('T')[0]
  const findingsText = totalFindings > 0
    ? `${totalFindings} findings (${highCount} high)`
    : 'None'

  const row = `| ${iteration} | Mantiz CLI | auto-scan | ${score}/100 | ${findingsText} | ${status} | Manual review needed | ${now} |\n`

  // Create file with header if it doesn't exist
  if (!existsSync(LOOP_MD_PATH)) {
    const header = `# 🗺️ LOOP.md — Mantiz Agentic Loop Log\n\n| # | Maker | Action | Score | Findings | Status | Next Step | Date |\n|---|---|---|---|---|---|---|---|\n`
    writeFileSync(LOOP_MD_PATH, header + row, 'utf-8')
  } else {
    appendFileSync(LOOP_MD_PATH, row, 'utf-8')
  }
}

/**
 * Print colored output to the terminal.
 */
function printResults(score: number, totalFindings: number, findings: Array<{ confidence: string; filePath: string; lineStart: number; explanation: string; evidenceExcerpt: string }>): void {
  const scoreColor = score >= 80 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m'
  const scoreLabel = score >= 80 ? 'CLEAN ✅' : score >= 50 ? 'SUSPICIOUS 🟡' : 'CHEATING DETECTED 🔴'
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'
  const dim = '\x1b[2m'

  console.log('\n' + '='.repeat(50))
  console.log(`${bold}🔍  MANTIZ SCAN RESULTS${reset}`)
  console.log('='.repeat(50))

  console.log(`\n${bold}Trust Score:${reset} ${scoreColor}${score}/100${reset} ${scoreLabel}`)
  console.log(`${dim}Threshold:${reset} ${PASS_THRESHOLD} ${dim}(scores below this will fail the build)${reset}`)

  console.log(`\n${bold}Summary:${reset}`)
  console.log(`  Findings:  ${totalFindings}`)
  console.log(`  Verdict:   ${scoreColor}${scoreLabel}${reset}`)

  if (findings.length > 0) {
    console.log(`\n${bold}Findings:${reset}`)
    for (const f of findings) {
      const confColor = f.confidence === 'high' ? '\x1b[31m' : f.confidence === 'medium' ? '\x1b[33m' : '\x1b[90m'
      console.log(`  ${confColor}${f.confidence.toUpperCase()}${reset}  ${f.filePath}:${f.lineStart}`)
      console.log(`       ${dim}${f.explanation}${reset}`)
    }
  } else {
    console.log(`\n  ${bold}No cheating detected.${reset} ${dim}Code looks honest.${reset}`)
  }

  console.log(`\n${dim}${'='.repeat(50)}${reset}\n`)
}

/**
 * Print auto-fix suggestions and optionally apply them.
 */
function handleAutoFix(patches: CodePatch[], args: string[]): void {
  const fixFlag = args.find(a => a.startsWith('--fix'))
  if (!fixFlag || patches.length === 0) return

  const isInteractive = fixFlag === '--fix=interactive'
  const fixAll = fixFlag === '--fix'

  if (!fixAll && !isInteractive) return

  console.log(`\n${'='.repeat(50)}`)
  console.log('\x1b[1m🔧  MANTIZ AUTO-HEAL ENGINE\x1b[0m')
  console.log('='.repeat(50))

  console.log(`\nFound ${patches.length} auto-fixable issue(s):\n`)

  let toApply = patches

  if (isInteractive) {
    toApply = []
    for (const patch of patches) {
      const riskColor = patch.riskLevel === 'safe'
        ? '\x1b[32m'
        : patch.riskLevel === 'moderate'
          ? '\x1b[33m'
          : '\x1b[31m'

      console.log(`  ${riskColor}[${patch.riskLevel.toUpperCase()}]\x1b[0m ${patch.description}`)
      console.log(`       ${'\x1b[2m'}${patch.filePath}:${patch.lineStart}${'\x1b[0m'}`)
      console.log(`       Original: ${'\x1b[31m'}${patch.originalCode.substring(0, 80)}${'\x1b[0m'}`)
      console.log(`       Fixed:    ${'\x1b[32m'}${patch.fixedCode.substring(0, 80)}${'\x1b[0m'}`)

      // Simple yes/no prompt via stdin
      // For non-interactive terminals, skip
      toApply.push(patch)
    }
    console.log(`\n${'\x1b[33m'}ℹ️  Interactive mode: apply with caution. Use --fix for auto-apply.${'\x1b[0m'}`)
  }

  // Apply patches to files
  const results = applyPatchesToFiles(patches, { includeRisky: false })
  const applied = results.filter(r => r.applied > 0).length
  const skipped = results.filter(r => r.skipped > 0).length

  console.log(`\n  ${'\x1b[32m'}✓ ${applied} fix(es) applied${'\x1b[0m'}`)
  if (skipped > 0) {
    console.log(`  ${'\x1b[33m'}⚠ ${skipped} fix(es) skipped (could not match source)${'\x1b[0m'}`)
  }

  console.log(`  ${'\x1b[2m'}💾 Fix suggestions generated. Run 'git diff' to review changes.${'\x1b[0m'}`)
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const startTime = Date.now()
  const args = process.argv.slice(2)

  // 1. Get the diff
  const diff = getGitDiff()
  if (!diff || !diff.trim()) {
    console.log('\x1b[33m⚠️  No git diff found. Run `git add` first or make some changes.\x1b[0m')
    console.log('   Tip: Mantiz scans the diff between your working tree and the last commit.\n')
    process.exit(0)
  }

  // 2. Run all detectors (async for AI + historical)
  const result = await scanDiffAsync(diff)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

  // 3. Generate patches (for auto-fix)
  const patches = generatePatches(result.findings, result.files)

  // 4. Print results
  printResults(result.trustScore, result.findings.length, result.findings.map(f => ({
    confidence: f.confidence,
    filePath: f.filePath,
    lineStart: f.lineStart,
    explanation: f.explanation,
    evidenceExcerpt: f.evidenceExcerpt,
  })))

  // 5. Print AST findings badge
  const astCount = result.findings.filter(f => f.explanation.startsWith('🔬')).length
  if (astCount > 0) {
    console.log(`\x1b[36m🔬  ${astCount} AST-level finding(s) — structural manipulation detected\x1b[0m`)
  }

  // 6. Print Historical findings badge
  const histCount = result.findings.filter(f => f.explanation.startsWith('📊')).length
  if (histCount > 0) {
    console.log(`\x1b[35m📊  ${histCount} Historical behavioral finding(s) — author pattern anomalies detected\x1b[0m`)
  }

  // 7. Handle auto-fix if --fix flag is passed
  if (patches.length > 0) {
    handleAutoFix(patches, args)
  }

  // 8. Log to LOOP.md
  const iteration = getCurrentIteration() + 1
  const status = result.trustScore >= PASS_THRESHOLD ? 'PASSED' : 'BLOCKED'
  appendToLOOPMD(iteration, result.trustScore, result.findings.length, result.summary.highCount, status)
  console.log(`\x1b[2m📝 LOOP.md updated — iteration ${iteration} logged\x1b[0m`)
  console.log(`\x1b[2m⚡ Scan completed in ${elapsed}s\x1b[0m\n`)

  // 9. Show fix instructions if score is low
  if (result.trustScore < PASS_THRESHOLD && result.fixInstructions.length > 0) {
    console.log('\x1b[33m📋 Suggested fixes for AI agent:\x1b[0m')
    for (const fix of result.fixInstructions) {
      console.log(`  • ${fix.instruction}`)
    }
    console.log('')
  }

  // 10. Exit with appropriate code
  if (result.trustScore < PASS_THRESHOLD) {
    console.log('\x1b[31m✗ BUILD FAILED — Trust score below 70 threshold\x1b[0m\n')
    process.exit(1)
  }

  console.log('\x1b[32m✓ BUILD PASSED — All checks clean\x1b[0m\n')
  process.exit(0)
}

main()
