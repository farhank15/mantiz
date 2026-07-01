/**
 * /api/mock-login — E2E Testing Auth Bypass
 *
 * This route injects a hardcoded valid session cookie and redirects
 * the browser to /pr-scan, allowing TestSprite robots to test
 * authenticated features without going through GitHub OAuth.
 *
 * Uses TanStack Start's createServerFn + loader pattern (same as auth.ts)
 * so it runs on the server and can set HttpOnly cookies correctly.
 */

import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

// Hardcoded valid session cookie value — for E2E testing only
const MOCK_SESSION =
  'eyJ1c2VySWQiOjE0NDUwMDU4MCwiZGJVc2VySWQiOiJmN2ZjN2JlMC1mOWFmLTQ1NDMtYjIwNy02MjNhNDUxMjVjYTgiLCJsb2dpbiI6ImZhcmhhbmsxNSIsImF2YXRhciI6Imh0dHBzOi8vYXZhdGFycy5naXRodWJ1c2VyY29udGVudC5jb20vdS8xNDQ1MDA1ODA/dj00IiwibmFtZSI6IkFobWFkIGZhcmhhbiBLIiwidG9rZW4iOiJnaG9fYjBmMW5hVEZMVm45OWFTTVo3QklFbXpNNjgyVW43MUZGR2l0In0=.86916d3d2da43bc0e12248424817f31eacc7f65358b63f47ad1bf1c1199a23bc'

const injectMockSession = createServerFn({ method: 'GET' })
  .validator((input: unknown) => input as { secret?: string })
  .handler(async ({ data }) => {
    const bypassSecret = process.env.TEST_BYPASS_SECRET || "mantiz_e2e_bypass_2026";
    if (!data.secret || data.secret !== bypassSecret) {
      throw redirect({ to: '/login?error=UnauthorizedMock' });
    }

    setResponseHeader(
      'Set-Cookie',
      `mantiz_session=${MOCK_SESSION}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`,
    )
    throw redirect({ to: '/pr-scan' })
  })

export const Route = createFileRoute('/api/mock-login')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      secret: (search?.secret || search?.['secret']) as string | undefined,
    }
  },
  component: () => null,
  loader: ({ search }) => injectMockSession({ data: { secret: search?.secret } }),
})
