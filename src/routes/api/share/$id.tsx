/**
 * Mantiz Public API — /api/share/:id
 *
 * Returns a shared scan result as raw JSON.
 * Scrapable by curl, Python, or any HTTP client.
 * No authentication required (public endpoint).
 *
 * GET /api/share/KgdPa5nF  →  { id, scanData, sourceType, sourceRef, createdAt }
 */

import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../../lib/db'
import { sharedScans } from '../../../schemas/index'
import { eq } from 'drizzle-orm'

const ALLOWED_ORIGINS = [
  'https://mantiz-wine.vercel.app',
  'http://localhost:3030',
  'http://localhost:3000',
]

function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('origin') || ''
  return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://mantiz-wine.vercel.app'
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export const Route = createFileRoute('/api/share/$id')({
  component: () => null,
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = getCorsOrigin(request)
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin),
        })
      },
      GET: async ({ request }) => {
        const origin = getCorsOrigin(request)
        const baseCors = corsHeaders(origin)

        try {
          // Extract ID from URL path: /api/share/:id
          // Filter empty segments to handle trailing slashes
          const segments = new URL(request.url).pathname.split('/').filter(Boolean)
          const segmentParent = segments.at(-2)
          const id = segments.at(-1)

          if (!id || segmentParent !== 'share') {
            return Response.json(
              { error: 'Invalid share URL. Expected: /api/share/:id' },
              { status: 400, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }

          const record = await db.query.sharedScans.findFirst({
            where: eq(sharedScans.id, id),
          })

          if (!record) {
            return Response.json(
              { error: 'Shared scan not found or has expired' },
              { status: 404, headers: { ...baseCors, 'Content-Type': 'application/json' } },
            )
          }

          return Response.json(
            {
              id: record.id,
              scanData: JSON.parse(record.scanData),
              sourceType: record.sourceType,
              sourceRef: record.sourceRef,
              createdAt: record.createdAt,
            },
            {
              status: 200,
              headers: {
                ...baseCors,
                'Content-Type': 'application/json',
              },
            },
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Internal server error'
          return Response.json(
            { error: message },
            {
              status: 500,
              headers: { ...baseCors, 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
