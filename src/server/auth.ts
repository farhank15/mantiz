/**
 * Mantiz Authentication — GitHub OAuth Server Functions
 *
 * Uses TanStack Start's createServerFn for type-safe RPC.
 * Session is managed via signed HTTP-only cookies.
 */

import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader, getCookie } from '@tanstack/react-start/server'
import { Octokit } from '@octokit/rest'
import crypto from 'node:crypto'

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!
const SESSION_SECRET = process.env.SESSION_SECRET!

const SESSION_COOKIE = 'mantiz_session'
const OAUTH_STATE_COOKIE = 'oauth_state'

// ─── Session Cookie Utilities ─────────────────────────────────────

interface SessionData {
  userId: number
  login: string
  avatar: string
  name: string
  token: string
}

function signCookie(value: string): string {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET)
  hmac.update(value)
  return `${value}.${hmac.digest('hex')}`
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
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return null
    }
  } catch {
    return null
  }
  return value
}

function encodeSession(data: SessionData): string {
  const json = JSON.stringify(data)
  const encoded = Buffer.from(json).toString('base64')
  return signCookie(encoded)
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

function setSessionCookie(session: SessionData): void {
  const cookieValue = encodeSession(session)
  setResponseHeader('Set-Cookie', `${SESSION_COOKIE}=${cookieValue}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`)
}

function clearSessionCookie(): void {
  setResponseHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
}

// ─── Server Functions ─────────────────────────────────────────────

/**
 * Initiate GitHub OAuth login — returns the GitHub authorization URL.
 * Sets a state cookie server-side for CSRF verification.
 */
export const startLogin = createServerFn({ method: 'GET' }).handler(async () => {
  const state = crypto.randomBytes(32).toString('hex')
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  const redirectUri = `${baseUrl}/auth/github/callback`

  // Store state in cookie for CSRF verification (10 min expiry)
  setResponseHeader(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`
  )

  const githubUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=repo,user:email`

  return { url: githubUrl }
})

/**
 * Exchange OAuth code for access token and create session.
 * Called from the callback page after user authorizes.
 */
export const handleCallback = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as { code: string; state: string })
  .handler(async ({ data }) => {
    const { code, state } = data

    // Verify state to prevent CSRF
    const storedState = getCookie(OAUTH_STATE_COOKIE)
    if (!storedState || storedState !== state) {
      throw new Error('Invalid state parameter — possible CSRF attack')
    }

    // Clear the state cookie
    setResponseHeader(
      'Set-Cookie',
      `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
    )

    // Exchange code for access token
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
        }),
      }
    )

    if (!tokenRes.ok) {
      throw new Error(`GitHub token exchange failed: ${tokenRes.status}`)
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(
        `GitHub OAuth error: ${tokenData.error} — ${tokenData.error_description}`
      )
    }

    // Get user info from GitHub
    const octokit = new Octokit({ auth: tokenData.access_token })
    const { data: user } = await octokit.users.getAuthenticated()

    // Create session data
    const session: SessionData = {
      userId: user.id,
      login: user.login,
      avatar: user.avatar_url,
      name: user.name || user.login,
      token: tokenData.access_token,
    }

    // Set session cookie (7 day expiry)
    setSessionCookie(session)

    return { login: session.login, avatar: session.avatar, name: session.name }
  }
)

/**
 * Get the current user session. Returns null if not authenticated.
 */
export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const cookie = getCookie(SESSION_COOKIE)
  if (!cookie) return null

  const session = decodeSession(cookie)
  if (!session) return null

  return {
    login: session.login,
    avatar: session.avatar,
    name: session.name,
    userId: session.userId,
  }
})

/**
 * Logout — clears the session cookie.
 */
export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  clearSessionCookie()
  return { success: true }
})

/**
 * Fetch and scan a GitHub PR diff. Requires valid session.
 */
export const scanPR = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as { prUrl: string })
  .handler(async ({ data }) => {
    const cookie = getCookie(SESSION_COOKIE)
    if (!cookie) {
      throw new Error('Not authenticated. Please login with GitHub first.')
    }

    const session = decodeSession(cookie)
    if (!session) {
      clearSessionCookie()
      throw new Error('Session expired. Please login again.')
    }

    // Parse PR URL: https://github.com/owner/repo/pull/123
    const prMatch = data.prUrl.match(
      /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    )
    if (!prMatch) {
      throw new Error('Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123')
    }

    const [, owner, repo, pullNumber] = prMatch
    const prNumber = Number(pullNumber)

    const octokit = new Octokit({ auth: session.token })

    // Fetch PR metadata
    const { data: prData } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    })

    // Fetch PR diff as raw text
    const diffRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        headers: {
          Authorization: `Bearer ${session.token}`,
          Accept: 'application/vnd.github.v3.diff',
        },
      }
    )

    if (!diffRes.ok) {
      throw new Error(`Failed to fetch PR diff: ${diffRes.status}`)
    }

    const diffText = await diffRes.text()

    // Run Mantiz scan on the diff
    // Dynamic import to avoid circular dependencies
    const { scanDiff } = await import('../detectors/engine')
    const result = scanDiff(diffText)

    return {
      pr: {
        number: prData.number,
        title: prData.title,
        author: prData.user?.login || 'unknown',
        state: prData.state,
        url: prData.html_url,
      },
      scan: {
        trustScore: result.trustScore,
        totalFindings: result.summary.totalFindings,
        highCount: result.summary.highCount,
        findings: result.findings.slice(0, 20), // Limit findings
      },
    }
  }
)
