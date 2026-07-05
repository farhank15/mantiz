/**
 * Mantiz GitHub App — PR Review Comments & Check Runs
 *
 * Posts scan findings as inline PR review comments and updates check runs.
 * Supports:
 * - Inline PR comments with per-file, per-line findings
 * - Suggested changes (code fix suggestions)
 * - Check Run status (pending → completed with annotations)
 *
 * Based on official docs:
 *   https://docs.github.com/en/rest/pulls/reviews
 *   https://docs.github.com/en/rest/checks/runs
 */

import type { Finding } from '../detectors/types'
import { generatePatches, type CodePatch } from '../detectors/heal-engine'

// ─── Default threshold from env var ─────────────────────────────

const DEFAULT_THRESHOLD = (() => {
  const env = process.env.GITHUB_APP_THRESHOLD
  if (env === undefined || env === '') return 70
  const parsed = parseInt(env, 10)
  if (isNaN(parsed) || parsed < 0 || parsed > 100) {
    console.warn(`[github-pr-comment] Invalid GITHUB_APP_THRESHOLD "${env}", using 70`)
    return 70
  }
  return parsed
})()

// ─── Types ──────────────────────────────────────────────────────

export type CheckConclusion = 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required'

export interface CommentInput {
  path: string
  line: number
  body: string
}

// ─── PR Review Comments ─────────────────────────────────────────

/**
 * Format a single finding as a GitHub Markdown comment.
 * Includes confidence badge, explanation, and evidence excerpt.
 */
function formatFindingComment(finding: Finding, patch?: CodePatch): string {
  const confidenceEmoji =
    finding.confidence === 'high' ? '🔴' :
    finding.confidence === 'medium' ? '🟡' : '🟢'

  let body = `**${confidenceEmoji} ${finding.patternType.replace(/_/g, ' ')}**\n\n`
  body += `${finding.explanation}\n`

  if (finding.evidenceExcerpt) {
    body += `\n<details><summary>Evidence</summary>\n\n\`\`\`\n${finding.evidenceExcerpt.slice(0, 500)}\n\`\`\`\n</details>\n`
  }

  // Add suggested change if a patch is available
  if (patch && patch.riskLevel !== 'risky') {
    body += `\n\`\`\`suggestion\n${patch.fixedCode}\n\`\`\`\n`
  }

  return body
}

/**
 * Format severity badge for a finding.
 */
function severityBadge(confidence: string): string {
  switch (confidence) {
    case 'high': return '🔴 High'
    case 'medium': return '🟡 Medium'
    case 'low': return '🟢 Low'
    default: return '⚪ Unknown'
  }
}

/**
 * Post inline PR review comments for scan findings.
 * Uses the modern API with `line` + `side` instead of deprecated `position`.
 *
 * @param octokit — Authenticated Octokit instance (installation token)
 * @param params — PR identifiers + scan results
 */
export async function postPRReviewComments(
  octokit: any,
  params: {
    owner: string
    repo: string
    pullNumber: number
    findings: Finding[]
    trustScore: number
    totalFindings: number
    threshold?: number
  },
): Promise<{ reviewId: number | null; commentsPosted: number }> {
  const { owner, repo, pullNumber, findings, trustScore, totalFindings, threshold = DEFAULT_THRESHOLD } = params

  if (findings.length === 0) return { reviewId: null, commentsPosted: 0 }

  // Generate patches for auto-fix suggestions
  const patches = generatePatches(findings)
  const patchMap = new Map<string, CodePatch>()
  for (const p of patches) {
    patchMap.set(`${p.filePath}:${p.lineStart}:${p.patternType}`, p)
  }

  // Build inline comments for each finding
  const comments: CommentInput[] = findings.map((f) => {
    const patch = patchMap.get(`${f.filePath}:${f.lineStart}:${f.patternType}`)
    return {
      path: f.filePath,
      line: f.lineStart,
      body: formatFindingComment(f, patch),
    }
  })

  // Summary body for the review
  const passed = trustScore >= threshold
  const summaryBody = [
    `## Mantiz Scan 🔍`,
    ``,
    `**Trust Score:** **${trustScore}** / 100 ${passed ? '✅' : '❌'}`,
    `**Threshold:** ${threshold}`,
    `**Findings:** ${totalFindings}`,
    ``,
    passed
      ? `No issues detected above threshold.`
      : `⚠️ ${totalFindings} potential issue${totalFindings !== 1 ? 's' : ''} found. Review inline comments below.`,
    ``,
    `[View full report](https://mantiz-wine.vercel.app)`,
  ].join('\n')

  try {
    const review = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: passed ? 'APPROVE' : 'REQUEST_CHANGES',
      body: summaryBody,
      comments,
    })

    return {
      reviewId: review.data.id,
      commentsPosted: comments.length,
    }
  } catch (err: any) {
    console.error('[github-pr-comment] Failed to post PR review:', err.message)

    // Fallback: post a single summary comment if inline comments fail
    // (happens when line numbers don't match the diff exactly)
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: summaryBody + '\n\n---\n\n_' + findings.map(f =>
          `**${severityBadge(f.confidence)}** \`${f.filePath}:${f.lineStart}\` — ${f.explanation.slice(0, 200)}`
        ).join('\n\n') + '_',
      })
      return { reviewId: null, commentsPosted: 0 }
    } catch {
      return { reviewId: null, commentsPosted: 0 }
    }
  }
}

// ─── Check Runs ─────────────────────────────────────────────────

/**
 * Create a check run for a PR scan (status: in_progress).
 */
export async function createCheckRun(
  octokit: any,
  params: {
    owner: string
    repo: string
    headSha: string
    installationId: number
  },
): Promise<number> {
  const { owner, repo, headSha } = params

  const { data: checkRun } = await octokit.rest.checks.create({
    owner,
    repo,
    name: 'Mantiz AI Lie Detector',
    head_sha: headSha,
    status: 'in_progress',
    output: {
      title: 'Mantiz AI Lie Detector',
      summary: 'Scanning diff for AI agent cheating patterns...',
    },
  })

  return checkRun.id
}

/**
 * Update a check run with scan results (status: completed).
 * Includes annotations for individual findings (max 50 per request).
 */
export async function completeCheckRun(
  octokit: any,
  params: {
    owner: string
    repo: string
    checkRunId: number
    findings: Finding[]
    trustScore: number
    totalFindings: number
    threshold?: number
  },
): Promise<void> {
  const { owner, repo, checkRunId, findings, trustScore, totalFindings, threshold = DEFAULT_THRESHOLD } = params

  const passed = trustScore >= threshold
  const conclusion: CheckConclusion = passed ? 'success' : 'action_required'

  // Build annotations from findings (max 50 per request)
  const annotations = findings.slice(0, 50).map((f) => ({
    path: f.filePath,
    start_line: f.lineStart,
    end_line: f.lineEnd || f.lineStart,
    annotation_level: f.confidence === 'high' ? 'failure' as const : f.confidence === 'medium' ? 'warning' as const : 'notice' as const,
    message: f.explanation.slice(0, 255),
    title: f.patternType.replace(/_/g, ' ').slice(0, 255),
  }))

  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: checkRunId,
    status: 'completed',
    conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: 'Mantiz AI Lie Detector',
      summary: passed
        ? `✅ Clean — Trust Score: ${trustScore}/${threshold}`
        : `❌ ${totalFindings} finding${totalFindings !== 1 ? 's' : ''} detected — Trust Score: ${trustScore}/${threshold}`,
      text: [
        `Trust Score: ${trustScore}/100`,
        `Threshold: ${threshold}`,
        `Total Findings: ${totalFindings}`,
        `High: ${findings.filter(f => f.confidence === 'high').length}`,
        `Medium: ${findings.filter(f => f.confidence === 'medium').length}`,
        `Low: ${findings.filter(f => f.confidence === 'low').length}`,
        passed ? '✅ Passed' : '❌ Failed — review inline comments for details',
        '',
        '---',
        '',
        'View full report: https://mantiz-wine.vercel.app',
      ].join('\n'),
      annotations,
    },
  })

  // If more than 50 findings, append remaining annotations in batches
  if (findings.length > 50) {
    for (let i = 50; i < findings.length; i += 50) {
      const batch = findings.slice(i, i + 50).map((f) => ({
        path: f.filePath,
        start_line: f.lineStart,
        end_line: f.lineEnd || f.lineStart,
        annotation_level: f.confidence === 'high' ? 'failure' as const : f.confidence === 'medium' ? 'warning' as const : 'notice' as const,
        message: f.explanation.slice(0, 255),
        title: f.patternType.replace(/_/g, ' ').slice(0, 255),
      }))

      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        output: {
          title: 'Mantiz AI Lie Detector',
          summary: `Scan completed — ${totalFindings} total findings`,
          annotations: batch,
        },
      })
    }
  }
}
