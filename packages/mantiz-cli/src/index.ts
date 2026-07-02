#!/usr/bin/env tsx
/**
 * Mantiz CLI — AI Lie Detector for Coding Agents
 *
 * Usage:
 *   mantiz-scan              # Scan local git diff
 *   mantiz-scan --diff <str> # Scan provided diff text
 *   mantiz-scan --token x    # Send to Mantiz API for cloud scan
  mantiz-scan --token x --save  # Save results to cloud history
 *   mantiz-scan --help       # Show help
 *
 * Install:
 *   npm install -g @mantiz/cli
 */

import { execSync } from 'node:child_process'
import { scanDiff, type ScanResult } from '@farhank15/mantiz-core'

const PASS_THRESHOLD = 70

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

function printResults(result: ScanResult): void {
  const scoreColor = result.trustScore >= 80 ? '\x1b[32m' : result.trustScore >= 50 ? '\x1b[33m' : '\x1b[31m'
  const scoreLabel = result.trustScore >= 80 ? 'CLEAN ✅' : result.trustScore >= 50 ? 'SUSPICIOUS 🟡' : 'CHEATING DETECTED 🔴'
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'
  const dim = '\x1b[2m'

  console.log('\n' + '='.repeat(50))
  console.log(`${bold}🔍  MANTIZ SCAN RESULTS${reset}`)
  console.log('='.repeat(50))
  console.log(`\n${bold}Trust Score:${reset} ${scoreColor}${result.trustScore}/100${reset} ${scoreLabel}`)
  console.log(`${dim}Threshold:${reset} ${PASS_THRESHOLD}${dim} (scores below this will fail)${reset}`)
  console.log(`\n${bold}Summary:${reset}`)
  console.log(`  Findings:  ${result.summary.totalFindings}`)
  console.log(`  Files:     ${result.summary.filesScanned}`)
  console.log(`  Verdict:   ${scoreColor}${scoreLabel}${reset}`)

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
  mantiz-scan --token <key>    Send to Mantiz cloud API
  mantiz-scan --json           Output results as JSON
  mantiz-scan --help           Show this help

EXIT CODES
  0  — All clean (Trust Score >= ${PASS_THRESHOLD})
  1  — Cheating detected (Trust Score < ${PASS_THRESHOLD})

ENVIRONMENT VARIABLES
  MANTIZ_API_TOKEN   API token for cloud scanning
  MANTIZ_API_URL     API URL (default: https://mantiz-wine.vercel.app)

EXAMPLES
  mantiz-scan
  cat my-diff.txt | mantiz-scan --diff -
  mantiz-scan --json | jq '.trustScore'
  mantiz-scan --token mtz_abc123
  mantiz-scan --token mtz_abc123 --save   # Save to cloud
  mantiz-scan --token mtz_abc123 --ai      # Enable AI detection
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  const jsonOutput = args.includes('--json')
  const saveToCloud = args.includes('--save')
  const tokenIndex = args.indexOf('--token')
  const token = tokenIndex !== -1 ? args[tokenIndex + 1] : process.env.MANTIZ_API_TOKEN
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

  if (token || saveToCloud) {
    const apiToken = token || process.env.MANTIZ_API_TOKEN

    if (!apiToken) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: 'No API token found. Use --token or set MANTIZ_API_TOKEN', trustScore: 0 }))
      } else {
        console.log('\x1b[33m⚠️  --save requires an API token. Use --token <key> or set MANTIZ_API_TOKEN env var.\x1b[0m')
        console.log('\x1b[33m   Falling back to local scan (results not saved to cloud).\x1b[0m')
      }
      // Fall back to local scan
      const result = scanDiff(diffText)
      if (jsonOutput) {
        console.log(JSON.stringify({ ...result, passed: result.trustScore >= PASS_THRESHOLD }, null, 2))
      } else {
        printResults(result)
      }
      process.exit(result.trustScore < PASS_THRESHOLD ? 1 : 0)
      return
    }

    const apiUrl = process.env.MANTIZ_API_URL || 'https://mantiz-wine.vercel.app'
    try {
      const res = await fetch(`${apiUrl}/api/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ diff: diffText, useAi: args.includes('--ai') }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        if (jsonOutput) {
          console.log(JSON.stringify({ error: `API error: ${res.status}`, trustScore: 0 }))
        } else {
          console.log(`\x1b[31mAPI error: ${res.status} — ${errBody}\x1b[0m`)
        }
        process.exit(1)
      }

      const result = await res.json() as { trustScore: number; findings: any[]; summary: any }

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        const scoreColor = result.trustScore >= 80 ? '\x1b[32m' : '\x1b[33m'
        console.log(`\n${scoreColor}Trust Score: ${result.trustScore}/100\x1b[0m`)
        console.log(`Findings: ${result.findings.length}`)
        result.findings.slice(0, 5).forEach((f: any) => {
          console.log(`  [${f.confidence}] ${f.filePath}:${f.lineStart} — ${f.explanation}`)
        })
      }

      process.exit(result.trustScore < PASS_THRESHOLD ? 1 : 0)
    } catch (err) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: `Failed to reach Mantiz API: ${err}`, trustScore: 0 }))
      } else {
        console.log(`\x1b[31mFailed to reach Mantiz API: ${err}\x1b[0m`)
      }
      process.exit(1)
    }
  }

  const result = scanDiff(diffText)

  if (jsonOutput) {
    console.log(JSON.stringify({
      trustScore: result.trustScore,
      summary: result.summary,
      findings: result.findings,
      fixInstructions: result.fixInstructions,
      passed: result.trustScore >= PASS_THRESHOLD,
    }, null, 2))
  } else {
    printResults(result)
  }

  process.exit(result.trustScore < PASS_THRESHOLD ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
