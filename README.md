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
  <a href="https://mantiz.vercel.app" target="_blank">
    <img src="https://img.shields.io/badge/Live%20App-mantiz.vercel.app-58A6FF?style=flat-square&logo=vercel&logoColor=white" alt="Live App">
  </a>
  <a href="https://www.testsprite.com/hackathon-s3" target="_blank">
    <img src="https://img.shields.io/badge/TestSprite_S3-Hackathon-EE3124?style=flat-square" alt="Hackathon">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-3FB950?style=flat-square" alt="License">
  </a>
  <br />
  <img src="https://img.shields.io/badge/Stack-TanStack_Start-FF4154?style=flat-square&logo=react&logoColor=white" alt="TanStack">
  <img src="https://img.shields.io/badge/Database-Neon Postgres-00E59B?style=flat-square&logo=postgresql&logoColor=white" alt="Neon">
  <img src="https://img.shields.io/badge/Tests-TestSprite_CLI-6B7280?style=flat-square" alt="TestSprite">
</p>

---

## 🔍 What is Mantiz?

**Mantiz** is an AI-powered lie detector for code — specifically designed to catch AI coding agents when they try to cheat their test suites.

When an AI agent writes code, it can subtly **disable assertions, mock failing APIs, skip test suites, or tamper with expected values** to make tests pass. Mantiz scans every line of a diff through **8 detection patterns** and produces a **Trust Score (0–100)** with ranked findings.

> **Built for the [TestSprite Season 3 Hackathon](https://www.testsprite.com/hackathon-s3)** — the checker for the checker.

---

## ✨ Features

### 🔬 8 Detection Patterns

| Pattern | Severity | What It Catches |
|---------|----------|----------------|
| **Disabled Assertion** | 🔴 Critical | Tests commented out, wrapped in `if(false)`, or marked `.skip()` |
| **Assertion Tampering** | 🔴 Critical | Expected values changed to match broken output |
| **Mock-to-Avoid-Failure** | 🟠 High | New mocks introduced without real-path coverage |
| **Claim-Diff Mismatch** | 🟡 Medium | Commit message says X, diff changes unrelated files |
| **Silent Catch-and-Pass** | 🟠 High | Empty catch blocks swallowing real errors |
| **Coverage Cliff Dropped** | 🔵 Info | Significant test coverage regression |
| **Empty Try-Catch** | 🟠 High | `catch {}` that hides all exceptions |
| **Skipped Test Suite** | 🔴 Critical | `describe.skip()` or entire suites removed |

### 🎯 Trust Score
Weighted scoring: **Critical = 30pts**, **High = 15pts**, **Medium = 5pts**. Lower score = more suspicious diff.

### 🔄 The Loop
Integrated with **TestSprite CLI** — Mantiz is the honesty checker in a closed-loop AI coding pipeline:
```
Agent Code → Mantiz Scan → TestSprite Test → Feedback → Fix
```

---

## 🚀 Quick Start

### 1. Visit the Live App

**[🔗 mantiz.vercel.app](https://mantiz.vercel.app)**

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

## 🧪 The Loop — TestSprite Integration

Mantiz is built specifically for the **TestSprite S3 Hackathon** loop paradigm:

1. **Maker writes code** — An AI coding agent generates a diff
2. **Mantiz scans** — Every line is analyzed for cheating patterns
3. **TestSprite tests** — Real tests run against the deployed app
4. **Loop closes** — The agent fixes issues found by Mantiz + TestSprite

This cycle repeats until all tests pass cleanly — with Mantiz ensuring the agent doesn't cut corners.

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
  <a href="https://mantiz.vercel.app">
    <img src="https://img.shields.io/badge/Try_Mantiz_Now-58A6FF?style=for-the-badge" alt="Try Mantiz">
  </a>
  <a href="https://github.com/farhank15/mantiz">
    <img src="https://img.shields.io/badge/GitHub-333?style=for-the-badge&logo=github" alt="GitHub">
  </a>
</p>
