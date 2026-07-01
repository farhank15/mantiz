/**
 * Mantiz Public API — /api/scan
 *
 * Accepts POST requests with a diff and optional API token.
 * Returns Trust Score + findings as JSON.
 *
 * Security:
 * - Rate limited: 10 req/min anonymous, 60 req/min with token
 * - Body size limit: 500KB
 * - Input validation + sanitization
 * - CORS hardening (specific origins only)
 */

import { createFileRoute } from '@tanstack/react-router'
import { scanDiff } from '../../detectors/engine'
import { verifyToken, saveAPIScan } from '../../server/tokens'
import { checkRateLimit, rateLimitHeaders } from '../../server/rate-limiter'
import {
  validateDiff,
  errorResponse,
  successResponse,
  getCorsHeaders,
} from '../../server/middleware'

export const Route = createFileRoute('/api/scan')({
  component: () => null,
})

interface ScanBody {
  diff?: string
  token?: string
}

export async function POST({ request }: { request: Request }) {
  const corsHeaders = getCorsHeaders(request)
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  try {
    // ─── 2. Body Size Check ─────────────────────────────────────
    const contentLength = request.headers.get('content-length')
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > 500_000) {
        return errorResponse(
          `Payload exceeds maximum size of 500KB`,
          413,
          corsHeaders,
        )
      }
    }

    // ─── 3. Parse Body ──────────────────────────────────────────
    let body: ScanBody
    try {
      body = (await request.json()) as ScanBody
    } catch {
      return errorResponse('Invalid JSON body', 400, corsHeaders)
    }

    const { diff, token } = body

    // ─── 4. Rate Limiting ───────────────────────────────────────
    if (token && typeof token === 'string') {
      // Authenticated — higher limit (60/min)
      const rateResult = checkRateLimit('token', `api_token:${token}`)
      if (!rateResult.allowed) {
        return errorResponse(
          'Rate limit exceeded. Try again later.',
          429,
          { ...corsHeaders, ...rateLimitHeaders(rateResult) },
        )
      }
    } else {
      // Anonymous — strict limit (10/min per IP)
      const rateResult = checkRateLimit('anonymous', `ip:${clientIp}`)
      if (!rateResult.allowed) {
        return errorResponse(
          'Rate limit exceeded. Sign in with an API token for higher limits.',
          429,
          { ...corsHeaders, ...rateLimitHeaders(rateResult) },
        )
      }
    }

    // ─── 5. Input Validation ────────────────────────────────────
    const diffValidation = validateDiff(diff)
    if (!diffValidation.valid) {
      return errorResponse(
        diffValidation.error!,
        diffValidation.status || 400,
        corsHeaders,
      )
    }

    // ─── 6. Token Verification ──────────────────────────────────
    let userId: string | undefined
    let userLogin = 'anonymous'

    if (token && typeof token === 'string') {
      const user = await verifyToken(token)
      if (user) {
        userId = user.userId
        userLogin = user.login
      } else {
        return errorResponse('Invalid or revoked API token', 401, corsHeaders)
      }
    }

    // ─── 7. Run Scan ────────────────────────────────────────────
    const result = scanDiff(diff!)

    // ─── 8. Save to DB (fire-and-forget) ────────────────────────
    if (userId) {
      saveAPIScan({
        userId,
        rawDiff: diff!,
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
      }).catch((err: unknown) =>
        console.error('Failed to save API scan:', err),
      )
    }

    // ─── 9. Response ────────────────────────────────────────────
    const response = {
      trustScore: result.trustScore,
      totalFindings: result.summary.totalFindings,
      highCount: result.summary.highCount,
      mediumCount: result.summary.mediumCount,
      lowCount: result.summary.lowCount,
      filesScanned: result.summary.filesScanned,
      findings: result.findings.slice(0, 50),
      fixInstructions: result.fixInstructions,
      passed: result.trustScore >= 70,
      scannedBy: userLogin,
    }

    return successResponse(response, corsHeaders)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Internal server error'
    return errorResponse(message, 500, corsHeaders)
  }
}
