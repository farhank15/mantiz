import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/mock-login')({
  component: () => null,
})

export async function GET({ request }: { request: Request }) {
  const cookieValue =
    'eyJ1c2VySWQiOjE0NDUwMDU4MCwiZGJVc2VySWQiOiJmN2ZjN2JlMC1mOWFmLTQ1NDMtYjIwNy02MjNhNDUxMjVjYTgiLCJsb2dpbiI6ImZhcmhhbmsxNSIsImF2YXRhciI6Imh0dHBzOi8vYXZhdGFycy5naXRodWJ1c2VyY29udGVudC5jb20vdS8xNDQ1MDA1ODA/dj00IiwibmFtZSI6IkFobWFkIGZhcmhhbiBLIiwidG9rZW4iOiJnaG9fYjBmMW5hVEZMVm45OWFTTVo3QklFbXpNNjgyVW43MUZGR2l0In0=.86916d3d2da43bc0e12248424817f31eacc7f65358b63f47ad1bf1c1199a23bc'

  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/pr-scan',
      'Set-Cookie': `mantiz_session=${cookieValue}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`,
    },
  })
}
