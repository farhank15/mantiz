/**
 * Mantiz Share — Generate public share links for scan results
 *
 * createShareLink: saves scan data to DB, returns public URL
 * getSharedScan: fetches shared scan by ID (no auth required)
 */

import { createServerFn } from "@tanstack/react-start"
import { db } from "../lib/db"
import { sharedScans } from "../schemas/index"
import { eq } from "drizzle-orm"
import crypto from "node:crypto"

function generateShareId(): string {
  return crypto.randomBytes(6).toString("base64url")
}

/**
 * Save a scan result and return a public share URL.
 * No authentication required.
 */
export const createShareLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const v = input as {
      scanData: {
        trustScore: number
        totalFindings: number
        highCount: number
        mediumCount: number
        lowCount: number
        filesScanned: number
        files: number
        findings: Array<{
          patternType: string
          filePath: string
          lineStart: number
          lineEnd: number
          confidence: string
          explanation: string
          evidenceExcerpt: string
        }>
      }
      sourceType: "manual" | "github_pr"
      sourceRef?: string
    }
    if (!v.scanData || typeof v.scanData.trustScore !== "number") {
      throw new Error("Invalid scan data")
    }
    return v
  })
  .handler(async ({ data }) => {
    const shareId = generateShareId()

    await db.insert(sharedScans).values({
      id: shareId,
      scanData: JSON.stringify(data.scanData),
      sourceType: data.sourceType,
      sourceRef: data.sourceRef || null,
    })

    const baseUrl =
      process.env.APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3030")

    return {
      url: `${baseUrl}/share/${shareId}`,
      shareId,
    }
  })

/**
 * Fetch a shared scan by its public ID.
 * No authentication required (public endpoint).
 */
export const getSharedScan = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const v = input as { id: string }
    if (!v.id || typeof v.id !== "string") {
      throw new Error("Missing share ID")
    }
    return { id: v.id }
  })
  .handler(async ({ data }) => {
    const record = await db.query.sharedScans.findFirst({
      where: eq(sharedScans.id, data.id),
    })

    if (!record) {
      throw new Error("Shared scan not found or has expired")
    }

    return {
      id: record.id,
      scanData: JSON.parse(record.scanData),
      sourceType: record.sourceType,
      sourceRef: record.sourceRef,
      createdAt: record.createdAt,
    }
  })
