<p align="center">
  <img src="public/mantiz.png" alt="Mantiz Logo" width="160" height="160" style="border-radius: 24px;" />
</p>

<h3 align="center">AI Coding Agent Lie Detector</h3>

<p align="center">
  <em>Your agent cheats. Mantiz doesn't.</em>
  <br />
  Scans diffs and PRs for the patterns agents use to fake a passing test suite.
</p>

<p align="center">
  <a href="https://mantiz-wine.vercel.app" target="_blank"><img src="https://img.shields.io/badge/Live%20App-mantiz--wine.vercel.app-58A6FF?style=flat-square&logo=vercel&logoColor=white" alt="Live App"></a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-3FB950?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/farhank15/mantiz/actions">
    <img src="https://img.shields.io/badge/CI-Mantiz%20Scan-2ea44f?style=flat-square&logo=github&label=Mantiz%20CI" alt="Mantiz CI">
  </a>
  <a href="https://github.com/farhank15/mantiz/actions">
    <img src="https://img.shields.io/badge/CI-Detector%20Gate-FF6B35?style=flat-square&logo=github&label=Detector%20Gate" alt="Detector Gate">
  </a>
  <br />
  <img src="https://img.shields.io/badge/Stack-TanStack_Start-FF4154?style=flat-square&logo=react&logoColor=white" alt="TanStack">
  <img src="https://img.shields.io/badge/Database-Neon--Postgres-00E59B?style=flat-square&logo=postgresql&logoColor=white" alt="Neon">
  <img src="https://img.shields.io/badge/AI-Powered-FF6B35?style=flat-square" alt="AI">
  <img src="https://img.shields.io/badge/GitHub%20App-Auto%20Scan-6e40ff?style=flat-square&logo=github" alt="GitHub App">
  <img src="https://img.shields.io/badge/RAG-Qdrant-00B4D8?style=flat-square" alt="Qdrant RAG">
</p>

---

## 🔍 What is Mantiz?

**Mantiz** is an AI-powered lie detector for code — specifically designed to catch AI coding agents when they try to cheat their test suites.

When an AI agent writes code, it can subtly **disable assertions, mock failing APIs, skip test suites, hallucinate matchers, or tamper with expected values** to make tests pass. Mantiz scans every line of a diff through **11 detection patterns** (10 static + AI-assisted) and produces a **Trust Score (0–100)** with ranked findings.

> **Mantiz is the honesty gate for AI-generated code.** It ensures that "passing" tests actually pass because the code works, not because the agent manipulated them.

---

## ✨ Features

### 🔬 11 Detection Patterns (10 Static + AI-Assisted)

| Pattern | Severity | What It Catches |
|---------|----------|----------------|
| **Disabled Assertion** | 🔴 High | Tests commented out, wrapped in `if(false)`, or marked `.skip()` / `test.skip()` |
| **Assertion Tampering** | 🔴 High | Expected values changed to match broken output instead of fixing the bug |
| **Mock-to-Avoid-Failure** | 🟠 Medium | New mocks introduced without real-path coverage to bypass real errors |
| **Claim-Diff Mismatch** | 🟡 Medium | Commit message says "fix tests" but diff only touches source — no test updated |
| **Silent Catch-and-Pass** | 🟠 Medium | Empty catch blocks that swallow real errors and let the agent declare success |
| **Hallucinated Assertion** | 🔴 High | Non-existent Jest/Vitest matchers hallucinated by AI agents (e.g. `.toExist()`) |
| **AST Analyzer (Babel)** | 🔴 High | Parses JS/TS code with `@babel/parser` — detects trivial function bodies, async gutting, conditional wrapping |
| **Tree-sitter AST** | 🔴 High | Multi-language AST analysis via WASM parsers — Python, Go, Java, Ruby, Rust, PHP |
| **Historical Behavioral** | 🟡 Medium | Tracks author patterns over time — style changes, odd hours, score volatility |
| **Mutation Susceptibility** | 🟡 Medium | Detects fragile tests with low assertion density that can be easily mutated |
| **AI-Assisted Detection** | 🟡 Varies | LLM-powered analysis — detects test weakening, assertion removal, semantic bypass, coverage reduction |

### 🌐 Multi-Language Detection

All detectors support **7 languages** via `language-registry.ts`:

| Detector | JS/TS | Python | Go | Java | Ruby | Rust | PHP |
|:---------|:-----:|:------:|:--:|:----:|:----:|:----:|:---:|
| **Disabled Assertion** | `.skip()` | `@pytest.mark.skip` | `t.Skip()` | `@Disabled` | `xit`/`pending` | `#[ignore]` | `markTestSkipped` |
| **Assertion Tampering** | ✅ | `assert` | `assert.Equal` | `assertEquals` | — | — | — |
| **Mock-to-Avoid** | ✅ | `@patch` | `.On().Return()` | `Mockito.mock` | `allow().to receive` | — | `createMock` |
| **Silent Catch** | `catch{}` | `except: pass` | `if err != nil` | `catch(E e){}` | `rescue; end` | — | `catch` |
| **Heal Engine** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 🤖 GitHub App — Automatic PR Scanning

Install the **Mantiz GitHub App** on your repositories and every new PR gets automatically scanned:

- **Webhook events:** `pull_request.opened`, `pull_request.synchronize`
- **Check runs:** Creates GitHub Check Run with in-progress → completed status
- **Inline comments:** Posts findings as PR review comments with line-level accuracy
- **Suggested changes:** Auto-fix patches rendered as GitHub ` ```suggestion ` — one click to apply
- **Dashboard sync:** Results saved to your Mantiz dashboard (requires login with same GitHub account)

**Setup:**
1. Install the Mantiz GitHub App from [GitHub Apps](https://github.com/apps/mantiz)
2. Grant permissions: Pull requests (Read & Write), Checks (Read & Write), Contents (Read)
3. Open a PR — Mantiz scans automatically and posts results inline

### 🧠 RAG Codebase Context (Qdrant)

Mantiz indexes your repository into **Qdrant vector database** for smarter AI detection:

- **On install:** Fetches repo file tree via GitHub API, chunks source files via Tree-sitter, generates embeddings via Fireworks AI, stores in Qdrant
- **On PR scan:** Extracts method names from diff, queries Qdrant for definitions, injects as context into AI prompt
- **No false positives on custom matchers:** AI knows which APIs exist in your codebase

**Stack:** `Qdrant Cloud` (vector DB) + `Fireworks AI nomic-embed-text-v1.5` (embeddings, $0.008/1M tokens) + `Tree-sitter WASM` (AST chunking, 8 languages)

### 🩹 Self-Healing Engine

Mantiz doesn't just detect cheating — it can **auto-fix it**:

- **Template-based fixes:** Disabled assertions → re-enable, silent catches → add logging, hallucinated matchers → replace with valid assertions
- **AI-driven fixes:** When template matching fails, `generatePatchesAsync()` calls Fireworks/Groq to generate smarter fixes
- **Multi-language healing:** Supports all 7 languages — Python `@pytest.mark.skip` → `@pytest.mark`, Go `t.Skip()` → remove, Java `@Disabled` → remove, etc.
- **GitHub ` ```suggestion `:** Patches posted as click-to-apply suggestions in PR comments

```bash
npx mantiz scan diff.diff --fix           # Auto-apply safe fixes
npx mantiz scan diff.diff --fix=interactive # Review each fix before applying
```

### 🎯 Trust Score

Per-detector calibrated scoring — each detector has empirically-determined weights based on precision from 423 labeled PRs (16 DECEPTIVE, 407 LEGIT):

| Detector | High | Medium | Low | Precision |
|:---------|:----:|:------:|:---:|:---------:|
| D10 MutationSusceptibility | 8 | 3 | 0 | 43.3% |
| D3 MockToAvoid | 5 | 2 | 1 | 35.0% |
| D1 DisabledAssertion | 3 | 2 | 0 | 37.5% |
| D6 HallucinatedAssertion | 3 | 2 | 0 | 50.0% |
| D2 AssertionTampering | 2 | 1 | 1 | 30.0% |
| D5 SilentCatch | 1 | 1 | 0 | 7.7% |
| D4 ClaimDiffMismatch | 0 | 0 | 0 | 0% |
| D8 AIAssisted | 0 | 0 | 0 | 0% |
| D9 Historical | 0 | 0 | 0 | 0% |
| D11 AgentInstruction | 0 | 0 | 0 | 0% |

**File importance multiplier:** `core/test/source = 1.0`, `config = 0.5`, `docs = 0.3`, `artifact = 0.05`.  
Score = `max(30, 100 - min(penalty, 85))`. Threshold: **default 70**, configurable per-user.

### ⚙️ Per-User Settings

Configure scan behavior from the [Settings](https://mantiz-wine.vercel.app/settings) page:

| Setting | Default | Description |
|---------|---------|-------------|
| **Threshold** | 70 | Trust score threshold (0-100). Scores below this fail the check. |
| **AI Detection** | Off | Enable LLM-powered semantic analysis |
| **Min Score** | 0 | Hard floor — result never goes below this score |
| **Webhook URL** | — | Receive scan results as POST requests (HMAC signed, 3x retry) |

Settings apply to all scans made with your API tokens (CLI, GitHub Actions).

### 🔗 Webhook System

Receive scan results in real-time via webhook. Payload includes full findings, signed with HMAC-SHA256.

**Features:**
- 3 retry attempts with exponential backoff (1s → 4s → 15s)
- `X-Mantiz-Signature` header for payload verification
- Event types: `scan.completed` (pass) / `scan.failed` (fail)
- Delivery history visible in Settings page
- Works with Slack, Discord, Telegram, or custom endpoints

### 🔐 GitHub OAuth + Session Management

- Sign in with GitHub to scan pull requests
- Signed HTTP-only cookies with HMAC-SHA256
- Rate limiting (3 tiers: anonymous, session, token)
- Scan history persisted per user in Neon Postgres

### 📊 Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — hero, features, detector patterns |
| `/scan` | Paste & scan a raw git diff |
| `/pr-scan` | Scan a GitHub PR by URL (requires auth) |
| `/login` | GitHub OAuth sign-in |
| `/history` | Scan history with detailed findings modal + user verdict tagging |
| `/settings` | Scan settings + API token management + webhook config |
| `/benchmark` | Interactive benchmark — 42 fixtures across 4 datasets |

### 🔗 Share Results

Every scan generates a public shareable link (`/share/:id`) — no authentication required.

---

## 🚀 Quick Start

### 1. Visit the Live App

**[🔗 mantiz-wine.vercel.app](https://mantiz-wine.vercel.app)**

Paste any GitHub-style diff and get instant results. No signup needed for manual scans.

### 2. Run Locally

```bash
# Clone the repo
git clone https://github.com/farhank15/mantiz.git
cd mantiz

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
```

Fill `.env` with:

```env
# Database (Neon Postgres — required for auth & history)
DATABASE_URL='postgresql://...'

# GitHub OAuth (required for PR scanning & login)
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# Session secret (required — at least 32 characters)
SESSION_SECRET=your_random_secret_at_least_32_chars

# AI Detection (optional — D8: find new cheating patterns)
AI_DETECTION_ENABLED=true
GROQ_API_KEY=gsk_your_groq_api_key
# or FIREWORKS_API_KEY=fw_your_fireworks_key

# AI Judge (optional — reviews static findings, filters false positives)
AI_JUDGE_ENABLED=true

# Qdrant Vector DB (optional — RAG codebase context for AI detection)
QDRANT_URL=https://xxx.cloud.qdrant.io
QDRANT_API_KEY=yzx_...

# Embedding Provider (optional — for Qdrant indexing)
FIREWORKS_API_KEY=fw_...  # Priority: Fireworks > OpenAI
# or OPENAI_API_KEY=sk-...

# GitHub App (optional — automatic PR scanning bot)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Webhook secret (optional — for HMAC signing webhook payloads)
WEBHOOK_SECRET=your_random_secret_at_least_32_chars

# App URL (optional — defaults to http://localhost:3030)
APP_URL=http://localhost:3030
```

```bash
# Push database schema
npx drizzle-kit push

# Start dev server
pnpm run dev
```

### 3. Build for Production

```bash
pnpm run build
pnpm run preview
```

---

## 🧪 How to Use

### 🧑‍💻 Manual Scan (No Auth Needed)

1. Go to [/scan](https://mantiz-wine.vercel.app/scan)
2. Paste a GitHub-style diff
3. Click **Scan Diff**
4. Review findings + Trust Score

### 🏭 PR Scan (Requires GitHub Auth)

1. Go to [/pr-scan](https://mantiz-wine.vercel.app/pr-scan)
2. Sign in with GitHub
3. Paste a PR URL: `https://github.com/owner/repo/pull/123`
4. Mantiz fetches the diff, runs 11 detectors, and returns findings

### 🤖 GitHub App (Automatic PR Scanning)

Install the Mantiz GitHub App on your repository. Every new PR gets automatically scanned with:
- Check run status (pass/fail)
- Inline review comments with findings
- One-click suggested changes for auto-fix
- Results saved to your dashboard history

### 🔗 GitHub Actions (Reusable Action)

```yaml
- name: Run Mantiz Scan
  uses: farhank15/mantiz@main
  with:
    api-token: ${{ secrets.MANTIZ_API_TOKEN }}
    threshold: 70
    use-ai: true
    json-output: true
```

Generate your API token from [Settings](https://mantiz-wine.vercel.app/settings).

### 🔗 CLI Integration

```bash
# Local scan (no cloud, no API key)
npx mantiz-cli

# With AI detection
npx mantiz-cli --ai

# JSON output for CI
npx mantiz-cli --json

# Auto-fix detected issues
npx mantiz-cli --fix

# Cloud scan with history persistence
npx mantiz-cli --token mtz_abc123 --save
```

---

## 📊 Benchmark Results

Mantiz includes a built-in benchmark suite with **42 fixtures across 4 datasets**:

| Dataset | Description | Fixtures | Source |
|:---:|---|:---:|:------|
| **A** — "The Honest Code" | Proper diff + valid test updates | 4 | 🔴 **Real PRs** (vitest-dev/vitest) |
| **B** — "The Lazy/Cheating AI" | `.skip()`, `if(false)`, commented assertions | 11 | 📜 **Research-based** (DebugML/UC Berkeley) |
| **C** — "The Smart Evasion AI" | Assertion tampering, mock + empty catch | 4 | 📜 **Research-based** (DebugML) |
| **FP** — "False Positive" | Legitimate code patterns | 23 | 🟡 **Mixed** (2 real vitest PRs + 21 documented) |

Visit the [**/benchmark**](https://mantiz-wine.vercel.app/benchmark) dashboard to see live accuracy results.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [TanStack Start](https://tanstack.com/start) (React 19) |
| **Routing** | [TanStack Router](https://tanstack.com/router) (file-based, auto code-split) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) + Magic UI |
| **Animation** | [Framer Motion](https://framermotion.framer.website) |
| **Database** | [Neon Postgres](https://neon.tech) (serverless) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team) |
| **Auth** | GitHub OAuth + HMAC-signed session cookies |
| **Vector DB** | [Qdrant Cloud](https://qdrant.io) (HNSW + scalar quantization) |
| **Embeddings** | Fireworks AI `nomic-embed-text-v1.5` |
| **LLM** | Fireworks AI + Groq (fallback) |
| **GitHub App** | [Octokit](https://github.com/octokit) (`App` class + installation tokens) |
| **AST Parsing** | Tree-sitter WASM (8 languages) + `@babel/parser` |
| **Rate Limiting** | In-memory sliding window (3 tiers) |
| **Bundler** | [Vite 8](https://vite.dev) + TanStack Router Plugin |
| **Deploy** | [Vercel](https://vercel.com) |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and coding standards.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <a href="https://mantiz-wine.vercel.app">
    <img src="https://img.shields.io/badge/Try_Mantiz_Now-58A6FF?style=for-the-badge" alt="Try Mantiz">
  </a>
  <a href="https://github.com/farhank15/mantiz">
    <img src="https://img.shields.io/badge/GitHub-333?style=for-the-badge&logo=github" alt="GitHub">
  </a>
</p>
