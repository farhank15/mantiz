<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Mantiz-EE3124?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgdmlld0JveD0iMCAwIDI0IDI0IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEuNSI+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBkPSJNOS44MTMgMTUuOTA0TDkgMTguNzVsLS44MTMtMi44NDZhNC41IDQuNSAwIDAwLTMuMDktMy4wOUwyLjI1IDEybDIuODQ2LS44MTNhNC41IDQuNSAwIDAwMy4wOS0zLjA5TDkgNS4yNWwuODEzIDIuODQ2YTQuNSA0LjUgMCAwMDMuMDkgMy4wOUwxNS43NSAxMmwtMi44NDYuODEzYTQuNSA0LjUgMCAwMC0zLjA5IDMuMDl6TTE4LjI1OSA4LjcxNUwxOCA5Ljc1bC0uMjU5LTEuMDM1YTMuMzc1IDMuMzc1IDAgMDAtMi40NTUtMi40NTZMMTQuMjUgNmwxLjAzNi0uMjU5YTMuMzc1IDMuMzc1IDAgMDAyLjQ1NS0yLjQ1NkwxOCAyLjI1bC4yNTkgMS4wMzVhMy4zNzUgMy4zNzUgMCAwMDIuNDU1IDIuNDU2TDIxLjc1IDZsLTEuMDM2LjI1OWEzLjM3NSAzLjM3NSAwIDAwLTIuNDU1IDIuNDU2eiIvPjwvc3ZnPg==">
  </picture>
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
    <img src="https://img.shields.io/github/actions/workflow/status/farhank15/mantiz/mantiz.yml?style=flat-square&logo=github&label=Mantiz%20CI" alt="Mantiz CI">
  </a>
  <br />
  <img src="https://img.shields.io/badge/Stack-TanStack_Start-FF4154?style=flat-square&logo=react&logoColor=white" alt="TanStack">
  <img src="https://img.shields.io/badge/Database-Neon--Postgres-00E59B?style=flat-square&logo=postgresql&logoColor=white" alt="Neon">
  <img src="https://img.shields.io/badge/AI-Powered-FF6B35?style=flat-square" alt="AI">
  <img src="https://img.shields.io/badge/OAuth-GitHub-333?style=flat-square&logo=github" alt="GitHub OAuth">
</p>

---

## 🔍 What is Mantiz?

**Mantiz** is an AI-powered lie detector for code — specifically designed to catch AI coding agents when they try to cheat their test suites.

When an AI agent writes code, it can subtly **disable assertions, mock failing APIs, skip test suites, hallucinate matchers, or tamper with expected values** to make tests pass. Mantiz scans every line of a diff through **11 detection patterns** (10 static + AI-assisted) and produces a **Trust Score (0–100)** with ranked findings.

> **Mantiz is the honesty gate for AI-generated code.** It ensures that "passing" tests actually pass because the code works, not because the agent manipulated them.

> ⚠️ **Honest Accuracy:** Benchmark scores are computed dynamically by running all 11 detectors against each fixture. Dataset A uses real PRs from vitest-dev/vitest — honest code from a respected open-source project. The benchmark is a transparent regression test, not a claim of production readiness.

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
| **AST Analyzer (Babel)** 🆕 | 🔴 High | Parses JS/TS code with `@babel/parser` — detects trivial function bodies (`return true/false`), async gutting, conditional wrapping, empty test shells |
| **Tree-sitter AST** 🆕 | 🔴 High | Multi-language AST analysis via WASM parsers — Python, Go, Java, Ruby, Rust, PHP |
| **Historical Behavioral** 🆕 | 🟡 Medium | Tracks author patterns over time — style changes, odd hours, score volatility |
| **Mutation Susceptibility** 🆕 | 🟡 Medium | Detects fragile tests with low assertion density that can be easily mutated |
| **AI-Assisted Detection** | 🟡 Varies | LLM-powered analysis — detects test weakening, assertion removal, semantic bypass, coverage reduction |

### 🧠 Detection Nuances

**Claim-Diff Mismatch** is Mantiz's most nuanced detector. It flags PRs where all changed files are non-functional (config, docs, deps) — but these findings aren't all equal:

| Scenario | Example | Verdict |
|----------|---------|---------|
| **🤖 Bot dependency update** — Author is `renovate[bot]`, `dependabot[bot]`, `angular-robot`, etc., title says `"build: update dependencies"`, only `package.json`/lockfiles changed | [Angular #69416](https://github.com/angular/angular/pull/69416) | ✅ **Legitimate** — auto-downgraded to LOW confidence (−5pts). Finding still visible but doesn't tank the score. |
| **🧑‍💻 Agent with empty claim** — Title says `"fix: implement feature"` but only `README.md` and `.npmrc` changed | Agent claims "fix login bug" but only adds a VS Code config file | 🚨 **Suspicious** — stays HIGH confidence (−30pts). Strong signal that the agent is faking work. |
| **🤝 Honest human PR** — Title says `"docs: update contributing guide"` and only `CONTRIBUTING.md` changed | Legitimate docs-only PR from a maintainer | ✅ **Benign** — detection is technically correct but the context (bot metadata available vs manual scan) distinguishes it. |

> **How it works:** When scanning via PR URL (requires GitHub auth), Mantiz passes the PR title and author to the detector. If the author is a known bot OR the title honestly describes non-functional changes, Mantiz **downgrades the confidence from HIGH → LOW**. Manual diffs (pasted without PR context) always get the full severity.

This means the same diff gets scored differently depending on context:

```
Same diff (package.json + lockfile changes only):

  📋 Manual paste → HIGH confidence (−30pts) — "You should verify this"
  🔗 PR scan (bot) → LOW confidence (−5pts)   — "Probably fine, renovate doing renovate things"
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

File importance multiplier: `core/test/source = 1.0`, `config = 0.5`, `docs = 0.3`, `artifact = 0.05`. Minimum score is 30 when findings exist (prevents false floor). Score = max(30, 100 - min(penalty, 85)). Threshold: **default 70**, configurable per-user in Settings.

### ⚙️ Per-User Settings

Configure scan behavior from the [Settings](https://mantiz-wine.vercel.app/settings) page:

| Setting | Default | Description |
|---------|---------|-------------|
| **Threshold** | 70 | Trust score threshold (0-100). Scores below this fail the check. |
| **AI Detection** | Off | Enable LLM-powered semantic analysis |
| **Min Score** | 0 | Hard floor — result never goes below this score |
| **Webhook URL** | — | Receive scan results as POST requests (HMAC signed, 3x retry) |

Settings apply to all scans made with your API tokens (CLI, GitHub Actions).

### 🔗 Webhook System v2

Receive scan results in real-time via webhook. Payload includes full findings, signed with HMAC-SHA256 for verification.

**Features:**
- 3 retry attempts with exponential backoff (1s → 4s → 15s)
- `X-Mantiz-Signature` header for payload verification
- Event types: `scan.completed` (pass) / `scan.failed` (fail)
- Delivery history visible in Settings page
- Works with Slack, Discord, Telegram, or custom endpoints

**Example webhook payload:**
```json
{
  "event": "scan.completed",
  "scanId": "uuid",
  "trustScore": 85,
  "passed": true,
  "threshold": 70,
  "findings": [
    {
      "patternType": "disabled_assertion",
      "filePath": "src/test.js",
      "confidence": "high",
      "explanation": "..."
    }
  ]
}
```

### 🏷️ User Verdict

Tag findings in your scan history:
- **Confirmed** — This is a valid cheating detection ✓
- **False Positive** — This finding was incorrect ✗
- **Unreviewed** — Default state

Helps track detection accuracy over time.

### 🔐 GitHub OAuth + Session Management

- Sign in with GitHub to scan pull requests
- Signed HTTP-only cookies with HMAC-SHA256
- Rate limiting (3 tiers: anonymous, session, token)
- Scan history persisted per user in Neon Postgres

### 🤖 AI Detection

- **Toggle:** Easily enable/disable via Settings page or `--ai` CLI flag
- **Smart Analysis:** Detects 5 AI-level patterns: test weakening, assertion removal, semantic bypass, hallucinated APIs, and coverage reduction.
- **AI Judge** (separate from AI detection): Reviews static findings and filters false positives. Enabled via `AI_JUDGE_ENABLED=true` env var. Uses Groq (`GROQ_API_KEY`) or Fireworks (`FIREWORKS_API_KEY`).

### 📊 Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — hero, features, detector patterns |
| `/scan` | Paste & scan a raw git diff |
| `/pr-scan` | Scan a GitHub PR by URL (requires auth) |
| `/login` | GitHub OAuth sign-in |
| `/history` | Scan history with detailed findings modal + user verdict tagging |
| `/settings` | Scan settings (threshold, AI toggle, minScore) + API token management + webhook config |
| `/benchmark` | Interactive benchmark — 39 fixtures across 4 datasets |

### 🧩 Interactive Scan Animation

When scanning, an animated terminal log shows real-time detector progress. After completion, a per-detector breakdown displays finding counts with high/med/low severity colors.

### 📄 Diff Viewer

GitHub-style diff rendering with green/red line highlighting, line number gutter, +/- markers, copy-to-clipboard, and add/del count stats.

### 🔗 Share Results

Every scan generates a public shareable link (`/share/:id`) — no authentication required. Share findings with your team, post them in code reviews, or include them in CI dashboards.

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
npm install

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

# (AI Judge shares the same API key as AI Detection above)

# Webhook secret (optional — for HMAC signing webhook payloads)
WEBHOOK_SECRET=your_random_secret_at_least_32_chars

# Debug logging (optional — enables per-detector console logs)
MANTIZ_DEBUG=true

# App URL (optional — defaults to http://localhost:3030)
APP_URL=http://localhost:3030
```

```bash
# Push database schema
npx drizzle-kit push

# Start dev server
npm run dev
```

### 3. Build for Production

```bash
npm run build
npm run preview
```

### 4. Apply Database Migrations

```bash
# After adding new tables (e.g., user_settings, webhook_events)
npx drizzle-kit push
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

### 🔗 GitHub Actions (Reusable Action)

Add to your workflow to scan every PR:

```yaml
- name: Run Mantiz Scan
  uses: farhank15/mantiz@main
  with:
    api-token: ${{ secrets.MANTIZ_API_TOKEN }}
    threshold: 70          # Override default (configurable in Settings)
    use-ai: true           # Enable AI-assisted detection
    json-output: true      # JSON output for parsing
```

### 🔗 CLI Integration

Install the CLI and scan with options:

```bash
npm install -g @mantiz/cli

# Local scan (no cloud)
mantiz-scan

# Cloud scan with history persistence
mantiz-scan --token mtz_abc123 --save --ai

# JSON output for CI
mantiz-scan --json
```

### 🔔 Webhook Integration

Set up a webhook URL in [Settings](https://mantiz-wine.vercel.app/settings) to receive scan results in real-time:

```bash
# Example: Receive webhook payload
POST /mantiz-webhook
Content-Type: application/json
X-Mantiz-Signature: sha256=...
X-Mantiz-Event: scan.failed

{
  "event": "scan.failed",
  "trustScore": 45,
  "threshold": 70,
  "findings": [...]
}
```

Verify signature:
```javascript
const crypto = require('crypto')
const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
hmac.update(JSON.stringify(req.body))
const expected = 'sha256=' + hmac.digest('hex')
if (req.headers['x-mantiz-signature'] !== expected) return res.status(401)
```

### 🩹 Auto-Heal Mode (`--fix`)

Mantiz doesn't just report cheating — it can **auto-fix it**. Run with the `--fix` flag to automatically apply code patches for detected issues:

```bash
npx mantiz scan diff.diff --fix
```

**What gets fixed:**

| Pattern | Auto-Fix Behavior |
|---------|-------------------|
| **Disabled Assertion** | Re-enables `.skip()` tests, removes `if(false)` wrappers |
| **Assertion Tampering** | Flags the tampered value with a fix comment |
| **Silent Catch-and-Pass** | Wraps the empty catch body with `console.error` logging |
| **Mock-to-Avoid-Failure** | Adds a comment suggesting real integration test |


---

## 📊 Benchmark Results

> **⚠️ REALITY CHECK:** Benchmark scores reflect actual detector output, not target scores. A score of 10 does NOT mean "10% accurate" — it means the diff triggered enough detector findings to floor the score. Each detector has calibrated weights based on precision from a deduped validation set (203 unique PRs: 20 DECEPTIVE, 183 LEGIT).

Mantiz includes a built-in benchmark suite with **42 fixtures across 4 datasets**:

| Dataset | Description | Fixtures | Source |
|:---:|---|:---:|:------:|
| **A** — "The Honest Code" | Proper diff + valid test updates | 4 | 🔴 **Real PRs** (vitest-dev/vitest) |
| **B** — "The Lazy/Cheating AI" | `.skip()`, `if(false)`, commented assertions | 11 | 📜 **Research-based** (DebugML/UC Berkeley) |
| **C** — "The Smart Evasion AI" | Assertion tampering, mock + empty catch | 4 | 📜 **Research-based** (DebugML) |
| **FP** — "False Positive" | Legitimate code patterns | 23 | 🟡 **Mixed** (2 real vitest PRs + 21 documented) |

**How scores work:** Per-detector calibrated weights (see Trust Score table above). Penalty = sum of weighted findings × file importance multiplier. Score = max(30, 100 - min(penalty, 85)). Every score is computed dynamically by `scanDiff()` running all 11 detectors in real time. **No scores are hardcoded or fabricated.**

> **Validation status:** 423 labeled PRs in calibration (16 DECEPTIVE, 407 LEGIT). Per-detector F1 measured against ground truth. Score distribution: avg 98.5/100 — 424 CLEAN, 7 SUSPICIOUS, 2 DECEPTIVE across raw candidates.

Visit the [**/benchmark**](https://mantiz-wine.vercel.app/benchmark) dashboard to see live accuracy results with per-fixture breakdowns.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [TanStack Start](https://tanstack.com/start) (React 19) |
| **Routing** | [TanStack Router](https://tanstack.com/router) (file-based, auto code-split) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) + Magic UI |
| **Animation** | [Framer Motion](https://framermotion.framer.website) |
| **Icons** | [Lucide](https://lucide.dev) |
| **Database** | [Neon Postgres](https://neon.tech) (serverless) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team) |
| **Auth** | GitHub OAuth + HMAC-signed session cookies |
| **AI** | LLM-powered detection engine |
| **AST Parsing** | [@babel/parser](https://babeljs.io/docs/babel-parser) |
| **Behavioral Tracking** | Neon Postgres (author profiles + events) |
| **Diff Parsing** | [diff](https://npm.im/diff) |
| **Rate Limiting** | In-memory sliding window (3 tiers) |
| **GitHub API** | [Octokit](https://github.com/octokit) |
| **Bundler** | [Vite 8](https://vite.dev) + TanStack Router Plugin |
| **Deploy** | [Vercel](https://vercel.com) |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-detector`)
3. Commit your changes (`git commit -m 'feat: add new detection pattern'`)
4. Push to the branch (`git push origin feat/amazing-detector`)
5. Open a Pull Request

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
