/**
 * Mantiz Public API — /api/scan
 *
 * Uses TanStack Start createServerFn pattern.
 * Accepts POST with diff + optional token. Returns Trust Score + findings.
 *
 * Features:
 * - useAi: boolean — enable AI-assisted detection
 * - Threshold from user settings
 * - Webhook delivery on completion
 * - Rate limited + body size check + CORS
 */

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { scanDiff, scanDiffAsync } from '../../detectors/engine'
import { verifyToken, saveAPIScan } from '../../server/tokens'
import { checkRateLimit } from '../../server/rate-limiter'
import { loadUserSettings } from '../../server/settings'
import { deliverWebhook } from '../../server/webhook'

export const Route = createFileRoute('/api/scan')({
  component: () => null,
})

const MAX_DIFF_SIZE = 500_000

/**
 * Server-side scan handler. Invoked via POST.
 * Returns plain JSON data or throws for errors.
 */
export const handleScan = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const v = input as { diff?: string; token?: string; useAi?: boolean }
    if (!v.diff || typeof v.diff !== 'string') {
      throw new Error('Missing required field: diff')
    }
    if (v.diff.trim().length === 0) {
      throw new Error('Diff cannot be empty')
    }
    if (v.diff.length > MAX_DIFF_SIZE) {
      throw new Error(`Diff exceeds maximum size of ${MAX_DIFF_SIZE / 1000}KB`)
    }
    return { diff: v.diff, token: v.token, useAi: !!v.useAi }
  })
  .handler(async ({ data }) => {
    const { diff, token, useAi } = data

    // CORS — restrict to known origins
    setResponseHeader('Access-Control-Allow-Origin', 'https://mantiz-wine.vercel.app')
    setResponseHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    setResponseHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    setResponseHeader('Access-Control-Max-Age', '86400')

    // Rate limiting — use IP from request context
    const rateResult = checkRateLimit(
      token ? 'token' : 'anonymous',
      token ? `api_token:${token}` : `anonymous:api`,
    )
    if (!rateResult.allowed) {
      throw new Error(
        token
          ? 'Rate limit exceeded. Try again later.'
          : 'Rate limit exceeded. Use an API token for higher limits.',
      )
    }

    // Token verification
    let userId: string | undefined
    let userLogin = 'anonymous'

    if (token) {
      const user = await verifyToken(token)
      if (user) {
        userId = user.userId
        userLogin = user.login
      } else {
        throw new Error('Invalid or revoked API token')
      }
    }

    // Load user settings
    const settings = userId ? await loadUserSettings(userId) : null
    const threshold = settings?.threshold ?? 70

    // Run scan
    const useAiDetection = useAi || settings?.aiEnabled || false
    const result = useAiDetection ? await scanDiffAsync(diff) : scanDiff(diff)

    // Save to DB + webhook (fire-and-forget)
    if (userId) {
      const scanId = await saveAPIScan({
        userId,
        rawDiff: diff,
        trustScore: result.trustScore,
        findings: result.findings.map((f) => ({
          patternType: f.patternType,
          filePath: f.filePath,
          lineStart: f.lineStart,
          lineEnd: f.lineEnd,
          confidence: f.confidence,
          explanation: f.explanation,
          evidenceExcerpt: f.evidenceExcerpt,
        })),
      }).catch(() => null)

      if (scanId && settings?.webhookEnabled && settings?.webhookUrl) {
        const passed = result.trustScore >= threshold
        deliverWebhook({
          userId,
          webhookUrl: settings.webhookUrl,
          scanId,
          event: passed ? 'scan.completed' : 'scan.failed',
          payload: {
            scanId,
            trustScore: result.trustScore,
            totalFindings: result.summary.totalFindings,
            highCount: result.summary.highCount,
            mediumCount: result.summary.mediumCount,
            lowCount: result.summary.lowCount,
            filesScanned: result.summary.filesScanned,
            passed,
            threshold,
            findings: result.findings.map((f) => ({
              patternType: f.patternType,
              filePath: f.filePath,
              lineStart: f.lineStart,
              lineEnd: f.lineEnd,
              confidence: f.confidence,
              explanation: f.explanation,
            })),
          },
        }).catch(() => {})
      }
    }

    // Return plain data — framework handles HTTP framing
    return {
      trustScore: result.trustScore,
      totalFindings: result.summary.totalFindings,
      highCount: result.summary.highCount,
      mediumCount: result.summary.mediumCount,
      lowCount: result.summary.lowCount,
      filesScanned: result.summary.filesScanned,
      findings: result.findings.slice(0, 50),
      fixInstructions: result.fixInstructions,
      passed: result.trustScore >= threshold,
      threshold,
      scannedBy: userLogin,
      aiDetected: useAiDetection,
    }
  })
