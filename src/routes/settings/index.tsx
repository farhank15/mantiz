import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Shield,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { createToken, listTokens, revokeToken } from "../../server/tokens";
import PageHeader from "../../components/PageHeader";

export const Route = createFileRoute("/settings/")({ component: SettingsPage });

interface TokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isRevoked: boolean;
}

function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewToken, setShowNewToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreated, setShowCreated] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadTokens();
    } else if (!authLoading) {
      setIsLoading(false);
    }
  }, [isAuthenticated, authLoading]);

  const loadTokens = async () => {
    try {
      setIsLoading(true);
      const data = await listTokens();
      // Convert Date objects to strings for display
      const mapped: TokenItem[] = data.map((t: any) => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        createdAt:
          typeof t.createdAt === "string"
            ? t.createdAt
            : new Date(t.createdAt).toISOString(),
        lastUsedAt: t.lastUsedAt
          ? typeof t.lastUsedAt === "string"
            ? t.lastUsedAt
            : new Date(t.lastUsedAt).toISOString()
          : null,
        expiresAt: t.expiresAt
          ? typeof t.expiresAt === "string"
            ? t.expiresAt
            : new Date(t.expiresAt).toISOString()
          : null,
        isRevoked: t.isRevoked,
      }));
      setTokens(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTokenName.trim()) return;
    try {
      setError(null);
      const result = await createToken({ data: { name: newTokenName.trim() } });
      setCreatedToken(result.raw);
      setShowCreated(true);
      setNewTokenName("");
      setShowNewToken(false);
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    }
  };

  const handleRevoke = async (tokenId: string) => {
    try {
      setError(null);
      await revokeToken({ data: { tokenId } });
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token");
    }
  };

  const handleCopy = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeTokens = tokens.filter((t) => !t.isRevoked);
  const revokedTokens = tokens.filter((t) => t.isRevoked);

  if (authLoading) {
    return (
      <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
        <div className="mx-auto max-w-3xl pt-20 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-interactive/30 border-t-interactive" />
          <p className="mt-4 text-ink-muted">Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
        <div className="mx-auto pt-20 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-ink-subdued" />
          <h2 className="mb-2 text-xl font-bold text-ink">Sign in Required</h2>
          <p className="mb-6 text-sm text-ink-muted">
            You need to sign in with GitHub to manage API tokens.
          </p>
          <button onClick={login} className="btn btn-primary">
            <Key className="h-4 w-4" />
            Sign in with GitHub
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
      <div className="mx-auto">
        <PageHeader
          icon={Key}
          title="Settings"
          description="Manage your API tokens for CLI and CI/CD integrations."
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Settings" }]}
        />

        {error && (
          <div className="mb-6 rounded-xl border border-severity-critical/20 bg-severity-critical/5 p-4 text-sm text-severity-critical">
            {error}
          </div>
        )}

        <div className="mb-8 rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-bold text-ink">API Tokens</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Generate tokens for CLI, GitHub Actions, or CI/CD integrations.
              </p>
            </div>
            <button
              onClick={() => setShowNewToken(true)}
              className="btn btn-primary text-sm"
            >
              <Plus className="h-4 w-4" />
              New Token
            </button>
          </div>

          <AnimatePresence>
            {showNewToken && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border"
              >
                <div className="p-5">
                  <label className="mb-2 block text-sm font-medium text-ink">
                    Token Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      placeholder="e.g., GitHub Actions, My CLI"
                      className="field-input flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                    <button
                      onClick={handleCreate}
                      disabled={!newTokenName.trim()}
                      className="btn btn-primary"
                    >
                      Generate
                    </button>
                    <button
                      onClick={() => setShowNewToken(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCreated && createdToken && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border"
              >
                <div className="bg-success/5 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
                    <Check className="h-4 w-4" />
                    Token created successfully!
                  </div>
                  <p className="mb-2 text-xs text-ink-muted">
                    Copy this token now. You won't be able to see it again.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="field-input flex-1 font-mono text-sm">
                      <span
                        className={showCreated ? "" : "blur-sm select-none"}
                      >
                        {showCreated ? createdToken : "•".repeat(40)}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCreated(!showCreated)}
                      className="btn btn-secondary p-2"
                      title={showCreated ? "Hide" : "Show"}
                    >
                      {showCreated ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <button onClick={handleCopy} className="btn btn-primary">
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setShowCreated(false);
                      setCreatedToken(null);
                    }}
                    className="mt-3 text-xs text-ink-muted hover:text-ink transition"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading && (
            <div className="p-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-interactive/30 border-t-interactive" />
              <p className="mt-2 text-xs text-ink-muted">Loading tokens...</p>
            </div>
          )}

          {!isLoading && activeTokens.length === 0 && !showNewToken && (
            <div className="p-8 text-center">
              <Key className="mx-auto mb-3 h-10 w-10 text-ink-subdued" />
              <p className="text-sm text-ink-muted">
                No API tokens yet. Create one to integrate Mantiz with your
                CI/CD.
              </p>
            </div>
          )}

          {!isLoading && activeTokens.length > 0 && (
            <div className="divide-y divide-border">
              {activeTokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-interactive/10">
                      <Key className="h-4 w-4 text-interactive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {token.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <code className="text-[10px]">
                          {token.tokenPrefix}••••
                        </code>
                        <span>·</span>
                        <span>
                          Created{" "}
                          {new Date(token.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(token.id)}
                    className="btn btn-danger text-xs p-2"
                    title="Revoke token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-bold text-ink">Integration Guide</h2>
          </div>
          <div className="divide-y divide-border">
            <div className="px-5 py-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <ExternalLink className="h-4 w-4 text-interactive" />
                GitHub Actions
              </h3>
              <p className="mb-2 text-xs text-ink-muted">
                Add this step to your .github/workflows/mantiz.yml:
              </p>
              <pre className="code-block text-[11px]">{`- name: Mantiz Scan
  uses: farhank15/mantiz@main
  with:
    api-token: \${{ secrets.MANTIZ_API_TOKEN }}
    threshold: 70`}</pre>
              <p className="mt-2 text-xs text-ink-muted">
                Add your token as a repository secret named{" "}
                <code>MANTIZ_API_TOKEN</code>.
              </p>
            </div>
            <div className="px-5 py-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <ExternalLink className="h-4 w-4 text-interactive" />
                CLI
              </h3>
              <p className="mb-2 text-xs text-ink-muted">
                Install and run with your token:
              </p>
              <pre className="code-block text-[11px]">{`npm install -g @mantiz/cli
mantiz-scan --token your_token_here`}</pre>
            </div>
          </div>
        </div>

        {revokedTokens.length > 0 && (
          <div className="mt-8">
            <details className="group">
              <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink transition">
                Revoked tokens ({revokedTokens.length})
              </summary>
              <div className="mt-2 space-y-2">
                {revokedTokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-2 opacity-50"
                  >
                    <AlertTriangle className="h-4 w-4 text-severity-medium" />
                    <span className="text-sm text-ink-muted line-through">
                      {token.name}
                    </span>
                    <code className="text-[10px] text-ink-subdued">
                      {token.tokenPrefix}••••
                    </code>
                    <span className="text-xs text-ink-subdued">Revoked</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
