/**
 * Mantiz Webhook System v2
 *
 * Features:
 * - Retry: 3 attempts with exponential backoff (1s → 4s → 15s)
 * - HMAC-SHA256 signing for payload verification
 * - Multiple event types (scan.completed, scan.failed)
 * - Delivery history tracking
 * - Webhook test with ping
 */

import crypto from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { db } from '../lib/db'
import { webhookEvents } from '../schemas/index'
import { desc, eq } from 'drizzle-orm'

export type WebhookEvent = 'scan.completed' | 'scan.failed' | 'ping'

interface BasePayload {
  event: WebhookEvent
  timestamp: string
  scanId: string
  trustScore: number
  totalFindings: number
  highCount: number
  mediumCount: number
  lowCount: number
  filesScanned: number
  passed: boolean
  threshold: number
  findings: Array<{
    patternType: string
    filePath: string
    lineStart: number
    lineEnd: number
    confidence: string
    explanation: string
  }>
}

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.SESSION_SECRET || 'mantiz-webhook-default'
const MAX_RETRIES = 3
const RETRY_DELAYS = [1_000, 4_000, 15_000] // 1s, 4s, 15s

/**
 * Sign payload with HMAC-SHA256 for receiver verification.
 */
function signPayload(body: string): string {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
  hmac.update(body)
  return 'sha256=' + hmac.digest('hex')
}

/**
 * Deliver scan result to a webhook URL with retry + signing.
 */
export async function deliverWebhook(params: {
  userId: string
  webhookUrl: string
  scanId: string
  payload: Omit<BasePayload, 'event' | 'timestamp'>
  event?: WebhookEvent
}): Promise<void> {
  const { userId, webhookUrl, scanId, payload, event = 'scan.completed' } = params

  const body: BasePayload = {
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }

  const bodyStr = JSON.stringify(body)
  const signature = signPayload(bodyStr)

  let lastError: string | null = null
  let lastStatus: number | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
      await new Promise(r => setTimeout(r, delay))
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mantiz-Webhook/2.0',
          'X-Mantiz-Signature': signature,
          'X-Mantiz-Attempt': String(attempt + 1),
          'X-Mantiz-Event': event,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) {
        await db.insert(webhookEvents).values({
          userId,
          scanId,
          webhookUrl,
          status: 'delivered',
          responseCode: response.status,
          responseBody: null,
          deliveredAt: new Date(),
        })
        return
      }

      lastStatus = response.status
      lastError = `HTTP ${response.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error'
      lastStatus = null
    }

    // If this was the last attempt, save failure
    if (attempt === MAX_RETRIES - 1) {
      await db.insert(webhookEvents).values({
        userId,
        scanId,
        webhookUrl,
        status: 'failed',
        responseCode: lastStatus,
        responseBody: (lastError || '').slice(0, 1000),
      })
    }
  }
}

/**
 * Test a webhook URL by sending a ping event.
 */
export const testWebhook = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const v = input as { url: string }
    if (!v.url || typeof v.url !== 'string') {
      throw new Error('Webhook URL is required')
    }
    try {
      new URL(v.url)
    } catch {
      throw new Error('Invalid webhook URL')
    }
    return { url: v.url }
  })
  .handler(async ({ data }) => {
    const payload = JSON.stringify({
      event: 'ping',
      timestamp: new Date().toISOString(),
      message: 'Mantiz webhook test — your configuration is working.',
    })

    try {
      const response = await fetch(data.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mantiz-Webhook-Test/2.0',
          'X-Mantiz-Signature': signPayload(payload),
          'X-Mantiz-Event': 'ping',
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      })

      return { ok: response.ok, status: response.status, error: null }
    } catch (err) {
      return {
        ok: false,
        status: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  })

/**
 * Get webhook delivery history for the current user.
 */
export const getWebhookEvents = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const v = input as { limit?: number }
    return { limit: Math.min(v.limit ?? 10, 50) }
  })
  .handler(async ({ data }) => {
    // Import requireAuth inside to avoid client-side issues
    const { requireAuth } = await import('./auth-utils.server')
    const session = requireAuth()

    const events = await db.select({
      id: webhookEvents.id,
      scanId: webhookEvents.scanId,
      webhookUrl: webhookEvents.webhookUrl,
      status: webhookEvents.status,
      responseCode: webhookEvents.responseCode,
      createdAt: webhookEvents.createdAt,
      deliveredAt: webhookEvents.deliveredAt,
    })
      .from(webhookEvents)
      .where(eq(webhookEvents.userId, session.dbUserId))
      .orderBy(desc(webhookEvents.createdAt))
      .limit(data.limit)

    return events
  })
