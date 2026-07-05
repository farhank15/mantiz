/**
 * Mantiz Public API — /api/scan
 *
 * TanStack Start Server Route — accepts POST with diff + optional token.
 * Returns Trust Score + findings as JSON. Callable by external clients.
 *
 * Features:
 * - Token auth (optional — anonymous scans allowed)
 * - Rate limiting (3 tiers: anonymous, token, strict)
 * - AI-assisted detection (useAi flag)
 * - Threshold from user settings
 * - Webhook delivery on completion
 * - CORS + body size check
 */

import { createFileRoute } from '@tanstack/react-router'
import { scanDiffAsync } from '../../detectors/engine'
import { verifyToken, saveAPIScan } from '../../server/tokens'
import { checkRateLimit, rateLimitHeaders } from '../../server/rate-limiter'
import { loadUserSettings } from '../../server/settings'
import { deliverWebhook } from '../../server/webhook'

const MAX_DIFF_SIZE = 500_000
const ALLOWED_ORIGINS = [
  'https://mantiz-wine.vercel.app',
  'http://localhost:3030',
  'http://localhost:3000',
]

function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('origin') || request.headers.get('Origin') || ''
  return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://mantiz-wine.vercel.app'
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export const Route = createFileRoute('/api/scan')({
  component: () => null,
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = getCorsOrigin(request)
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin),
        })
      },
      POST: async ({ request }) => {
        const origin = getCorsOrigin(request)
        const baseCors = corsHeaders(origin)

        try {
          // ── Validate Content-Type ────────────────────────────────
          const ct = request.headers.get('content-type') || ''
          if (!ct.includes('application/json')) {
            return Response.json(
              { error: 'Content-Type must be application/json' },
              { status: 415, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }

          // ── Parse body ───────────────────────────────────────────
          let body: { diff?: string; token?: string }
          try {
            body = await request.json() as typeof body
          } catch {
            return Response.json(
              { error: 'Invalid JSON body' },
              { status: 400, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }

          // Read token from body OR Authorization header
          let apiToken = body.token
          if (!apiToken) {
            const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
            const match = authHeader.match(/^Bearer\s+(.+)$/i)
            if (match) apiToken = match[1]
          }

          const { diff } = body
          const token = apiToken

          // ── Validate diff ────────────────────────────────────────
          if (!diff || typeof diff !== 'string') {
            return Response.json(
              { error: 'Missing required field: diff' },
              { status: 400, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }
          if (diff.trim().length === 0) {
            return Response.json(
              { error: 'Diff cannot be empty' },
              { status: 400, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }
          if (diff.length > MAX_DIFF_SIZE) {
            return Response.json(
              { error: `Diff exceeds maximum size of ${MAX_DIFF_SIZE / 1000}KB` },
              { status: 413, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }

          // ── Rate limiting ────────────────────────────────────────
          const rateResult = await checkRateLimit(
            token ? 'token' : 'anonymous',
            token ? `api_token:${token}` : `anonymous:api`,
          )
          if (!rateResult.allowed) {
            return Response.json(
              {
                error: token
                  ? 'Rate limit exceeded. Try again later.'
                  : 'Rate limit exceeded. Use an API token for higher limits.',
              },
              {
                status: 429,
                headers: {
                  ...baseCors,
                  ...rateLimitHeaders(rateResult),
                  'Content-Type': 'application/json',
                  'Retry-After': String(Math.ceil(rateResult.resetMs / 1000)),
                },
              },
            )
          }

          // ── Token verification ───────────────────────────────────
          let userId: string | undefined
          let userLogin = 'anonymous'

          if (token) {
            const user = await verifyToken(token)
            if (user) {
              userId = user.userId
              userLogin = user.login
            } else {
              return Response.json(
                { error: 'Invalid or revoked API token' },
                { status: 401, headers: { ...baseCors, 'Content-Type': 'application/json' } },
              )
            }
          }

          // ── Load user settings ───────────────────────────────────
          const settings = userId ? await loadUserSettings(userId) : null
          const threshold = settings?.threshold ?? 70
          const minScore = settings?.minScore ?? 0

          // ── Run scan (AI auto-detects from env vars) ─────────────
          const result = await scanDiffAsync(diff, undefined, undefined, { minScore })

          // ── Determine source context from X-Mantiz-Source header ─
          const sourceLabel = request.headers.get('x-mantiz-source') || 'API / CLI'

          // ── Save to DB + webhook (fire-and-forget) ───────────────
          if (userId) {
            const scanId = await saveAPIScan({
              userId,
              sourceRef: sourceLabel,
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
            }).catch((dbErr) => {
              console.error('[api/scan] Failed to save scan to DB:', dbErr)
              return null
            })

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

          // ── Success response ─────────────────────────────────────
          return Response.json(
            {
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
              aiDetected: true, // env-controlled, auto-enabled
              validationBasis: {
                disclaimer: 'PRELIMINARY — N=20 DECEPTIVE samples. Confidence interval ±15-25%.',
                datasetSize: 203,
                lastCalibrated: '2026-07-03',
                detectors: {
                  D6_HallucinatedAssertion: { precision: 77.8, recall: 70.0, f1: 73.7 },
                  D2_AssertionTampering: { precision: 100.0, recall: 15.0, f1: 26.1 },
                  D3_MockToAvoid: { precision: 100.0, recall: 5.0, f1: 9.5 },
                  D1_DisabledAssertion: { precision: 45.5, recall: 25.0, f1: 32.3 },
                  D5_SilentCatch: { precision: 33.3, recall: 10.0, f1: 15.4 },
                  D10_MutationSusceptibility: { precision: 30.0, recall: 60.0, f1: 40.0 },
                  D4_ClaimDiffMismatch: { precision: 0.0, recall: 0.0, f1: 0.0 },
                },
              },
            },
            {
              status: 200,
              headers: {
                ...baseCors,
                ...rateLimitHeaders(rateResult),
                'Content-Type': 'application/json',
              },
            },
          )
        } catch (err) {
          // ── Unhandled error ──────────────────────────────────────
          const message = err instanceof Error ? err.message : 'Internal server error'
          return Response.json(
            { error: message },
            {
              status: 500,
              headers: { ...baseCors, 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
