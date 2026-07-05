#!/usr/bin/env tsx
/**
 * Mantiz CLI — AI Lie Detector for Coding Agents
 *
 * Usage:
 *   mantiz-scan              # Scan local git diff
 *   mantiz-scan --diff <str> # Scan provided diff text
 *   mantiz-scan --json       # Output results as JSON
 *   mantiz-scan --help       # Show help
 *
 * Install:
 *   npm install -g mantiz-cli
 */

import { execSync } from 'node:child_process'
import { scanDiff } from './cli-engine'
import type { ScanResult } from './cli-engine'

const PASS_THRESHOLD = 70

// ─── Threshold: env var > --flag > default 70 ─────────────────
function resolveThreshold(args: string[]): number {
  const idx = args.indexOf('--threshold')
  if (idx !== -1 && idx + 1 < args.length) {
    const val = parseInt(args[idx + 1], 10)
    if (!isNaN(val) && val >= 0 && val <= 100) return val
    console.warn(`\x1b[33m⚠️  Invalid --threshold "${args[idx + 1]}", using 70\x1b[0m`)
  }
  const env = process.env.MANTIZ_THRESHOLD
  if (env !== undefined && env !== '') {
    const val = parseInt(env, 10)
    if (!isNaN(val) && val >= 0 && val <= 100) return val
    console.warn(`\x1b[33m⚠️  Invalid MANTIZ_THRESHOLD "${env}", using 70\x1b[0m`)
  }
  return 70
}

function getGitDiff(): string {
  try {
    const diff = execSync('git diff', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    if (diff.trim()) return diff
    const staged = execSync('git diff --staged', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    if (staged.trim()) return staged
    const head = execSync('git diff HEAD~1', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
    return head
  } catch {
    return ''
  }
}

function printResults(result: ScanResult, threshold: number): void {
  const scoreColor = result.trustScore >= 80 ? '\x1b[32m' : result.trustScore >= 50 ? '\x1b[33m' : '\x1b[31m'
  const scoreLabel = result.trustScore >= 80 ? 'CLEAN ✅' : result.trustScore >= 50 ? 'SUSPICIOUS 🟡' : 'CHEATING DETECTED 🔴'
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'
  const dim = '\x1b[2m'

  console.log('\n' + '='.repeat(50))
  console.log(`${bold}🔍  MANTIZ SCAN RESULTS${reset}`)
  console.log('='.repeat(50))
  console.log(`\n${bold}Trust Score:${reset} ${scoreColor}${result.trustScore}/100${reset} ${scoreLabel}`)
  console.log(`${dim}Threshold:${reset} ${threshold}${dim} (scores below this will fail)${reset}`)
  console.log(`\n${bold}Summary:${reset}`)
  console.log(`  Findings:  ${result.summary.totalFindings}`)
  console.log(`  Files:     ${result.summary.filesScanned}`)
  console.log(`  Verdict:   ${scoreColor}${scoreLabel}${reset}`)

  if (result.verdict) {
    console.log(`  Confidence: ${result.verdict.confidence}`)
  }

  if (result.findings.length > 0) {
    console.log(`\n${bold}Findings:${reset}`)
    for (const f of result.findings) {
      const confColor = f.confidence === 'high' ? '\x1b[31m' : f.confidence === 'medium' ? '\x1b[33m' : '\x1b[90m'
      console.log(`  ${confColor}${f.confidence.toUpperCase()}${reset}  ${f.filePath}:${f.lineStart}`)
      console.log(`       ${dim}${f.explanation}${reset}`)
    }
  } else {
    console.log(`\n  ${bold}No cheating detected.${reset} ${dim}Code looks honest.${reset}`)
  }

  if (result.findings.length > 0) {
    console.log(`\n${bold}Detector Breakdown:${reset}`)
    const byType = new Map<string, number>()
    for (const f of result.findings) {
      byType.set(f.patternType, (byType.get(f.patternType) || 0) + 1)
    }
    for (const [type, count] of byType) {
      console.log(`  ${type}: ${count}`)
    }
  }

  if (result.fixInstructions.length > 0) {
    console.log(`\n${bold}Fix Instructions:${reset}`)
    for (const fi of result.fixInstructions) {
      console.log(`  [${fi.patternType}] ${fi.instruction}`)
    }
  }

  console.log(`\n${dim}${'='.repeat(50)}${reset}\n`)
}

function printHelp(): void {
  console.log(`
Mantiz CLI — AI Lie Detector for Coding Agents

USAGE
  mantiz-scan                  Scan current git diff
  mantiz-scan --diff <text>    Scan provided diff text
  mantiz-scan --threshold <0-100>  Custom pass threshold (env: MANTIZ_THRESHOLD)
  mantiz-scan --json              Output results as JSON
  mantiz-scan --help              Show this help

EXIT CODES
  0  — All clean (Trust Score >= threshold)
  1  — Cheating detected (Trust Score < threshold)

FEATURES
  • 6 Static Detectors (D1-D6) — no API key or server needed
  • 0 external dependencies — 100% local
  • Pre-computed precision/recall from 135 labeled PRs
  • Powered by the Mantiz detector engine

EXAMPLES
  mantiz-scan
  mantiz-scan --threshold 50
  mantiz-scan --threshold 80 --json
  cat my-diff.txt | mantiz-scan --diff -
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  const jsonOutput = args.includes('--json')
  const diffIndex = args.indexOf('--diff')
  const diffArg = diffIndex !== -1 ? args[diffIndex + 1] : undefined

  let diffText: string
  if (diffArg !== undefined) {
    diffText = diffArg === '-' ? execSync('cat', { encoding: 'utf-8' }) : diffArg
  } else {
    diffText = getGitDiff()
  }

  if (!diffText || !diffText.trim()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No git diff found', trustScore: 0 }))
    } else {
      console.log('\x1b[33m⚠️  No git diff found. Run `git add` first or make some changes.\x1b[0m')
    }
    process.exit(1)
  }

  const result = scanDiff(diffText)

  // Resolve threshold after parsing args
  const threshold = resolveThreshold(args)

  if (jsonOutput) {
    console.log(JSON.stringify({
      trustScore: result.trustScore,
      verdict: result.verdict,
      summary: result.summary,
      findings: result.findings.map(f => ({
        patternType: f.patternType,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        confidence: f.confidence,
        explanation: f.explanation,
      })),
      fixInstructions: result.fixInstructions,
      threshold,
      passed: result.trustScore >= threshold,
    }, null, 2))
  } else {
    printResults(result, threshold)
  }

  process.exit(result.trustScore < threshold ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
