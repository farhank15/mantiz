#!/usr/bin/env tsx
/**
 * Mantiz Ground Truth — GitHub PR Scraper
 *
 * Scrapes PRs + diffs from GitHub using @octokit/rest based on query patterns
 * from VALIDATION-ROADMAP.md Section 4.
 *
 * Output: Appends candidates to eval/ground-truth/raw_candidates.jsonl
 *
 * Usage:
 *   npx tsx scripts/eval/scrape-github.ts                     # interactive — prompts for token
 *   npx tsx scripts/eval/scrape-github.ts --token ghp_xxx     # explicit token
 *   npx tsx scripts/eval/scrape-github.ts --limit 30          # limit per query
 *   npx tsx scripts/eval/scrape-github.ts --dry-run           # preview only, no write
 *
 * Environment Variables:
 *   GITHUB_TOKEN  — GitHub personal access token (optional, higher rate limit)
 *
 * Rate Limits:
 *   Authenticated: 5,000 req/hour
 *   Unauthenticated: 60 req/hour (not recommended)
 */

import { Octokit } from '@octokit/rest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createInterface } from 'node:readline'

// ─── Config ─────────────────────────────────────────────────────────

const EVAL_DIR = path.resolve(import.meta.dirname, '../../eval/ground-truth')
const CANDIDATES_FILE = path.join(EVAL_DIR, 'raw_candidates.jsonl')
const DEFAULT_LIMIT = 20 // PRs per query

// ─── Query Patterns (from VALIDATION-ROADMAP.md Section 4) ───────────

interface SearchQuery {
  label: string
  queries: string[]
  source: string
}

const SEARCH_QUERIES: SearchQuery[] = [
  {
    label: 'reviewer_flagged',
    source: 'github_pr_reviewer_flagged',
    queries: [
      '"this test doesn\'t actually test" in:comments',
      '"test is meaningless" in:comments',
      '"why did you skip this test" in:comments',
      '"this doesn\'t cover the actual" in:comments',
      '"please don\'t disable this test" in:comments',
    ],
  },
  {
    label: 'ai_agent_prs',
    source: 'github_pr_ai_agent',
    queries: [
      'author:app/copilot-swe-agent',
    ],
  },
  {
    label: 'disabled_assertion',
    source: 'github_pr',
    queries: [
      '"skip failing test" in:commit',
      '"disable test temporarily" in:commit',
    ],
  },
]

// ─── CLI Args ────────────────────────────────────────────────────────

function parseArgs(): { token: string | null; limit: number; dryRun: boolean } {
  const args = process.argv.slice(2)
  let token: string | null = null
  let limit = DEFAULT_LIMIT
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && i + 1 < args.length) {
      token = args[++i]
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[++i], 10)
    } else if (args[i] === '--dry-run') {
      dryRun = true
    }
  }

  return { token, limit, dryRun }
}

// ─── Prompt for token ────────────────────────────────────────────────

async function promptToken(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question('🔑 GitHub token (optional — press Enter to skip): ', answer => {
      rl.close()
      resolve(answer.trim() || '')
    })
  })
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  let { token, limit, dryRun } = parseArgs()

  if (!token) {
    token = process.env.GITHUB_TOKEN || ''
    if (!token) {
      token = await promptToken()
    }
  }

  const octokit = token
    ? new Octokit({ auth: token })
    : new Octokit()

  // Verify auth status
  try {
    const { data: { login } } = await octokit.users.getAuthenticated()
    console.log(`✅ Authenticated as ${login}`)
  } catch {
    console.log('⚠️  Running unauthenticated — rate limit: 60 req/hour')
  }

  // Ensure eval dir exists
  if (!fs.existsSync(EVAL_DIR)) {
    fs.mkdirSync(EVAL_DIR, { recursive: true })
  }

  let totalCandidates = 0

  for (const group of SEARCH_QUERIES) {
    console.log(`\n┌─ ${group.label}`)

    for (const query of group.queries) {
      process.stdout.write(`│  🔍 Searching: ${query.slice(0, 60)}...`)

      try {
        const searchResult = await octokit.search.issuesAndPullRequests({
          q: `${query} is:pr is:merged`,
          per_page: Math.min(limit, 100),
          sort: 'updated',
          order: 'desc',
        })

        const prs = searchResult.data.items
        process.stdout.write(` ${prs.length} results\n`)

        for (const pr of prs.slice(0, limit)) {
          // Extract owner/repo from repository_url
          const repoUrl = pr.repository_url
          const repoMatch = repoUrl?.match(/repos\/(.+)$/)
          if (!repoMatch) continue
          const repo = repoMatch[1]

          // Get PR diff
          try {
            const diffResponse = await octokit.pulls.get({
              owner: repo.split('/')[0],
              repo: repo.split('/')[1],
              pull_number: pr.number,
              mediaType: { format: 'diff' },
            })

            const diff = diffResponse.data as unknown as string

            // Skip PRs with no diff or empty diff
            if (!diff || typeof diff !== 'string' || diff.trim().length === 0) {
              continue
            }

            // Truncate at hunk boundary to keep diffs valid for parsePatch
            let diffSnippet: string
            if (diff.length > 50000) {
              // Find the LAST complete hunk header (@@ -x,y +x,y @@) before 50000
              const cutoff = diff.slice(0, 50000)
              const lastHunkMatch = cutoff.match(/(@@ -\d+,\d+ \+\d+,\d+ @@)[^@]*$/)
              if (lastHunkMatch && lastHunkMatch.index !== undefined) {
                // Truncate at the end of the last complete hunk
                diffSnippet = diff.slice(0, lastHunkMatch.index + lastHunkMatch[0].length)
              } else {
                // Fallback: truncate at last newline before 50000
                const lastNewline = cutoff.lastIndexOf('\n')
                diffSnippet = diff.slice(0, lastNewline > 0 ? lastNewline : 50000)
              }
            } else {
              diffSnippet = diff
            }

            const candidate = {
              scraped_at: new Date().toISOString(),
              source: group.source,
              repo,
              pr_url: pr.html_url,
              pr_title: pr.title,
              pr_author: pr.user?.login || 'unknown',
              pr_created_at: pr.created_at,
              pr_updated_at: pr.updated_at,
              labels: (pr.labels || []).map((l: { name?: string }) => l.name || ''),
              diff_length_chars: diff.length,
              diff_snippet: diffSnippet,
            }

            if (!dryRun) {
              fs.appendFileSync(
                CANDIDATES_FILE,
                JSON.stringify(candidate) + '\n',
                'utf-8',
              )
            }

            totalCandidates++
            process.stdout.write(`      📦 ${repo}#${pr.number}: "${(pr.title || '').slice(0, 60)}"\n`)
          } catch (err) {
            const e = err as { status?: number; message?: string }
            if (e.status === 406) {
              // Diff not available for this PR
              continue
            }
            process.stdout.write(`      ⚠️  Error fetching diff: ${e.message?.slice(0, 60) || 'unknown'}\n`)
          }
        }
      } catch (err) {
        const e = err as { status?: number; message?: string }
        process.stdout.write(` ❌ Error: ${e.message?.slice(0, 80) || 'unknown'}\n`)
      }
    }
  }

  if (dryRun) {
    console.log(`\n✅ DRY-RUN complete — would have saved ${totalCandidates} candidates to ${CANDIDATES_FILE}`)
  } else {
    console.log(`\n✅ Saved ${totalCandidates} candidates to ${CANDIDATES_FILE}`)
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
