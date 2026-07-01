import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Github, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { handleCallback } from '../../../server/auth'

export const Route = createFileRoute('/auth/github/callback')({
  component: CallbackPage,
})

function CallbackPage() {
  const search = useSearch({ from: '/auth/github/callback' }) as {
    code?: string
    state?: string
    error?: string
  }
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (search.error) {
      setStatus('error')
      setErrorMsg(search.error === 'access_denied' ? 'You denied the authorization request.' : search.error)
      return
    }

    if (!search.code || !search.state) {
      setStatus('error')
      setErrorMsg('Missing code or state parameter.')
      return
    }

    let timer: ReturnType<typeof setTimeout>

    const exchangeCode = async () => {
      try {
        const session = await handleCallback({ data: { code: search.code!, state: search.state! } })
        // Store session in sessionStorage as fallback
        sessionStorage.setItem('mantiz_auth', JSON.stringify(session))
        setStatus('success')
        timer = setTimeout(() => {
          window.location.href = '/'
        }, 1000)
      } catch (err) {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please try again.')
      }
    }

    exchangeCode()

    return () => clearTimeout(timer)
  }, [search.code, search.state, search.error, navigate])

  return (
    <main className="page-wrap flex min-h-[70vh] items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-xl border border-border bg-surface-1 p-8 text-center"
      >
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-interactive/10">
          <Github className="h-8 w-8 text-interactive" />
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-interactive" />
            <h1 className="mb-2 text-xl font-bold text-ink">Authenticating...</h1>
            <p className="text-sm text-ink-muted">
              Connecting your GitHub account to Mantiz.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
            <h1 className="mb-2 text-xl font-bold text-ink">Authenticated!</h1>
            <p className="text-sm text-ink-muted">
              You're now logged in with GitHub. Redirecting...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-severity-critical" />
            <h1 className="mb-2 text-xl font-bold text-ink">Authentication Failed</h1>
            <p className="mb-4 text-sm text-ink-muted">{errorMsg}</p>
            <button
              onClick={() => navigate({ to: '/' })}
              className="btn btn-secondary"
            >
              Back to Home
            </button>
          </>
        )}
      </motion.div>
    </main>
  )
}
