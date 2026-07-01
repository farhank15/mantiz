/**
 * Mantiz In-Memory Rate Limiter
 *
 * Sliding window implementation. Suitable for Vercel serverless
 * (resets on cold start — acceptable for hackathon).
 *
 * Three tiers:
 *   anonymous  — 10 req/min per IP  (POST /api/scan)
 *   token      — 60 req/min per token  (authenticated API)
 *   session    — 20 req/min per user  (server functions)
 */

interface RateLimitEntry {
  timestamps: number[]  // ms timestamps, oldest first
}

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

const stores = new Map<string, Map<string, RateLimitEntry>>()

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }
  return store
}

function prune(store: Map<string, RateLimitEntry>, windowMs: number): void {
  const cutoff = Date.now() - windowMs
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  limit: number
}

/**
 * Check if a request is allowed under the given rate limit tier.
 * If allowed, records the request timestamp.
 */
export function checkRateLimit(
  tier: keyof typeof CONFIGS,
  key: string,
): RateLimitResult {
  const config = CONFIGS[tier]
  if (!config) throw new Error(`Unknown rate limit tier: ${tier}`)

  const store = getStore(tier)
  const now = Date.now()
  const cutoff = now - config.windowMs

  // Prune old entries periodically (every ~100 requests)
  if (Math.random() < 0.01) prune(store, config.windowMs)

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => t > cutoff)

  const remaining = Math.max(0, config.maxRequests - entry.timestamps.length)
  const allowed = remaining > 0

  if (allowed) {
    entry.timestamps.push(now)
  }

  // Calculate when the oldest request expires (for rate limit reset header)
  const resetMs = entry.timestamps.length > 0
    ? Math.max(0, entry.timestamps[0] + config.windowMs - now)
    : 0

  return {
    allowed,
    remaining,
    resetMs,
    limit: config.maxRequests,
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
