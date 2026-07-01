/**
 * Mantiz Auth Utilities — Server Only
 *
 * Session cookie parsing and authentication helpers.
 * This file has a .server.ts extension so TanStack Start's bundler
 * knows it should NOT be included in client bundles.
 */

import { getCookie } from '@tanstack/react-start/server'
import crypto from 'node:crypto'

const SESSION_SECRET = process.env.SESSION_SECRET!
const SESSION_COOKIE = 'mantiz_session'

export interface SessionData {
  userId: number
  dbUserId: string
  login: string
  avatar: string
  name: string
  token: string
}

function unsignCookie(signed: string): string | null {
  const dotIndex = signed.lastIndexOf('.')
  if (dotIndex === -1) return null
  const value = signed.slice(0, dotIndex)
  const signature = signed.slice(dotIndex + 1)
  const hmac = crypto.createHmac('sha256', SESSION_SECRET)
  hmac.update(value)
  const expected = hmac.digest('hex')
  try {
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
  } catch {
    return null
  }
  return value
}

function decodeSession(signed: string): SessionData | null {
  const encoded = unsignCookie(signed)
  if (!encoded) return null
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8')
    return JSON.parse(json) as SessionData
  } catch {
    return null
  }
}

/**
 * Extract authenticated session from request context.
 * Throws descriptive error if not authenticated.
 */
export function requireAuth(): SessionData {
  const cookie = getCookie(SESSION_COOKIE)
  if (!cookie) throw new Error('Not authenticated')
  const session = decodeSession(cookie)
  if (!session) throw new Error('Session expired')
  return session
}

/**
 * Try to get authenticated session, returning null instead of throwing.
 */
export function tryAuth(): { userId: string; login: string } | null {
  try {
    const session = requireAuth()
    return { userId: session.dbUserId, login: session.login }
  } catch {
    return null
  }
}
