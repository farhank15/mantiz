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
  <a href="https://mantiz-wine.vercel.app" target="_blank">
    <img src="https://img.shields.io/badge/Live%20App-mantiz-wine.vercel.app-58A6FF?style=flat-square&logo=vercel&logoColor=white" alt="Live App">
  </a>
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
  <img src="https://img.shields.io/badge/Database-Neon Postgres-00E59B?style=flat-square&logo=postgresql&logoColor=white" alt="Neon">
  <img src="https://img.shields.io/badge/Tests-TestSprite_CLI-6B7280?style=flat-square" alt="TestSprite">
  <img src="https://img.shields.io/badge/OAuth-GitHub-333?style=flat-square&logo=github" alt="GitHub OAuth">
</p>

---

## 🔍 What is Mantiz?

**Mantiz** is an AI-powered lie detector for code — specifically designed to catch AI coding agents when they try to cheat their test suites.

When an AI agent writes code, it can subtly **disable assertions, mock failing APIs, skip test suites, or tamper with expected values** to make tests pass. Mantiz scans every line of a diff through **5 detection patterns** and produces a **Trust Score (0–100)** with ranked findings.

> **Mantiz adalah *honesty gate* yang berjalan sebelum test eksekusi.** Dia tidak menggantikan TestSprite (yang verifikasi behavior), tapi memastikan hasil test yang "lolos" itu lolos beneran — bukan karena dimanipulasi oleh agentnya sendiri.

> **Built for the [TestSprite Season 3 Hackathon](https://www.testsprite.com/hackathon-s3)** — the checker for the checker.

---

## ✨ Features

### 🔬 5 Detection Patterns

| Pattern | Severity | What It Catches |
|---------|----------|----------------|
| **Disabled Assertion** | 🔴 High | Tests commented out, wrapped in `if(false)`, or marked `.skip()` / `test.skip()` |
| **Assertion Tampering** | 🔴 High | Expected values changed to match broken output instead of fixing the bug |
| **Mock-to-Avoid-Failure** | 🟠 Medium | New mocks introduced without real-path coverage to bypass real errors |
| **Claim-Diff Mismatch** | 🟡 Medium | Commit message says "fix tests" but diff only touches source — no test updated |
| **Silent Catch-and-Pass** | 🟠 Medium | Empty catch blocks that swallow real errors and let the agent declare success |

### 🎯 Trust Score
Weighted scoring: **high confidence = 30pts**, **medium = 15pts**, **low = 5pts** deducted per finding. Lower score = more suspicious diff.

### 🔄 The Loop
Integrated with **TestSprite CLI** — Mantiz is the honesty gate in a closed-loop AI coding pipeline:
```
Agent Code → Mantiz Scan (honesty check) → TestSprite Test (behavior check) → Feedback → Fix
```

---

## 🚀 Quick Start

### 1. Visit the Live App

**[🔗 mantiz-wine.vercel.app](https://mantiz-wine.vercel.app)**

Paste any GitHub-style diff and get instant results. No signup needed.

### 2. Run Locally

```bash
# Clone the repo
git clone https://github.com/farhank15/mantiz.git
cd mantiz

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your DATABASE_URL (Neon Postgres recommended)

# Start dev server
npm run dev
```

### 3. Build for Production

```bash
npm run build
npm run preview
```

---

## 🧪 Real-World Use Cases

### 🧑‍💻 Scenario 1 — Solo developer using an AI coding agent

You're coding with Claude Code/Cursor. The agent writes code + tests. Problem: **agents sometimes cheat** — they skip hard-to-fix tests or change assertion values to match the bug instead of fixing it.

```bash
# Capture what your agent just wrote
git diff > my-changes.diff
```

Paste the diff into **[mantiz-wine.vercel.app/scan](https://mantiz-wine.vercel.app/scan)**, or run locally:

```bash
npm run mantiz-scan
# Output:
# Trust Score: 40/100 🔴 CHEATING DETECTED
# Finding: test/auth.test.ts:42 — .skip() added — test silently disabled
```

Before you commit and assume everything's "safe", Mantiz tells you your agent cut a corner.

---

### 🏭 Scenario 2 — Team / CI gate (most powerful in production)

Installed in **GitHub Actions** — every PR is automatically scanned:

1. Developer or agent opens a PR
2. `.github/workflows/mantiz.yml` runs automatically
3. Mantiz scans the PR diff
4. If Trust Score < 70 → **build fails**, PR cannot be merged
5. Reviewer gets a clear report: _"line 42: assertion changed from `toBe(5)` to `toBe(3)` — suspected tampering"_

**The value:** humans don't have to read every diff line by line to suspect cheating — Mantiz filters first.

---

### 🔗 Scenario 3 — Pre-filter before TestSprite (aligned with hackathon theme)

Mantiz acts as a **cheap honesty gate before the expensive TestSprite run**:

```
Agent writes code
  → Mantiz scan (fast, free, catches obvious cheating)
  → if PASS → TestSprite test (real browser, uses credits)
  → if FAIL → back to agent to fix honestly
  → LOOP.md logs every iteration
```

Mantiz doesn't replace TestSprite (which verifies real behavior). It **saves TestSprite credits** by catching manipulation before it wastes a real browser run.

---

### 📋 The Loop — Iteration Evidence

| Phase | What Happens | How Mantiz Checks |
|-------|-------------|-------------------|
| **Agent writes code** | AI generates a diff (new feature, bug fix, refactor) | `git diff` captured automatically |
| **Mantiz scans diff** | 5 detectors analyze every changed line | Trust Score 0-100 + ranked findings |
| **Agent reads feedback** | If score < 70, agent reads findings and fixes | Auto-generated fix instructions per finding |
| **Mantiz re-scans** | Agent re-runs scan to verify the fix is honest | Score must return to ≥ 80 |
| **TestSprite tests** | Real E2E tests run against live deployed app | TestSprite CLI — behavior verified |
| **LOOP.md logged** | Every iteration logged with verdict | One row per cycle — evidence for judges |

> **Evidence:** See [LOOP.md](LOOP.md) for the complete iteration history — 6 real iterations including a live bug found and fixed by TestSprite.

---

## 📊 Benchmark Results

Mantiz includes a built-in benchmark suite with 6 curated fixtures across 3 datasets:

| Dataset | Description | Fixtures | Target Score |
|---------|-------------|----------|-------------|
| **A** — "The Honest Code" | Proper diff + valid test updates | 2 | 90–100 ✅ |
| **B** — "The Lazy/Cheating AI" | `.skip()`, `if(false)`, commented assertions | 2 | < 40 🔴 |
| **C** — "The Smart Evasion AI" | Assertion tampering, mock + empty catch | 2 | 50–70 🟡 |

> Visit the [**/benchmark**](https://mantiz-wine.vercel.app/benchmark) dashboard to see live accuracy results.

---

## 🖥 Mantiz CLI

Run Mantiz locally in any project to scan staged/unstaged changes:

```bash
cd mantiz
npm run mantiz-scan

# Output:
# 🔍 MANTIZ SCAN RESULTS
# Trust Score: 55/100 🔴 CHEATING DETECTED
# Findings: 2
# - HIGH test/auth.test.js:42 — Assertion value changed
# 📝 LOOP.md updated — iteration 3 logged
# ✗ BUILD FAILED — Trust score below 70 threshold
```

The CLI also integrates with **GitHub Actions** via `.github/workflows/mantiz.yml` — any push or PR that triggers a low trust score will fail the build.

---

## 🏗 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [TanStack Start](https://tanstack.com/start) (React) |
| **Routing** | [TanStack Router](https://tanstack.com/router) (file-based) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) + Magic UI |
| **Animation** | [Framer Motion](https://framermotion.framer.website) |
| **Icons** | [Lucide](https://lucide.dev) |
| **Database** | [Neon Postgres](https://neon.tech) (serverless) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team) |
| **Diff Parsing** | [diff](https://npm.im/diff) |
| **GitHub API** | [Octokit](https://github.com/octokit) |
| **AST Parsing** | [@babel/parser](https://babel.dev/docs/babel-parser) |
| **Testing** | [TestSprite CLI](https://testsprite.com) |
| **Deploy** | [Vercel](https://vercel.com) |

---

## 📁 Project Structure

```
mantiz/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── magicui/      # Magic UI animated components
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── routes/           # TanStack file-based routes
│   │   ├── index.tsx      # Landing page (hero, features, patterns)
│   │   ├── scan/          # Diff paste & scan page
│   │   └── history/       # Scan history page
│   ├── detectors/        # Detection pattern engines
│   ├── schemas/          # Drizzle database schemas
│   ├── router.tsx        # Router configuration
│   ├── routeTree.gen.ts  # Auto-generated route tree
│   └── styles.css        # Global styles + Tailwind
├── app.config.ts         # TanStack Start config
├── drizzle.config.ts     # Drizzle ORM config
├── LOOP.template.md      # TestSprite loop log template
└── PLAN.md               # Development plan
```

---

## 🤝 Contributing

This project is part of the TestSprite S3 Hackathon. While it's primarily a solo project, feedback and suggestions are welcome!

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
