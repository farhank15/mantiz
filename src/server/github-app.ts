/**
 * Mantiz GitHub App — Authentication & Webhook Utilities
 *
 * Handles:
 * - GitHub App JWT auth via octokit App class
 * - Installation access token management
 * - Webhook HMAC-SHA256 signature verification
 * - Installation CRUD in database
 *
 * Based on official docs:
 *   https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
 *   https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */

import crypto from 'node:crypto'
import { App } from 'octokit'
import { db } from '../lib/db'
import { githubInstalls } from '../schemas/index'
import { eq } from 'drizzle-orm'

// ─── Environment Check ──────────────────────────────────────────

const APP_ID = process.env.GITHUB_APP_ID
const PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

export function isGitHubAppConfigured(): boolean {
  return !!(APP_ID && PRIVATE_KEY && WEBHOOK_SECRET)
}

let _app: App | null = null

/**
 * Get or initialize the octokit App instance.
 * The App class handles JWT generation/renewal automatically.
 */
function getApp(): App {
  if (!_app) {
    if (!APP_ID || !PRIVATE_KEY) {
      throw new Error(
        'GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.',
      )
    }
    _app = new App({
      appId: APP_ID,
      privateKey: PRIVATE_KEY.replace(/\\n/g, '\n'),
      webhooks: WEBHOOK_SECRET ? { secret: WEBHOOK_SECRET } : undefined,
    })
  }
  return _app
}

// ─── Installation Token Management ──────────────────────────────

/**
 * Get an authenticated octokit instance for a specific installation.
 * Tokens are cached in-memory — octokit App class handles refresh automatically.
 */
export async function getInstallationOctokit(installationId: number) {
  const app = getApp()
  return app.getInstallationOctokit(installationId)
}

/**
 * Get the app's own octokit instance (for admin operations).
 */
export async function getAppOctokit() {
  const app = getApp()
  return app.octokit
}

// ─── Webhook HMAC Verification ──────────────────────────────────

/**
 * Verify GitHub webhook HMAC-SHA256 signature.
 * Uses timingSafeEqual to prevent timing attacks.
 *
 * @param rawBody — Raw request body as string (NOT parsed JSON)
 * @param signature — X-Hub-Signature-256 header value
 * @param secret — Webhook secret (defaults to GITHUB_WEBHOOK_SECRET env)
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string = WEBHOOK_SECRET || '',
): boolean {
  if (!secret) {
    console.warn('[github-app] No webhook secret configured — skipping signature verification')
    return false
  }

  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody, 'utf8')
  const expected = 'sha256=' + hmac.digest('hex')

  try {
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length) return false
    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

// ─── Webhook Event Type Helpers ─────────────────────────────────

export interface GitHubWebhookEvent {
  /** X-GitHub-Delivery header — unique delivery ID */
  deliveryId: string
  /** X-GitHub-Event header — event type */
  event: string
  /** X-Hub-Signature-256 header */
  signature: string
  /** Raw request body */
  rawBody: string
  /** Parsed JSON payload */
  payload: Record<string, unknown>
}

/**
 * Parse and verify a GitHub webhook request.
 * Returns the parsed event on success, or throws on verification failure.
 */
export async function parseWebhookRequest(
  request: Request,
): Promise<GitHubWebhookEvent> {
  const deliveryId = request.headers.get('x-github-delivery') || ''
  const event = request.headers.get('x-github-event') || ''
  const signature = request.headers.get('x-hub-signature-256') || ''

  if (!deliveryId || !event) {
    throw new Error('Missing GitHub webhook headers')
  }

  // Read raw body as text BEFORE any JSON parsing
  const rawBody = await request.text()

  // Verify HMAC signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new Error('Invalid webhook signature')
  }

  // Parse JSON payload
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new Error('Invalid webhook payload JSON')
  }

  return { deliveryId, event, signature, rawBody, payload }
}

// ─── Installation Database ──────────────────────────────────────

export interface InstallationRecord {
  installationId: number
  accountId: number
  accountLogin: string
  accountType: 'User' | 'Organization'
  repoIds: number[]
}

/**
 * Save or update a GitHub App installation record.
 */
export async function saveInstallation(data: InstallationRecord): Promise<void> {
  await db
    .insert(githubInstalls)
    .values({
      installationId: data.installationId,
      accountId: data.accountId,
      accountLogin: data.accountLogin,
      accountType: data.accountType,
      repoIds: data.repoIds,
    })
    .onConflictDoUpdate({
      target: githubInstalls.installationId,
      set: {
        repoIds: data.repoIds,
        updatedAt: new Date(),
      },
    })
}

/**
 * Remove an installation record (on uninstall).
 */
export async function removeInstallation(installationId: number): Promise<void> {
  await db
    .delete(githubInstalls)
    .where(eq(githubInstalls.installationId, installationId))
}

/**
 * Get all repo IDs for a given installation.
 */
export async function getInstallationRepos(
  installationId: number,
): Promise<number[]> {
  const record = await db.query.githubInstalls.findFirst({
    where: eq(githubInstalls.installationId, installationId),
  })
  return record?.repoIds || []
}

/**
 * Update repo list for an installation (add or remove repos).
 */
export async function updateInstallationRepos(
  installationId: number,
  repoIds: number[],
): Promise<void> {
  await db
    .update(githubInstalls)
    .set({ repoIds, updatedAt: new Date() })
    .where(eq(githubInstalls.installationId, installationId))
}
