import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Github, Shield } from 'lucide-react'
import RetroGrid from '#/components/magicui/retro-grid'
import Particles from '#/components/magicui/particles'
import { useAuth } from '../../lib/auth-context'
import PageHeader from '../../components/PageHeader'

export const Route = createFileRoute('/login/')({ component: LoginPage })

function LoginPage() {
  const { login } = useAuth()

  return (
    <main className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4">
      <RetroGrid className="z-0" glow={false} />
      <Particles
        className="absolute inset-0 z-1"
        quantity={40}
        staticity={30}
        color="#58A6FF"
        size={0.4}
      />

      <div className="relative z-10 w-full max-w-md">
        <PageHeader
          icon={Shield}
          title="Welcome to Mantiz"
          description="Sign in with GitHub to scan PR diffs and detect AI cheating patterns."
          breadcrumbs={[
            { label: 'Home', to: '/' },
            { label: 'Sign In' },
          ]}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-xl border border-border bg-surface-1 p-8 text-center"
        >
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-interactive/10">
            <Shield className="h-8 w-8 text-interactive" />
          </div>

          <h1 className="mb-2 text-2xl font-bold text-ink">Welcome to Mantiz</h1>
          <p className="mb-8 text-sm text-ink-muted">
            Sign in with GitHub to scan PR diffs and detect AI cheating patterns.
          </p>

          <button
            onClick={login}
            className="btn btn-primary mx-auto flex w-full items-center justify-center gap-2"
          >
            <Github className="h-5 w-5" />
            Continue with GitHub
          </button>

          <p className="mt-4 text-xs text-ink-subdued">
            We only request access to public repositories.
            <br />
            Your token is stored securely and never shared.
          </p>
        </motion.div>
      </div>
    </main>
  )
}
