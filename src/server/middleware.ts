/**
 * Mantiz Shared Middleware Utilities
 *
 * Validation helpers, error formatting, and CORS utilities
 * shared across API endpoints and server functions.
 *
 * NOTE: This file does NOT import @tanstack/react-start/server
 * because it's imported by api/scan.tsx (which enters the client bundle).
 * Server-only auth utilities live in auth-utils.server.ts instead.
 */

const MAX_DIFF_SIZE = 500_000  // 500KB max diff upload

// ─── Input Validation ────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  error?: string
  status?: number
}

/**
 * Validate a diff payload for the /api/scan endpoint.
 */
export function validateDiff(diff: unknown): ValidationResult {
  if (!diff || typeof diff !== 'string') {
    return { valid: false, error: 'Missing required field: diff', status: 400 }
  }

  const trimmed = diff.trim()
  if (!trimmed) {
    return { valid: false, error: 'Diff cannot be empty', status: 400 }
  }

  if (trimmed.length > MAX_DIFF_SIZE) {
    return {
      valid: false,
      error: `Diff exceeds maximum size of ${(MAX_DIFF_SIZE / 1000).toFixed(0)}KB`,
      status: 413,
    }
  }

  return { valid: true }
}

/**
 * Validate and sanitize a PR URL.
 */
export function validatePRUrl(url: string): { valid: boolean; error?: string; parsed?: { owner: string; repo: string; pullNumber: number } } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'PR URL is required' }
  }

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) {
    return {
      valid: false,
      error: 'Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123',
    }
  }

  const pullNumber = Number(match[3])
  if (pullNumber < 1 || pullNumber > 1_000_000 || !Number.isInteger(pullNumber)) {
    return { valid: false, error: 'Invalid PR number' }
  }

  return {
    valid: true,
    parsed: { owner: match[1], repo: match[2], pullNumber },
  }
}

/**
 * Validate a token name (for createToken).
 */
export function validateTokenName(name: unknown): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Token name is required' }
  }
  const trimmed = name.trim()
  if (trimmed.length < 1) {
    return { valid: false, error: 'Token name cannot be empty' }
  }
  if (trimmed.length > 64) {
    return { valid: false, error: 'Token name must be 64 characters or less' }
  }

  if (!/^[\w\s-]+$/.test(trimmed)) {
    return { valid: false, error: 'Token name can only contain letters, numbers, spaces, hyphens, and underscores' }
  }
  return { valid: true }
}

// ─── Response Helpers ────────────────────────────────────────────

export function errorResponse(error: string, status: number, headers?: Record<string, string>): Response {
  const body: Record<string, string> = { error }
  if (status === 429) body.code = 'rate_limited'
  if (status === 413) body.code = 'payload_too_large'
  if (status === 401) body.code = 'unauthorized'

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export function successResponse(data: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

// ─── CORS ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://mantiz-wine.vercel.app',
  'http://localhost:3030',
  'http://localhost:3000',
]

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}
