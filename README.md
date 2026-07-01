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
  <a href="https://www.testsprite.com/hackathon-s3" target="_blank">
    <img src="https://img.shields.io/badge/TestSprite_S3-Hackathon-EE3124?style=flat-square" alt="Hackathon">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-3FB950?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/farhank15/mantiz/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/farhank15/mantiz/mantiz.yml?style=flat-square&logo=github&label=Mantiz%20CI" alt="Mantiz CI">
  </a>
  <br />
  <img src="https://img.shields.io/badge/Stack-TanStack_Start-FF4154?style=flat-square&logo=react&logoColor=white" alt="TanStack">
  <img src="https://img.shields.io/badge/Database-Neon--Postgres-00E59B?style=flat-square&logo=postgresql&logoColor=white" alt="Neon">
  <img src="https://img.shields.io/badge/AI-Fireworks_+_Groq-FF6B35?style=flat-square" alt="AI">
  <img src="https://img.shields.io/badge/Tests-TestSprite_CLI-6B7280?style=flat-square" alt="TestSprite">
  <img src="https://img.shields.io/badge/OAuth-GitHub-333?style=flat-square&logo=github" alt="GitHub OAuth">
</p>

---

## 🔍 What is Mantiz?

**Mantiz** is an AI-powered lie detector for code — specifically designed to catch AI coding agents when they try to cheat their test suites.

When an AI agent writes code, it can subtly **disable assertions, mock failing APIs, skip test suites, hallucinate matchers, or tamper with expected values** to make tests pass. Mantiz scans every line of a diff through **7 detection patterns** (6 static + AI-assisted) and produces a **Trust Score (0–100)** with ranked findings.

> **Mantiz adalah *honesty gate* yang berjalan sebelum test eksekusi.** Dia tidak menggantikan TestSprite (yang verifikasi behavior), tapi memastikan hasil test yang "lolos" itu lolos beneran — bukan karena dimanipulasi oleh agentnya sendiri.

> **Built for the [TestSprite Season 3 Hackathon](https://www.testsprite.com/hackathon-s3)** — the checker for the checker.

---

## ✨ Features

### 🔬 7 Detection Patterns (6 Static + AI-Assisted)

| Pattern | Severity | What It Catches |
|---------|----------|----------------|
| **Disabled Assertion** | 🔴 High | Tests commented out, wrapped in `if(false)`, or marked `.skip()` / `test.skip()` |
| **Assertion Tampering** | 🔴 High | Expected values changed to match broken output instead of fixing the bug |
| **Mock-to-Avoid-Failure** | 🟠 Medium | New mocks introduced without real-path coverage to bypass real errors |
| **Claim-Diff Mismatch** | 🟡 Medium | Commit message says "fix tests" but diff only touches source — no test updated |
| **Silent Catch-and-Pass** | 🟠 Medium | Empty catch blocks that swallow real errors and let the agent declare success |
| **Hallucinated Assertion** | 🔴 High | Non-existent Jest/Vitest matchers hallucinated by AI agents (e.g. `.toExist()`) |
| **AI-Assisted Detection** | 🟡 Varies | LLM-powered analysis via Fireworks/Groq — detects test weakening, assertion removal, semantic bypass, coverage reduction |

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

Weighted scoring: **high = 30pts**, **medium = 15pts**, **low = 5pts** deducted per finding. Minimum score is 10 when findings exist (avoids confusing 0/100). Threshold: **≥ 80 = PASS**.

### 🔐 GitHub OAuth + Session Management

- Sign in with GitHub to scan pull requests
- Signed HTTP-only cookies with HMAC-SHA256
- Rate limiting (3 tiers: anonymous, session, token)
- Scan history persisted per user in Neon Postgres

### 🤖 AI Detection

- **Toggle:** Easily enable/disable via `AI_DETECTION_ENABLED=true`
- **Resilient Architecture:** Uses **Fireworks Inference** as primary provider with an automatic fallback to **Groq** to ensure high availability.
- **Smart Analysis:** Detects 5 AI-level patterns: test weakening, assertion removal, semantic bypass, hallucinated APIs, and coverage reduction.


### 📊 Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — hero, features, detector patterns |
| `/scan` | Paste & scan a raw git diff |
| `/pr-scan` | Scan a GitHub PR by URL (requires auth) |
| `/login` | GitHub OAuth sign-in |
| `/history` | Scan history with detailed findings modal |
| `/settings` | API token management (`mtz_*` prefix) |
| `/benchmark` | Interactive benchmark — 12 fixtures across 3 datasets |

### 🧩 Interactive Scan Animation

When scanning, an animated terminal log shows real-time detector progress. After completion, a per-detector breakdown displays finding counts with high/med/low severity colors.

### 📄 Diff Viewer

GitHub-style diff rendering with green/red line highlighting, line number gutter, +/- markers, copy-to-clipboard, and add/del count stats.

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

# AI Detection (optional — enables Fireworks + Groq)
AI_DETECTION_ENABLED=true
FIREWORKS_API_KEY=fw_xxx
GROQ_API_KEY=gsk_xxx

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
4. Mantiz fetches the diff, runs 7 detectors, and returns findings

### 🔗 CI/CD Integration

Install in **GitHub Actions** — every PR is automatically scanned:

```yaml
# .github/workflows/mantiz.yml
name: Mantiz PR Scan
on: [pull_request]
jobs:
  check-honesty:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx mantiz scan --pr ${{ github.event.pull_request.html_url }}
        env:
          MANTIZ_API_TOKEN: ${{ secrets.MANTIZ_API_TOKEN }}
```

### 🔄 The Loop — TestSprite Integration

Mantiz is designed as a **fast honesty gate before the comprehensive TestSprite run**:

```
Agent writes code
  → Mantiz scan (fast, free, catches obvious cheating)
  → if PASS → TestSprite test (real browser, runs E2E tests)
  → if FAIL → back to agent to fix honestly
```

---

## 🏆 TestSprite Journey & S3 Loop Engineering

To meet the rigorous verification criteria of the TestSprite Hackathon Season 3, we implemented an continuous **Write-Verify-Fix loop** documented below.

### 📅 Round Progression (Testing Iterations)

We verified our codebase through 7 distinct rounds of TestSprite automation:

| Round | Focus / Scenario | Initial Verdict | Issue / Discovery | Fixed In | Final Verdict |
|:---:|---|:---:|---|:---:|:---:|
| **1** | Landing page rendering & CTA buttons | **BLOCKED** 🔴 | Plan selector ambiguity | N/A | **PASSED** ✅ |
| **2** | Scanner bypass on `test.skip` arguments | **FAILED** 🔴 | Regex missed `.skip('desc', fn)` | `56f14fe` | **PASSED** ✅ |
| **3** | PR scan page & GitHub OAuth integration | **FAILED** 🔴 | Preview Vercel OAuth redirect error | `8f5b8c0` | **PASSED** ✅ |
| **4** | Clean code scan (Claim-Diff Mismatch) | **FAILED** 🔴 | Claim mismatch trigger on source-only diffs | `bf128a1` | **PASSED** ✅ |
| **5** | Monorepos & fixture files | **FAILED** 🔴 | False positives on fixture test directories | `9a12c8a` | **PASSED** ✅ |
| **6** | Documentation files (README.md) scan | **FAILED** 🔴 | False positive on documentation code blocks | `ae789b1` | **PASSED** ✅ |
| **7** | Integration history & DB synchronization | **PASSED** ✅ | DB Neon sync, cookies, and UI history list | N/A | **PASSED** ✅ |

### 🐛 Bugs Found & Fixed via TestSprite Loop

Every code failure detected by our TestSprite E2E test runs was analyzed, patched, and verified:

| Bug / Vulnerability | Description | Detector / Layer | Fix Commit | Status |
|-----------------------|-----------|------------------|------------|:------:|
| **`test.skip('desc', fn)` Bypass** | Pola `SKIP_PATTERN` hanya mendeteksi `.skip()`, meleset jika ada parameter. | *Disabled Assertion* (Bypass) | [`56f14fe`](https://github.com/farhank15/mantiz/commit/56f14fe) | **FIXED** ✅ |
| **Vercel OAuth Domain Mismatch** | OAuth Callback gagal di preview Vercel karena `APP_URL` statis. | *Authentication* (OAuth) | [`8f5b8c0`](https://github.com/farhank15/mantiz/commit/8f5b8c0) | **FIXED** ✅ |
| **Monorepo False Positives** | File fixture uji monorepo dideteksi sebagai kode produksi. | *File Exclusions* | [`9a12c8a`](https://github.com/farhank15/mantiz/commit/9a12c8a) | **FIXED** ✅ |
| **Commented Assertion Bypass** | Komentar asersi polos tanpa tanda kurung tidak terdeteksi. | *Commented Assertions* | [`c127fb3`](https://github.com/farhank15/mantiz/commit/c127fb3) | **FIXED** ✅ |
| **Markdown Doc False Positives** | Kata `.skip()` di dalam file README/dokumentasi dianggap kecurangan. | *File Exclusions* | [`ae789b1`](https://github.com/farhank15/mantiz/commit/ae789b1) | **FIXED** ✅ |
| **Literal String False Positives** | Teks `.skip` dalam string pengujian unit test diblokir. | *Engine Tests* | [`bf98d1a`](https://github.com/farhank15/mantiz/commit/bf98d1a) | **FIXED** ✅ |
| **Nested Parentheses Bypass** | Asersi bersarang seperti `expect(fn()).toBe(...)` lolos dari tampering. | *Assertion Tampering* | [`8fd023a`](https://github.com/farhank15/mantiz/commit/8fd023a) | **FIXED** ✅ |

---

## 📊 Benchmark Results

Mantiz includes a built-in benchmark suite with **12 fixtures across 3 datasets**:

| Dataset | Description | Fixtures | Target Score |
|---------|-------------|----------|-------------|
| **A** — "The Honest Code" | Proper diff + valid test updates | 2 | 90–100 ✅ |
| **B** — "The Lazy/Cheating AI" | `.skip()`, `if(false)`, commented assertions | 2 | < 40 🔴 |
| **C** — "The Smart Evasion AI" | Assertion tampering, mock + empty catch | 2 | 50–70 🟡 |

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
| **AI** | [Fireworks Inference](https://fireworks.ai) + [Groq](https://groq.com) |
| **Diff Parsing** | [diff](https://npm.im/diff) |
| **Rate Limiting** | In-memory sliding window (3 tiers) |
| **GitHub API** | [Octokit](https://github.com/octokit) |
| **Testing** | [TestSprite CLI](https://testsprite.com) + Vitest |
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
  Built with ❤️ for the <a href="https://www.testsprite.com/hackathon-s3">TestSprite Season 3 Hackathon</a>
  <br />
  <sub><em>"A loop without a real checker doesn't fail loudly."</em></sub>
</p>

<p align="center">
  <a href="https://mantiz-wine.vercel.app">
    <img src="https://img.shields.io/badge/Try_Mantiz_Now-58A6FF?style=for-the-badge" alt="Try Mantiz">
  </a>
  <a href="https://github.com/farhank15/mantiz">
    <img src="https://img.shields.io/badge/GitHub-333?style=for-the-badge&logo=github" alt="GitHub">
  </a>
</p>
