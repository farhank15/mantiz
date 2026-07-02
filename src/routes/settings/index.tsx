import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Sliders,
  Brain,
  Webhook,
  Gauge,
  Loader2,
  Zap,
  Settings,
  CheckCircle2,
  History,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { createToken, listTokens, revokeToken } from "../../server/tokens";
import { getUserSettings, saveUserSettings } from "../../server/settings";
import { testWebhook, getWebhookEvents } from "../../server/webhook";
import PageHeader from "../../components/PageHeader";

export const Route = createFileRoute("/settings/")({ component: SettingsPage });

interface ScanSettings {
  threshold: number;
  aiEnabled: boolean;
  minScore: number;
  webhookUrl: string | null;
  webhookEnabled: boolean;
}

function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const queryClient = useQueryClient();
  const [showNewToken, setShowNewToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreated, setShowCreated] = useState(false);

  // ── TanStack Query: Tokens ────────────────────────────────
  const {
    data: tokens = [],
    isLoading: tokensLoading,
  } = useQuery({
    queryKey: ["tokens"],
    queryFn: listTokens,
    enabled: isAuthenticated,
    staleTime: 2 * 60_000, // 2min — tokens rarely change
    select: (data) =>
      data.map((t: any) => ({
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
      })),
  });

  // ── TanStack Query: Settings ──────────────────────────────
  const {
    data: serverSettings,
    isLoading: settingsLoading,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: getUserSettings,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000, // 5min — settings rarely change
  });

  const [settings, setSettings] = useState<ScanSettings>({
    threshold: 70,
    aiEnabled: false,
    minScore: 0,
    webhookUrl: null,
    webhookEnabled: false,
  });

  // Sync server settings → local state when loaded
  useEffect(() => {
    if (serverSettings) setSettings(serverSettings);
  }, [serverSettings]);

  // ── TanStack Query: Webhook History ───────────────────────
  const [showWebhookHistory, setShowWebhookHistory] = useState(false);
  const {
    data: webhookHistory = [],
    isFetching: webhookHistoryLoading,
  } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: () => getWebhookEvents({ data: { limit: 10 } }),
    enabled: isAuthenticated && showWebhookHistory,
    staleTime: 30_000, // 30s — webhook events can change
  });

  // ── Mutations ─────────────────────────────────────────────
  const [settingsSaved, setSettingsSaved] = useState(false);

  const saveSettingsMutation = useMutation({
    mutationFn: () => saveUserSettings({ data: settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    },
    onError: (err: Error) => setError(err.message),
  });

  const createTokenMutation = useMutation({
    mutationFn: () => createToken({ data: { name: newTokenName.trim() } }),
    onSuccess: (result) => {
      setCreatedToken(result.raw);
      setShowCreated(true);
      setNewTokenName("");
      setShowNewToken(false);
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeToken({ data: { tokenId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tokens"] }),
    onError: (err: Error) => setError(err.message),
  });

  const testWebhookMutation = useMutation({
    mutationFn: () => testWebhook({ data: { url: settings.webhookUrl! } }),
  });

  // Watch for test webhook result
  useEffect(() => {
    if (testWebhookMutation.data) {
      setWebhookTestResult({
        ok: testWebhookMutation.data.ok,
        message: testWebhookMutation.data.ok
          ? `Webhook responded with ${testWebhookMutation.data.status}`
          : `Failed: ${testWebhookMutation.data.error || "No response"}`,
      });
    }
    if (testWebhookMutation.isError) {
      setWebhookTestResult({
        ok: false,
        message: `Error: ${(testWebhookMutation.error as Error).message}`,
      });
    }
  }, [testWebhookMutation.data, testWebhookMutation.isError]);

  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-interactive" />
          <p className="mt-4 text-ink-muted">Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="page-wrap px-4 pb-16 pt-8 sm:pt-10">
        <div className="mx-auto max-w-3xl pt-20 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-ink-subdued" />
          <h2 className="mb-2 text-xl font-bold text-ink">Sign in Required</h2>
          <p className="mb-6 text-sm text-ink-muted">
            You need to sign in with GitHub to manage settings.
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
      <div className="mx-auto max-w-3xl">
        <PageHeader
          icon={Settings}
          title="Settings"
          description="Configure your Mantiz scan preferences, API tokens, and integrations."
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Settings" }]}
        />

        {error && (
          <div className="mb-6 rounded-xl border border-severity-critical/20 bg-severity-critical/5 p-4 text-sm text-severity-critical">
            {error}
          </div>
        )}

        {/* ═══════════════ Scan Settings ═══════════════ */}
        <div className="mb-8 rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Sliders className="h-5 w-5 text-interactive" />
            <div>
              <h2 className="font-bold text-ink">Scan Settings</h2>
              <p className="text-xs text-ink-muted">
                These settings apply to all scans via your API tokens.
              </p>
            </div>
          </div>

          {settingsLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-interactive" />
              <p className="mt-2 text-xs text-ink-muted">Loading settings...</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Threshold */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-interactive" />
                    <div>
                      <label className="text-sm font-medium text-ink">
                        Trust Score Threshold
                      </label>
                      <p className="text-xs text-ink-muted">
                        Scores below this threshold will fail the check
                      </p>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${settings.threshold >= 80 ? "text-success" : settings.threshold >= 50 ? "text-severity-medium" : "text-severity-critical"}`}>
                    {settings.threshold}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.threshold}
                  onChange={(e) => setSettings({ ...settings, threshold: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-2 accent-interactive"
                />
                <div className="flex justify-between text-[10px] text-ink-subdued mt-1">
                  <span>0 (Lenient)</span>
                  <span>50</span>
                  <span>100 (Strict)</span>
                </div>
              </div>

              {/* Min Score */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-interactive" />
                    <div>
                      <label className="text-sm font-medium text-ink">
                        Minimum Trust Score
                      </label>
                      <p className="text-xs text-ink-muted">
                        Hard floor — result will never go below this score
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-ink">
                    {settings.minScore}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={settings.minScore}
                  onChange={(e) => setSettings({ ...settings, minScore: parseInt(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-2 accent-interactive"
                />
                <div className="flex justify-between text-[10px] text-ink-subdued mt-1">
                  <span>0 (No floor)</span>
                  <span>25</span>
                  <span>50 (Max floor)</span>
                </div>
              </div>

              {/* AI Detection Toggle */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-interactive" />
                    <div>
                      <label className="text-sm font-medium text-ink">
                        AI-Powered Detection
                      </label>
                      <p className="text-xs text-ink-muted">
                        Uses LLM (Fireworks/Groq) for semantic cheating analysis
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, aiEnabled: !settings.aiEnabled })}
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      settings.aiEnabled ? "bg-interactive" : "bg-surface-2"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        settings.aiEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Webhook */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-interactive" />
                    <div>
                      <label className="text-sm font-medium text-ink">
                        Webhook URL
                      </label>
                      <p className="text-xs text-ink-muted">
                        Receive scan results as POST requests (retry 3x, HMAC signed)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, webhookEnabled: !settings.webhookEnabled })}
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      settings.webhookEnabled ? "bg-interactive" : "bg-surface-2"
                    }`}
                    disabled={!settings.webhookUrl}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        settings.webhookEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={settings.webhookUrl || ""}
                    onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value || null })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="field-input flex-1"
                  />
                  <button
                    onClick={() => testWebhookMutation.mutate()}
                    disabled={!settings.webhookUrl || testWebhookMutation.isPending}
                    className="btn btn-secondary text-xs"
                  >
                    {testWebhookMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Test"
                    )}
                  </button>
                </div>
                {webhookTestResult && (
                  <p className={`mt-2 text-xs ${webhookTestResult.ok ? "text-success" : "text-severity-critical"}`}>
                    {webhookTestResult.message}
                  </p>
                )}
                <p className="mt-2 text-[10px] text-ink-subdued">
                  Payload signed with <code className="text-[9px]">X-Mantiz-Signature</code> (HMAC-SHA256). Retries 3x with backoff.
                </p>

                {/* Webhook History Toggle */}
                <button
                  onClick={() => setShowWebhookHistory(!showWebhookHistory)}
                  className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition"
                >
                  <History className="h-3 w-3" />
                  {showWebhookHistory ? "Hide" : "Show"} delivery history
                </button>

                <AnimatePresence>
                  {showWebhookHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5">
                        {webhookHistoryLoading ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-ink-subdued">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </div>
                        ) : webhookHistory.length === 0 ? (
                          <p className="py-2 text-xs text-ink-subdued">No webhook deliveries yet.</p>
                        ) : (
                          webhookHistory.map((ev: any) => (
                            <div key={ev.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                              {ev.status === 'delivered' ? (
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 shrink-0 text-severity-critical" />
                              )}
                              <span className="text-ink-muted">
                                {ev.status === 'delivered' ? `Delivered (${ev.responseCode})` : 'Failed'}
                              </span>
                              <span className="ml-auto text-ink-subdued">
                                {new Date(ev.createdAt).toLocaleString()}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Save button */}
              <div className="px-5 py-4 flex justify-end">
                <button
                  onClick={() => saveSettingsMutation.mutate()}
                  disabled={saveSettingsMutation.isPending}
                  className="btn btn-primary"
                >
                  {saveSettingsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : settingsSaved ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {saveSettingsMutation.isPending ? "Saving..." : settingsSaved ? "Saved!" : "Save Settings"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════ API Tokens ═══════════════ */}
        <div className="mb-8 rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-interactive" />
              <div>
                <h2 className="font-bold text-ink">API Tokens</h2>
                <p className="text-xs text-ink-muted">
                  Tokens for CLI, GitHub Actions, and CI/CD integrations
                </p>
              </div>
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
                      onKeyDown={(e) => e.key === "Enter" && createTokenMutation.mutate()}
                    />
                    <button
                      onClick={() => createTokenMutation.mutate()}
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
                      <span className={showCreated ? "" : "blur-sm select-none"}>
                        {showCreated ? createdToken : "•".repeat(40)}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCreated(!showCreated)}
                      className="btn btn-secondary p-2"
                      title={showCreated ? "Hide" : "Show"}
                    >
                      {showCreated ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button onClick={handleCopy} className="btn btn-primary">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <button
                    onClick={() => { setShowCreated(false); setCreatedToken(null); }}
                    className="mt-3 text-xs text-ink-muted hover:text-ink transition"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {tokensLoading && (
            <div className="p-8 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-interactive" />
              <p className="mt-2 text-xs text-ink-muted">Loading tokens...</p>
            </div>
          )}

          {!tokensLoading && activeTokens.length === 0 && !showNewToken && (
            <div className="p-8 text-center">
              <Key className="mx-auto mb-3 h-10 w-10 text-ink-subdued" />
              <p className="text-sm text-ink-muted">No API tokens yet. Create one to integrate Mantiz with your CI/CD.</p>
            </div>
          )}

          {!tokensLoading && activeTokens.length > 0 && (
            <div className="divide-y divide-border">
              {activeTokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-interactive/10">
                      <Key className="h-4 w-4 text-interactive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{token.name}</p>
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <code className="text-[10px]">{token.tokenPrefix}••••</code>
                        <span>·</span>
                        <span>Created {new Date(token.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => revokeTokenMutation.mutate(token.id)} className="btn btn-danger text-xs p-2" title="Revoke token">
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
              <p className="mb-2 text-xs text-ink-muted">Add this step to your workflow:</p>
              <pre className="code-block text-[11px]">{`- name: Mantiz Scan
  uses: farhank15/mantiz@main
  with:
    api-token: \${{ secrets.MANTIZ_API_TOKEN }}
    threshold: ${settings.threshold}
    use-ai: ${settings.aiEnabled}`}</pre>
            </div>
            <div className="px-5 py-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <ExternalLink className="h-4 w-4 text-interactive" />
                CLI
              </h3>
              <p className="mb-2 text-xs text-ink-muted">Run with your token:</p>
              <pre className="code-block text-[11px]">{`npx @farhank15/mantiz-cli --token your_token_here --save`}</pre>
              <p className="mt-2 text-xs text-ink-muted">Use <code>--save</code> to persist results to your history.</p>
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
                  <div key={token.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-2 opacity-50">
                    <AlertTriangle className="h-4 w-4 text-severity-medium" />
                    <span className="text-sm text-ink-muted line-through">{token.name}</span>
                    <code className="text-[10px] text-ink-subdued">{token.tokenPrefix}••••</code>
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
