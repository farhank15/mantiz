/**
 * Mantiz Historical Scoring Engine
 *
 * Tracks author behavior patterns over time and adjusts confidence
 * based on historical anomalies that regex and AST can't catch.
 *
 * Patterns detected:
 * 1. Drastic Style Change — PR description/commit style suddenly changes
 * 2. Odd Hour Commits — PRs consistently created at unusual hours (1-5 AM)
 * 3. Trust Score Volatility — Author's score swings wildly between scans
 * 4. New Author Anomaly — First time seeing this author, no baseline
 * 5. Frequency Anomaly — Unusually high PR frequency (potential automation)
 *
 * This is NOT a standalone detector — it's a scoring MODIFIER that
 * adjusts the final trust score based on behavioral context.
 */

import crypto from 'node:crypto'
import type { Finding, ParsedDiff } from './types'
import { db } from '../lib/db'
import { authorProfiles, authorEvents } from '../schemas/index'
import { eq, desc, and, gte } from 'drizzle-orm'

// ─── Constants ───────────────────────────────────────────────────

const ODD_HOUR_START = 1  // 1 AM
const ODD_HOUR_END = 5    // 5 AM
const MAX_DAILY_FREQUENCY = 10  // More than 10 PRs/day is suspicious
const STYLE_CHANGE_THRESHOLD = 0.7  // 70%+ difference = suspicious
const VOLATILITY_WINDOW = 5  // Last 5 scans to check volatility
const VOLATILITY_THRESHOLD = 40  // Score swings > 40pts = suspicious

// ─── Types ───────────────────────────────────────────────────────

export interface BehavioralProfile {
  author: string
  totalScans: number
  avgTrustScore: number
  avgFilesChanged: number
  suspicionScore: number
  consecutiveFailures: number
  peakDailyFrequency: number
  isNew: boolean
}

export interface BehavioralFinding {
  type: 'style_change' | 'odd_hours' | 'score_volatility' | 'new_author' | 'frequency_anomaly' | 'consecutive_failures'
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  details: string
  scoreModifier: number  // Negative = penalty, positive = trust boost
}

// ─── Utility ─────────────────────────────────────────────────────

/**
 * Generate a simple hash of writing style from text.
 * Uses word frequency distribution as a crude "fingerprint".
 */
function hashWritingStyle(text: string): string {
  if (!text || text.length < 5) return 'empty'

  // Normalize: lowercase, remove punctuation, split words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return 'empty'

  // Count word frequencies
  const freq = new Map<string, number>()
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1)
  }

  // Create a sorted fingerprint of top words
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w, c]) => `${w}:${c}`)
    .join('|')

  // Hash it for consistent length
  return crypto.createHash('md5').update(sorted).digest('hex').slice(0, 16)
}

/**
 * Compare two style hashes and return a similarity score (0-1).
 * 0 = completely different, 1 = identical.
 */
function compareStyleHashes(hashes: string[], currentHash: string): number {
  if (hashes.length === 0 || currentHash === 'empty') return 1 // No baseline = no anomaly

  // Count how many historical hashes match the current one
  const matches = hashes.filter(h => h === currentHash).length
  return matches / hashes.length
}

/**
 * Check if the current hour is in the "odd hours" range (1-5 AM).
 */
function isOddHour(): boolean {
  const hour = new Date().getHours()
  return hour >= ODD_HOUR_START && hour < ODD_HOUR_END
}

// ─── Database Operations ─────────────────────────────────────────

/**
 * Get or create an author profile in the database.
 */
async function getOrCreateAuthorProfile(author: string): Promise<{
  profile: typeof authorProfiles.$inferSelect
  isNew: boolean
}> {
  try {
    let profile = await db.query.authorProfiles.findFirst({
      where: eq(authorProfiles.githubAuthor, author),
    })

    if (!profile) {
      const [inserted] = await db
        .insert(authorProfiles)
        .values({
          githubAuthor: author,
          writingStyleHashes: [],
        })
        .returning()
      profile = inserted
      return { profile, isNew: true }
    }

    return { profile, isNew: false }
  } catch {
    // If DB fails, return a synthetic profile (graceful degradation)
    return {
      profile: {
        id: '',
        githubAuthor: author,
        firstSeen: new Date(),
        lastSeen: new Date(),
        totalScans: 0,
        avgTrustScore: 100,
        avgFilesChanged: 1,
        writingStyleHashes: [],
        suspicionScore: 0,
        lastFlaggedAt: null,
        consecutiveFailures: 0,
        peakDailyFrequency: 0,
      },
      isNew: true,
    }
  }
}

/**
 * Get recent events for an author to check frequency and volatility.
 */
async function getRecentEvents(
  authorId: string,
  windowHours: number = 24,
): Promise<typeof authorEvents.$inferSelect[]> {
  try {
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000)
    return await db.query.authorEvents.findMany({
      where: and(
        eq(authorEvents.authorId, authorId),
        gte(authorEvents.timestamp, cutoff),
      ),
      orderBy: [desc(authorEvents.timestamp)],
      limit: 50,
    })
  } catch {
    return []
  }
}

/**
 * Get recent scans for volatility analysis.
 */
async function getRecentScans(
  authorId: string,
  limit: number = VOLATILITY_WINDOW,
): Promise<{ trustScore: number }[]> {
  try {
    return await db.query.authorEvents.findMany({
      where: eq(authorEvents.authorId, authorId),
      orderBy: [desc(authorEvents.timestamp)],
      limit,
      columns: {
        trustScore: true,
      },
    })
  } catch {
    return []
  }
}

/**
 * Save a historical event for this author scan.
 */
export async function saveHistoricalEvent(params: {
  author: string
  scanId?: string
  eventType: 'pr_scan' | 'manual_scan' | 'api_scan'
  trustScore: number
  totalFindings: number
  filesChanged: number
  title?: string
}): Promise<void> {
  try {
    const { profile } = await getOrCreateAuthorProfile(params.author)

    // Generate style hash from title
    const styleHash = hashWritingStyle(params.title || '')

    // Update author profile
    const newTotalScans = profile.totalScans + 1
    const newAvgScore = Math.round(
      ((profile.avgTrustScore * profile.totalScans) + params.trustScore) / newTotalScans
    )
    const newAvgFiles = Math.round(
      ((profile.avgFilesChanged * profile.totalScans) + params.filesChanged) / newTotalScans
    )

    // Track consecutive failures
    const newConsecutiveFailures = params.trustScore < 70
      ? profile.consecutiveFailures + 1
      : 0

    await db
      .update(authorProfiles)
      .set({
        lastSeen: new Date(),
        totalScans: newTotalScans,
        avgTrustScore: newAvgScore,
        avgFilesChanged: newAvgFiles,
        writingStyleHashes: [
          ...profile.writingStyleHashes.slice(-9), // Keep last 10
          styleHash,
        ],
        consecutiveFailures: newConsecutiveFailures,
        suspicionScore: profile.suspicionScore,
      })
      .where(eq(authorProfiles.githubAuthor, params.author))

    // Insert event record
    await db.insert(authorEvents).values({
      authorId: profile.id,
      scanId: params.scanId || null,
      eventType: params.eventType,
      trustScore: params.trustScore,
      totalFindings: params.totalFindings,
      filesChanged: params.filesChanged,
      titleStyleHash: styleHash,
      commitHour: new Date().getHours(),
      metadata: params.title ? JSON.stringify({ title: params.title }) : null,
    })
  } catch {
    // Graceful degradation — historical scoring is non-blocking
  }
}

// ─── Behavioral Analysis ─────────────────────────────────────────

/**
 * Analyze a profile for style change anomalies.
 */
function analyzeStyleChange(
  profile: BehavioralProfile,
  hashes: string[],
  currentHash: string,
): BehavioralFinding | null {
  if (profile.isNew || hashes.length < 2) return null

  const similarity = compareStyleHashes(hashes.slice(0, -1), currentHash)

  if (similarity < (1 - STYLE_CHANGE_THRESHOLD)) {
    return {
      type: 'style_change',
      confidence: 'medium',
      explanation: `Author "${profile.author}" suddenly changed writing style. Previous ${hashes.length - 1} scans had consistent style, current scan is significantly different.`,
      details: `Style similarity: ${Math.round(similarity * 100)}% — threshold: ${Math.round(STYLE_CHANGE_THRESHOLD * 100)}%`,
      scoreModifier: -10,
    }
  }

  return null
}

/**
 * Analyze for odd-hour commit patterns.
 */
function analyzeOddHours(
  profile: BehavioralProfile,
): BehavioralFinding | null {
  if (profile.isNew || profile.totalScans < 3) return null

  const currentOdd = isOddHour()

  if (currentOdd) {
    // Check if this is a pattern (multiple odd-hour commits)
    // For now, we flag if the current scan is at an odd hour
    // The pattern detection comes from the cumulative suspicion score

    return {
      type: 'odd_hours',
      confidence: 'low',
      explanation: `Scan created at unusual hour (${new Date().getHours()}:00). Consistent odd-hour patterns may indicate automated or scripted behavior.`,
      details: `Current time: ${new Date().getHours()}:00 — outside normal working hours (${ODD_HOUR_START}-${ODD_HOUR_END} AM)`,
      scoreModifier: -5,
    }
  }

  return null
}

/**
 * Analyze trust score volatility — sudden swings indicate manipulation.
 */
function analyzeScoreVolatility(
  profile: BehavioralProfile,
  recentScores: number[],
): BehavioralFinding | null {
  if (recentScores.length < 2) return null

  const scores = recentScores.slice(0, VOLATILITY_WINDOW)

  // Calculate max swing in recent scores
  let maxSwing = 0
  for (let i = 1; i < scores.length; i++) {
    const swing = Math.abs(scores[i] - scores[i - 1])
    maxSwing = Math.max(maxSwing, swing)
  }

  if (maxSwing >= VOLATILITY_THRESHOLD) {
    return {
      type: 'score_volatility',
      confidence: 'high',
      explanation: `Author "${profile.author}" has highly volatile trust scores (max swing: ${maxSwing}pts within last ${scores.length} scans). This pattern is consistent with AI agent impersonation.`,
      details: `Recent scores: [${scores.join(', ')}] — max swing: ${maxSwing}pts (threshold: ${VOLATILITY_THRESHOLD}pts)`,
      scoreModifier: -15,
    }
  }

  // Moderate volatility
  if (maxSwing >= VOLATILITY_THRESHOLD / 2) {
    return {
      type: 'score_volatility',
      confidence: 'low',
      explanation: `Author "${profile.author}" shows moderate trust score volatility (${maxSwing}pts swing).`,
      details: `Recent scores: [${scores.join(', ')}] — max swing: ${maxSwing}pts`,
      scoreModifier: -5,
    }
  }

  return null
}

/**
 * Analyze new author — no history means higher scrutiny.
 */
function analyzeNewAuthor(
  profile: BehavioralProfile,
): BehavioralFinding | null {
  if (!profile.isNew) return null

  return {
    type: 'new_author',
    confidence: 'low',
    explanation: `Author "${profile.author}" has no scan history. New authors are flagged for additional scrutiny on first interaction.`,
    details: `First scan from this author — no behavioral baseline available.`,
    scoreModifier: -5,
  }
}

/**
 * Analyze commit frequency anomalies.
 */
function analyzeFrequency(
  profile: BehavioralProfile,
  recentEvents: number,
): BehavioralFinding | null {
  if (profile.isNew || profile.totalScans < 3) return null

  if (recentEvents > MAX_DAILY_FREQUENCY) {
    return {
      type: 'frequency_anomaly',
      confidence: 'medium',
      explanation: `Author "${profile.author}" has ${recentEvents} scans in the last 24 hours (max: ${MAX_DAILY_FREQUENCY}). Unusually high frequency suggests automated or bot-like behavior.`,
      details: `${recentEvents} scans in 24h — threshold: ${MAX_DAILY_FREQUENCY}`,
      scoreModifier: -10,
    }
  }

  if (recentEvents > MAX_DAILY_FREQUENCY / 2) {
    return {
      type: 'frequency_anomaly',
      confidence: 'low',
      explanation: `Author "${profile.author}" has ${recentEvents} scans today — slightly above normal.`,
      details: `${recentEvents} scans in 24h`,
      scoreModifier: -3,
    }
  }

  return null
}

/**
 * Analyze consecutive failures — consistent cheating pattern.
 */
function analyzeConsecutiveFailures(
  profile: BehavioralProfile,
): BehavioralFinding | null {
  if (profile.consecutiveFailures < 3) return null

  const penalty = Math.min(profile.consecutiveFailures * 5, 25)

  return {
    type: 'consecutive_failures',
    confidence: profile.consecutiveFailures >= 5 ? 'high' : 'medium',
    explanation: `Author "${profile.author}" has ${profile.consecutiveFailures} consecutive failed scans. This pattern indicates persistent attempts to push dishonest code.`,
    details: `${profile.consecutiveFailures} consecutive failures — penalty: -${penalty}pts`,
    scoreModifier: -penalty,
  }
}

// ─── Main Analysis Entry Point ──────────────────────────────────

/**
 * Run historical behavioral analysis.
 *
 * This is NOT a standalone detector that produces findings directly.
 * Instead, it returns a score MODIFIER and behavioral findings that
 * get merged into the overall scan result.
 *
 * If database is unavailable (e.g., CLI usage without DB), it degrades
 * gracefully by returning an empty result.
 */
export async function analyzeHistoricalBehavior(params: {
  author: string
  title?: string
  trustScore: number
  totalFindings: number
  filesChanged: number
  files: ParsedDiff[]
}): Promise<{
  modifier: number
  findings: Finding[]
}> {
  try {
    const { profile, isNew } = await getOrCreateAuthorProfile(params.author)

    if (isNew && !params.title) {
      // No context to analyze — skip
      return { modifier: 0, findings: [] }
    }

    // Build behavioral profile
    const behavioralProfile: BehavioralProfile = {
      author: params.author,
      totalScans: profile.totalScans,
      avgTrustScore: profile.avgTrustScore,
      avgFilesChanged: profile.avgFilesChanged,
      suspicionScore: profile.suspicionScore,
      consecutiveFailures: profile.consecutiveFailures,
      peakDailyFrequency: profile.peakDailyFrequency,
      isNew,
    }

    // Get recent events for frequency analysis
    const recentEvents = await getRecentEvents(profile.id)

    // Get recent scores for volatility analysis
    const recentScores = (await getRecentScans(profile.id)).map(e => e.trustScore)

    // Current style hash
    const currentHash = hashWritingStyle(params.title || '')

    // Run all analyzers
    const behavioralFindings: BehavioralFinding[] = [
      analyzeStyleChange(behavioralProfile, profile.writingStyleHashes, currentHash),
      analyzeOddHours(behavioralProfile),
      analyzeScoreVolatility(behavioralProfile, recentScores),
      analyzeNewAuthor(behavioralProfile),
      analyzeFrequency(behavioralProfile, recentEvents.length),
      analyzeConsecutiveFailures(behavioralProfile),
    ].filter((f): f is BehavioralFinding => f !== null)

    // Calculate total modifier
    const totalModifier = behavioralFindings.reduce((sum, f) => sum + f.scoreModifier, 0)

    // Convert to Finding format for display
    const findings: Finding[] = behavioralFindings.map(bf => ({
      patternType: 'historical_behavioral' as const,
      filePath: 'historical',
      lineStart: 0,
      lineEnd: 0,
      confidence: bf.confidence,
      explanation: `📊 [Historical] ${bf.explanation}`,
      evidenceExcerpt: bf.details.substring(0, 200),
    }))

    // Update suspicion score in the background
    const newSuspicionScore = Math.max(0, Math.min(100,
      profile.suspicionScore + (totalModifier < 0 ? Math.abs(totalModifier) / 2 : -5)
    ))

    try {
      await db
        .update(authorProfiles)
        .set({
          suspicionScore: newSuspicionScore,
          lastFlaggedAt: totalModifier < 0 ? new Date() : profile.lastFlaggedAt,
        })
        .where(eq(authorProfiles.githubAuthor, params.author))
    } catch {
      // Non-critical
    }

    return {
      modifier: totalModifier,
      findings,
    }
  } catch {
    // Graceful degradation — DB unavailable
    return { modifier: 0, findings: [] }
  }
}
