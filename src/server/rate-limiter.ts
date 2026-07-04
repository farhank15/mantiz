/**
 * Mantiz Database-Backed Rate Limiter
 *
 * Sliding window implementation using Neon Postgres.
 * Shared across all Vercel serverless function instances.
 *
 * Three tiers:
 *   anonymous  — 10 req/min per IP  (POST /api/scan)
 *   token      — 60 req/min per token  (authenticated API)
 *   session    — 20 req/min per user  (server functions)
 *   strict     — 3 req/hour per user  (creation events)
 */

import { db } from "../lib/db"
import { rateLimitEvents } from "../schemas/index"
import { and, gte, eq, lt } from "drizzle-orm"

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

const CONFIGS: Record<string, RateLimitConfig> = {
  anonymous: { maxRequests: 10, windowMs: 60_000 },
  token:     { maxRequests: 60, windowMs: 60_000 },
  session:   { maxRequests: 20, windowMs: 60_000 },
  strict:    { maxRequests: 3,  windowMs: 3_600_000 },  // 3 per hour
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  limit: number
}

/**
 * Check if a request is allowed under the given rate limit tier.
 * If allowed, records the request timestamp in DB.
 */
export async function checkRateLimit(
  tier: keyof typeof CONFIGS,
  key: string,
): Promise<RateLimitResult> {
  const config = CONFIGS[tier]
  if (!config) throw new Error(`Unknown rate limit tier: ${tier}`)

  const now = new Date()
  const cutoff = new Date(now.getTime() - config.windowMs)

  try {
    // 1. Delete expired logs for this key to prevent table bloat
    await db
      .delete(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.key, key),
          lt(rateLimitEvents.timestamp, cutoff)
        )
      )

    // 2. Fetch active request logs in the window
    const existing = await db
      .select()
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.key, key),
          gte(rateLimitEvents.timestamp, cutoff)
        )
      )

    const requestCount = existing.length
    const remaining = Math.max(0, config.maxRequests - requestCount)
    const allowed = remaining > 0

    if (allowed) {
      // 3. Record current request log
      await db.insert(rateLimitEvents).values({
        key,
        timestamp: now,
      })
    }

    // 4. Calculate reset duration based on the oldest log in the window
    let resetMs = 0
    if (existing.length > 0) {
      const sorted = [...existing].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      )
      const oldestTimestamp = sorted[0].timestamp
      resetMs = Math.max(0, oldestTimestamp.getTime() + config.windowMs - now.getTime())
    }

    return {
      allowed,
      remaining,
      resetMs,
      limit: config.maxRequests,
    }
  } catch (err) {
    // Fail-open default if database is temporarily unavailable during ratecheck
    console.error("Rate limiter db error:", err)
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetMs: 0,
      limit: config.maxRequests,
    }
  }
}

/**
 * Create standard rate limit headers for HTTP response.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
  }
}

