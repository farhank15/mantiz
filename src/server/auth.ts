/**
 * Mantiz Authentication — GitHub OAuth Server Functions
 *
 * Uses TanStack Start's createServerFn for type-safe RPC.
 * Session is managed via signed HTTP-only cookies.
 */

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, getCookie } from "@tanstack/react-start/server";
import { Octokit } from "@octokit/rest";
import crypto from "node:crypto";

import { db } from "../lib/db";
import { users, repos, scans, findings } from "../schemas/index";
import { eq, desc, sql } from "drizzle-orm";
import { checkRateLimit } from "./rate-limiter";
import { validatePRUrl } from "./middleware";

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const SESSION_SECRET = process.env.SESSION_SECRET!;

const SESSION_COOKIE = "mantiz_session";
const OAUTH_STATE_COOKIE = "oauth_state";

// ─── Session Cookie Utilities ─────────────────────────────────────

interface SessionData {
  userId: number;
  dbUserId: string;
  login: string;
  avatar: string;
  name: string;
  token: string;
}

function signCookie(value: string): string {
  const hmac = crypto.createHmac("sha256", SESSION_SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest("hex")}`;
}

function unsignCookie(signed: string): string | null {
  const dotIndex = signed.lastIndexOf(".");
  if (dotIndex === -1) return null;
  const value = signed.slice(0, dotIndex);
  const signature = signed.slice(dotIndex + 1);
  const hmac = crypto.createHmac("sha256", SESSION_SECRET);
  hmac.update(value);
  const expected = hmac.digest("hex");
  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex"),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}

function encodeSession(data: SessionData): string {
  const json = JSON.stringify(data);
  const encoded = Buffer.from(json).toString("base64");
  return signCookie(encoded);
}

function decodeSession(signed: string): SessionData | null {
  const encoded = unsignCookie(signed);
  if (!encoded) return null;
  try {
    const json = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(json) as SessionData;
  } catch {
    return null;
  }
}

function setSessionCookie(session: SessionData): void {
  const cookieValue = encodeSession(session);
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${cookieValue}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`,
  );
}

function clearSessionCookie(): void {
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
  );
}

// ─── Server Functions ─────────────────────────────────────────────

/**
 * Initiate GitHub OAuth login — returns the GitHub authorization URL.
 * Sets a state cookie server-side for CSRF verification.
 */
export const startLogin = createServerFn({ method: "GET" }).handler(
  async () => {
    const state = crypto.randomBytes(32).toString("hex");
    const baseUrl =
      process.env.APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3030");
    const redirectUri = `${baseUrl}/auth/github/callback`;

    // Store state in cookie for CSRF verification (10 min expiry)
    setResponseHeader(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
    );

    const githubUrl =
      `https://github.com/login/oauth/authorize?` +
      `client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=repo,user:email`;

    return { url: githubUrl };
  },
);

/**
 * Exchange OAuth code for access token and create session.
 * Called from the callback page after user authorizes.
 */
export const handleCallback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input as { code: string; state: string })
  .handler(async ({ data }) => {
    const { code, state } = data;

    // Verify state to prevent CSRF
    const storedState = getCookie(OAUTH_STATE_COOKIE);
    if (!storedState || storedState !== state) {
      throw new Error("Invalid state parameter — possible CSRF attack");
    }

    // Clear the state cookie
    setResponseHeader(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
    );

    // Exchange code for access token
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
        }),
      },
    );

    if (!tokenRes.ok) {
      throw new Error(`GitHub token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(
        `GitHub OAuth error: ${tokenData.error} — ${tokenData.error_description}`,
      );
    }

    // Get user info from GitHub
    const octokit = new Octokit({ auth: tokenData.access_token });
    const { data: user } = await octokit.users.getAuthenticated();

    // ─── Database Sync ──────────────────────────────────────────────
    let dbUser = await db.query.users.findFirst({
      where: eq(users.githubId, String(user.id)),
    });

    if (!dbUser) {
      const [inserted] = await db
        .insert(users)
        .values({
          githubId: String(user.id),
          username: user.login,
          avatarUrl: user.avatar_url,
        })
        .returning();
      dbUser = inserted;
    } else {
      await db
        .update(users)
        .set({
          username: user.login,
          avatarUrl: user.avatar_url,
        })
        .where(eq(users.id, dbUser.id));
    }

    // Create session data
    const session: SessionData = {
      userId: user.id,
      dbUserId: dbUser.id,
      login: user.login,
      avatar: user.avatar_url,
      name: user.name || user.login,
      token: tokenData.access_token,
    };

    // Set session cookie (7 day expiry)
    setSessionCookie(session);

    return {
      login: session.login,
      avatar: session.avatar,
      name: session.name,
      userId: session.userId,
      dbUserId: session.dbUserId,
    };
  });

/**
 * Get the current user session. Returns null if not authenticated.
 * Uses POST to ensure cookies are properly included in the request context.
 */
export const getSession = createServerFn({ method: "POST" }).handler(
  async () => {
    const cookie = getCookie(SESSION_COOKIE);
    if (!cookie) return null;

    const session = decodeSession(cookie);
    if (!session) return null;

    return {
      login: session.login,
      avatar: session.avatar,
      name: session.name,
      userId: session.userId,
      dbUserId: session.dbUserId,
    };
  },
);

/**
 * Logout — clears the session cookie.
 */
export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookie();
  return { success: true };
});

/**
 * Fetch and scan a GitHub PR diff. Requires valid session.
 * Rate limited: 20 requests per minute per user.
 */
export const scanPR = createServerFn({ method: "POST" })
  .validator((input: unknown) => input as { prUrl: string })
  .handler(async ({ data }) => {
    const cookie = getCookie(SESSION_COOKIE);
    if (!cookie) {
      throw new Error("Not authenticated. Please login with GitHub first.");
    }

    const session = decodeSession(cookie);
    if (!session) {
      clearSessionCookie();
      throw new Error("Session expired. Please login again.");
    }

    // Rate limit: 20 PR scans per minute per user
    const rateResult = checkRateLimit('session', `scan_pr:${session.dbUserId}`);
    if (!rateResult.allowed) {
      throw new Error('Rate limit exceeded. Maximum 20 PR scans per minute.');
    }

    // Validate PR URL using shared middleware
    const prValidation = validatePRUrl(data.prUrl);
    if (!prValidation.valid || !prValidation.parsed) {
      throw new Error(prValidation.error);
    }

    const { owner, repo, pullNumber } = prValidation.parsed;

    const octokit = new Octokit({ auth: session.token });

    // Fetch PR metadata
    const { data: prData } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Fetch PR diff as raw text
    const diffRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        headers: {
          Authorization: `Bearer ${session.token}`,
          Accept: "application/vnd.github.v3.diff",
        },
      },
    );

    if (!diffRes.ok) {
      throw new Error(`Failed to fetch PR diff: ${diffRes.status}`);
    }

    const diffText = await diffRes.text();

    // Run Mantiz scan on the diff (includes AI detection if enabled)
    // Pass PR context (title + author) for bot/honest-title awareness
    // Dynamic import to avoid circular dependencies
    const { scanDiffAsync } = await import("../detectors/engine");
    const result = await scanDiffAsync(diffText, {
      title: prData.title,
      author: prData.user?.login,
    });

    // ─── Database Sync ──────────────────────────────────────────────
    try {
      const repoFullName = `${owner}/${repo}`.toLowerCase();
      let repoRecord = await db.query.repos.findFirst({
        where: eq(repos.fullName, repoFullName),
      });

      if (!repoRecord) {
        const [insertedRepo] = await db
          .insert(repos)
          .values({
            userId: session.dbUserId,
            fullName: repoFullName,
            githubRepoId: prData.base.repo.id,
          })
          .returning();
        repoRecord = insertedRepo;
      }

      // Insert scan
      const [scanRecord] = await db
        .insert(scans)
        .values({
          userId: session.dbUserId,
          repoId: repoRecord.id,
          sourceType: "github_pr",
          sourceRef: data.prUrl,
          rawDiff: diffText,
          trustScore: result.trustScore,
          status: "complete",
          completedAt: new Date(),
        })
        .returning();

      // Insert findings
      if (result.findings.length > 0) {
        await db.insert(findings).values(
          result.findings.map((f) => ({
            scanId: scanRecord.id,
            patternType: f.patternType,
            filePath: f.filePath,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            confidence: f.confidence,
            explanation: f.explanation,
            evidenceExcerpt: f.evidenceExcerpt,
          })),
        );
      }
    } catch (dbErr) {
      console.error("Failed to save PR scan to database:", dbErr);
    }

    return {
      pr: {
        number: prData.number,
        title: prData.title,
        author: prData.user?.login || "unknown",
        state: prData.state,
        url: prData.html_url,
      },
      scan: {
        trustScore: result.trustScore,
        totalFindings: result.summary.totalFindings,
        highCount: result.summary.highCount,
        mediumCount: result.summary.mediumCount,
        lowCount: result.summary.lowCount,
        filesScanned: result.summary.filesScanned,
        findings: result.findings.slice(0, 20), // Limit findings
      },
    };
  });

/**
 * Save a manual diff scan to the database. Requires valid session.
 */
export const saveManualScan = createServerFn({ method: "POST" })
  .validator(
    (input: unknown) =>
      input as { rawDiff: string; trustScore: number; findings: any[] },
  )
  .handler(async ({ data }) => {
    const cookie = getCookie(SESSION_COOKIE);
    if (!cookie) return null; // optional save: only if logged in

    const session = decodeSession(cookie);
    if (!session) return null;

    try {
      // Insert scan
      const [scanRecord] = await db
        .insert(scans)
        .values({
          userId: session.dbUserId,
          sourceType: "manual",
          rawDiff: data.rawDiff,
          trustScore: data.trustScore,
          status: "complete",
          completedAt: new Date(),
        })
        .returning();

      // Insert findings
      if (data.findings.length > 0) {
        await db.insert(findings).values(
          data.findings.map((f) => ({
            scanId: scanRecord.id,
            patternType: f.patternType,
            filePath: f.filePath,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            confidence: f.confidence,
            explanation: f.explanation,
            evidenceExcerpt: f.evidenceExcerpt,
          })),
        );
      }

      return { success: true, scanId: scanRecord.id };
    } catch (dbErr) {
      console.error("Failed to save manual scan to database:", dbErr);
      return { success: false, error: "Database save failed" };
    }
  });

/**
 * Fetch scan history for the current user. Requires valid session.
 * Supports pagination via limit and offset.
 */
export const getScanHistory = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const v = input as { limit?: number; offset?: number }
    return {
      limit: Math.min(Math.max(v.limit ?? 15, 1), 50),
      offset: Math.max(v.offset ?? 0, 0),
    }
  })
  .handler(async ({ data }) => {
    const cookie = getCookie(SESSION_COOKIE);
    if (!cookie) {
      throw new Error("Not authenticated");
    }

    const session = decodeSession(cookie);
    if (!session) {
      throw new Error("Session expired");
    }

    // Fetch scans with repo name if it exists, sorted by newest first
    const history = await db
      .select({
        id: scans.id,
        sourceType: scans.sourceType,
        sourceRef: scans.sourceRef,
        trustScore: scans.trustScore,
        status: scans.status,
        createdAt: scans.createdAt,
        repoName: repos.fullName,
      })
      .from(scans)
      .leftJoin(repos, eq(scans.repoId, repos.id))
      .where(eq(scans.userId, session.dbUserId))
      .orderBy(desc(scans.createdAt))
      .limit(data.limit)
      .offset(data.offset);

    // Check if there are more results
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scans)
      .where(eq(scans.userId, session.dbUserId));
    const total = Number(countResult.count);

    return {
      scans: history,
      hasMore: data.offset + data.limit < total,
      total,
      limit: data.limit,
      offset: data.offset,
    };
  });

/**
 * Fetch detailed findings and information for a specific scan. Requires valid session.
 */
export const getScanDetails = createServerFn({ method: "POST" })
  .validator((input: unknown) => input as { scanId: string })
  .handler(async ({ data }) => {
    const cookie = getCookie(SESSION_COOKIE);
    if (!cookie) {
      throw new Error("Not authenticated");
    }

    const session = decodeSession(cookie);
    if (!session) {
      throw new Error("Session expired");
    }

    // Fetch the scan details
    const scanRecord = await db.query.scans.findFirst({
      where: eq(scans.id, data.scanId),
    });

    if (!scanRecord) {
      throw new Error("Scan not found");
    }

    // Ensure the scan belongs to the current user (security check!)
    if (scanRecord.userId !== session.dbUserId) {
      throw new Error("Unauthorized access to this scan");
    }

    // Count files scanned from the raw diff
    const filesScanned = scanRecord.rawDiff
      ? (scanRecord.rawDiff.match(/^diff --git/gm) || []).length
      : 0;

    // Fetch findings for this scan
    const scanFindings = await db.query.findings.findMany({
      where: eq(findings.scanId, data.scanId),
    });

    return {
      scan: {
        id: scanRecord.id,
        sourceType: scanRecord.sourceType,
        sourceRef: scanRecord.sourceRef,
        rawDiff: scanRecord.rawDiff,
        trustScore: scanRecord.trustScore,
        filesScanned,
        status: scanRecord.status,
        createdAt: scanRecord.createdAt,
      },
      findings: scanFindings,
    };
  });
