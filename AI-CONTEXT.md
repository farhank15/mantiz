# 🤖 AI Context — Mantiz

> **Complete project context for AI coding agents joining Mantiz.**
> Read this first before making any changes to the codebase.

---

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Architecture Overview](#-architecture-overview)
- [Detector Engine](#-detector-engine)
- [GitHub OAuth Flow](#-github-oauth-flow)
- [PR Scan Flow](#-pr-scan-flow)
- [Benchmark System](#-benchmark-system)
- [Mantiz CLI](#-mantiz-cli)
- [Routing & Pages](#-routing--pages)
- [Styling System](#-styling-system)
- [Database Schema](#-database-schema)
- [Environment Variables](#-environment-variables)
- [Development Workflow](#-development-workflow)
- [Key Decisions](#-key-decisions)
- [Common Pitfalls](#-common-pitfalls)

---

## 🎯 Project Overview

**Mantiz** is an AI-powered lie detector for code — specifically designed to catch AI coding agents when they try to cheat their test suites.

**Core Loop:**
```
Agent writes code → git diff captured → 5 detectors scan →
Trust Score (0-100) + findings + fix instructions →
Agent fixes honestly → Re-scan → TestSprite tests →
LOOP.md logged → Repeat
```

**Built for:** [TestSprite Season 3 Hackathon](https://www.testsprite.com/hackathon-s3)
**Live URL:** [mantiz-wine.vercel.app](https://mantiz-wine.vercel.app)
**Repo:** [github.com/farhank15/mantiz](https://github.com/farhank15/mantiz)

---

## 🏗 Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Framework** | [TanStack Start](https://tanstack.com/start) | latest | Full-stack React meta-framework |
| **Router** | [TanStack Router](https://tanstack.com/router) | latest | File-based routing with `tsr.config.json` |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) | ^4.1.18 | New `@theme` directive syntax |
| **Animation** | [Framer Motion](https://framermotion.framer.website) | ^12.42.1 | Layout animations, spring transitions |
| **Icons** | [Lucide React](https://lucide.dev) | ^0.545.0 | Tree-shakeable icons |
| **Fonts** | Inter + JetBrains Mono | Google Fonts | Sans + Monospace |
| **Database** | Neon Postgres | serverless | Via `@neondatabase/serverless` |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team) | ^0.45.2 | Schema in `src/schemas/index.ts` |
| **Diff Parsing** | [npm:diff](https://npm.im/diff) | ^9.0.0 | `parsePatch()` for unified diffs |
| **GitHub API** | [Octokit](https://github.com/octokit) | ^22.0.1 | REST API client |
| **AST Parsing** | [@babel/parser](https://babel.dev/docs/babel-parser) | ^7.29.7 | For advanced code analysis |
| **CI/CD** | GitHub Actions | — | `.github/workflows/mantiz.yml` |
| **Deploy** | [Vercel](https://vercel.com) | — | Serverless preset |
| **CLI Runtime** | [tsx](https://github.com/privatenumber/tsx) | — | TypeScript execution for CLI |
| **Testing** | [TestSprite CLI](https://testsprite.com) | — | Integration testing |
| **Unit Tests** | Vitest | ^4.1.5 | `npm run test` |

---

## 📁 Project Structure

```
mantiz/
├── .rules/
│   └── ai-agent-workflow.md      # AI Agent workflow instructions
├── .github/
│   └── workflows/
│       └── mantiz.yml             # GitHub Actions CI/CD
├── public/
│   ├── manifest.json
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── magicui/               # Animated UI components
│   │   │   ├── animated-beam.tsx
│   │   │   ├── animated-gradient-text.tsx
│   │   │   ├── beam-network.tsx
│   │   │   ├── bento-grid.tsx
│   │   │   ├── marquee.tsx
│   │   │   ├── meteors.tsx
│   │   │   ├── number-ticker.tsx
│   │   │   ├── orbiting-circles.tsx
│   │   │   ├── particles.tsx
│   │   │   ├── retro-grid.tsx
│   │   │   ├── shimmer-button.tsx
│   │   │   ├── text-reveal.tsx
│   │   │   └── utils.ts           # cn() function (clsx + tailwind-merge)
│   │   ├── Header.tsx             # Responsive navbar with auth + mobile drawer
│   │   ├── Footer.tsx
│   │   └── ThemeToggle.tsx
│   ├── detectors/
│   │   ├── types.ts               # PatternType, Confidence, Finding, ParsedDiff types
│   │   ├── engine.ts              # scanDiff() — orchestrates all detectors + auto-healer
│   │   ├── diff-parser.ts         # parseRawDiff() — diff -> ParsedDiff[]
│   │   ├── disabled-assertion.ts  # Detector 1: .skip(), if(false), commented assertions
│   │   ├── assertion-tampering.ts # Detector 2: assertion value changes without source change
│   │   ├── mock-to-avoid.ts       # Detector 3: new mocks without real-path coverage
│   │   ├── claim-mismatch.ts      # Detector 4: commit message vs actual diff mismatch
│   │   └── silent-catch.ts        # Detector 5: empty catch blocks
│   ├── server/
│   │   └── auth.ts                # Server functions: startLogin, handleCallback, getSession, logout, scanPR
│   ├── lib/
│   │   └── auth-context.tsx        # AuthProvider + useAuth() hook
│   ├── benchmark/
│   │   └── runner.ts              # Benchmark runner — runs detectors against fixtures
│   ├── routes/
│   │   ├── __root.tsx             # Root layout (wraps AuthProvider)
│   │   ├── index.tsx              # Landing page
│   │   ├── scan/
│   │   │   └── index.tsx          # Diff paste & scan page
│   │   ├── pr-scan/
│   │   │   └── index.tsx          # PR URL scan page (requires auth)
│   │   ├── login/
│   │   │   └── index.tsx          # Login page with GitHub OAuth button
│   │   ├── history/
│   │   │   └── index.tsx          # Scan history page
│   │   ├── benchmark/
│   │   │   └── index.tsx          # Benchmark dashboard (3 dataset scores)
│   │   └── auth/github/
│   │       └── callback.tsx        # OAuth callback handler
│   ├── schemas/
│   │   └── index.ts               # Drizzle schema: users, repos, scans, findings
│   ├── cli/
│   │   └── scan.ts                # Mantiz CLI — git diff → scan → LOOP.md auto-log
│   ├── router.tsx                 # Router configuration
│   ├── routeTree.gen.ts           # Auto-generated route tree
│   └── styles.css                 # Global styles + Tailwind v4 theme
├── tests/
│   └── fixtures/
│       ├── dataset-a/             # "The Honest Code"
│       │   ├── honest-math.ts     # Expected: 100 ✅
│       │   └── honest-auth.ts     # Expected: 90  ✅
│       ├── dataset-b/             # "The Lazy/Cheating AI"
│       │   ├── cheating-skip.ts   # Expected: 40  🔴
│       │   └── cheating-if-false.ts # Expected: 35  🔴
│       └── dataset-c/             # "The Smart Evasion AI"
│           ├── evasion-assertion-tamper.ts # Expected: 70 🟡
│           └── evasion-mock-catch.ts       # Expected: 60 🟡
├── AI-CONTEXT.md                  # ← This file
├── AGENTS.md                      # TanStack Intent skill references
├── LOOP.md                        # 15 iteration dev log
├── LOOP.template.md               # Loop log template
├── PLAN.md                        # Development plan + submission checklist
├── README.md                      # Project README
├── DESIGN.md                      # Design documentation
├── Mantiz-PRD.md                  # Product requirements
├── app.config.ts                  # TanStack Start config
├── vite.config.ts                 # Vite config
├── tsconfig.json                  # TypeScript config
├── tsr.config.json                # TanStack Router config
├── drizzle.config.ts              # Drizzle ORM config
└── package.json
```

---

## 🏛 Architecture Overview

### Request Flow

```
Browser                          TanStack Start Server
  │                                      │
  ├── Static assets (Vite build)         │
  ├── Client-side routes                 │
  │   (TanStack Router SPA)              │
  │                                      │
  └── Server Functions ──────────────────┤
      (createServerFn)                    │
        ├── GET: startLogin, getSession   │
        └── POST: handleCallback, logout, │
                  scanPR                  │
```

### Data Flow for Scanning

```
User Input (diff text / PR URL)
       │
       ▼
   scanDiff(rawDiff)
       │
       ├── parseRawDiff(diff) → ParsedDiff[]
       │       │
       │       └── Uses npm:diff parsePatch() + fallback parser
       │
       ├── detectDisabledAssertions(files)
       ├── detectAssertionTampering(files)
       ├── detectMockToAvoid(files)
       ├── detectClaimDiffMismatch(files)
       └── detectSilentCatch(files)
              │
              ▼
       Calculate Trust Score
       100 - (high×30 + medium×15 + low×5)
              │
              ▼
       Generate Fix Instructions (if score < 80)
              │
              ▼
       Return ScanResult { files, findings, trustScore, summary, fixInstructions }
```

---

## 🔬 Detector Engine

### Core Types (`src/detectors/types.ts`)

```typescript
type PatternType = 'disabled_assertion' | 'assertion_tampering'
  | 'mock_to_avoid_failure' | 'claim_diff_mismatch' | 'silent_catch_and_pass'

type Confidence = 'low' | 'medium' | 'high'

interface Finding {
  patternType: PatternType
  filePath: string
  lineStart: number
  lineEnd: number
  confidence: Confidence
  explanation: string
  evidenceExcerpt: string
}

interface ParsedDiff {
  oldFile?: string
  newFile?: string
  hunks: DiffHunk[]
}
```

### Engine (`src/detectors/engine.ts`)

```typescript
function scanDiff(rawDiff: string): ScanResult
```

The engine orchestrates all 5 detectors and calculates a **Trust Score (0-100)**:
- Each finding deducts points based on confidence: **high=30, medium=15, low=5**
- Score = 100 - total deductions (minimum 0)
- If score < 80, generates `fixInstructions[]` for auto-healing

### 5 Detectors

| # | Detector | File | What It Catches | Confidence Weights |
|---|----------|------|----------------|-------------------|
| 1 | **Disabled Assertion** | `disabled-assertion.ts` | `.skip()`, `if(false)` wrappers, commented-out assertions | high=30, medium=15, low=5 |
| 2 | **Assertion Tampering** | `assertion-tampering.ts` | Expected values changed without source logic change | high=30 |
| 3 | **Mock-to-Avoid-Failure** | `mock-to-avoid.ts` | New mocks introduced without real-path coverage | high=30, medium=15 |
| 4 | **Claim-Diff Mismatch** | `claim-mismatch.ts` | Commit message vs actual diff content mismatch | high=30, medium=15, low=5 |
| 5 | **Silent Catch-and-Pass** | `silent-catch.ts` | Empty catch blocks, `catch {}` hiding errors | high=30, medium=15, low=5 |

### Diff Parser (`src/detectors/diff-parser.ts`)

- Uses `parsePatch()` from npm `diff` package
- **Fallback parser** (`fallbackParse()`) — manual line-by-line extraction when `parsePatch()` throws on malformed diffs
- Handles multi-file, multi-hunk diffs correctly
- Edge case: no `diff --git` header but has diff content → wraps as `'unknown'` file

### Auto-Healer (`engine.ts`)

For findings with trustScore < 80, generates `fixInstructions[]`:
```typescript
interface FixInstruction {
  patternType: string
  instruction: string  // Human-readable fix prompt for AI agents
}
```

---

## 🔐 GitHub OAuth Flow

### Architecture

```
Browser                    Server (TanStack Start)          GitHub
  │                             │                             │
  │  Click "Sign In"           │                             │
  │ ─────────────────────────▶ │   startLogin() (GET)       │
  │                             │   - Generate state           │
  │ ◀───────────────────────── │   - Set oauth_state cookie   │
  │  { url: githubAuthUrl }    │   - Return GitHub URL        │
  │                             │                             │
  │ Redirect to GitHub ─────────────────────────────────────▶│
  │                             │                             │
  │ User authorizes ◀────────────────────────────────────────│
  │                             │                             │
  │ Callback: /auth/github/    │   handleCallback() (POST)   │
  │ callback?code=xxx&state=yy │   - Verify state cookie     │
  │ ─────────────────────────▶ │   - Exchange code → token   │
  │                             │   - Fetch user info          │
  │ ◀───────────────────────── │   - Set session cookie       │
  │  { login, avatar, ... }    │   - Return user data         │
  │                             │                             │
  │ Store in sessionStorage    │                             │
  │ Navigate to /              │                             │
```

### Key Files

| File | Function |
|------|----------|
| `src/server/auth.ts` | Server functions: `startLogin`, `handleCallback`, `getSession`, `logout`, `scanPR` |
| `src/lib/auth-context.tsx` | React context: `AuthProvider`, `useAuth()` hook |
| `src/routes/auth/github/callback.tsx` | OAuth callback handler page |
| `src/routes/login/index.tsx` | Login page with GitHub Sign In button |
| `src/components/Header.tsx` | Auth UI (Sign In, avatar + dropdown menu) |

### Session Management

- **Cookie name:** `mantiz_session` (HTTP-only, SameSite=Lax, Path=/)
- **Signed with HMAC-SHA256** using `SESSION_SECRET` env var
- **Expiry:** 7 days (configurable in `setSessionCookie`)
- **State cookie:** `oauth_state` (10 min expiry, for CSRF protection)

### Session Cookie Format

```
mantiz_session=base64(json).hmac_hex_signature
```

The session payload contains: `{ userId, login, avatar, name, token }`
The token is the GitHub access token (needed for Octokit API calls).

### Session Persistence Fix

The app uses a **sessionStorage fallback** to avoid flash-of-unauthenticated-state:
1. **Callback page:** After successful `handleCallback`, stores `{ login, avatar, name, userId }` in `sessionStorage.setItem('mantiz_auth', ...)`
2. **AuthProvider mount:** Checks sessionStorage first → sets user instantly → verifies with server in background
3. **Server verification:** `getSession()` runs as POST (not GET) to ensure cookies are in request context
4. **Stale data:** If server returns null (cookie expired), `setUser(null)` clears the auth state

### Environment Variables for OAuth

```env
GITHUB_CLIENT_ID=ov23li...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=<random 32+ char string>
```

### GitHub OAuth App Setup

1. Go to https://github.com/settings/developers → New OAuth App
2. Homepage URL: `https://mantiz-wine.vercel.app`
3. Authorization callback URLs:
   ```
   http://localhost:3000/auth/github/callback
   https://mantiz-wine.vercel.app/auth/github/callback
   ```

### Auth Context API

```typescript
const { user, isLoading, isAuthenticated, login, logout } = useAuth()
// user: { login, avatar, name, userId } | null
// login: () => void   — redirects to GitHub
// logout: () => Promise<void>  — clears session + redirects home
```

---

## 📦 PR Scan Flow

### How It Works

1. User pastes PR URL: `https://github.com/owner/repo/pull/123`
2. `scanPR()` server function validates session + parses URL
3. Fetches PR diff via GitHub API (`application/vnd.github.v3.diff`)
4. Fetches PR metadata via Octokit
5. Runs `scanDiff()` on the diff text
6. Returns PR info + scan results (limited to 20 findings)

### Auth Requirements

- Requires valid session (GitHub OAuth)
- Uses the user's GitHub token for API access
- Private repos accessible if token has `repo` scope

### Error Handling

| Issue | Response |
|-------|----------|
| No session | `'Not authenticated. Please login with GitHub first.'` |
| Invalid PR URL | `'Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123'` |
| GitHub API error | HTTP status code from the API |

---

## 📊 Benchmark System

### Overview

The benchmark runs all 5 detectors against curated fixture files and compares actual scores with expected scores.

### Structure

```
tests/fixtures/
├── dataset-a/     "The Honest Code"     → Expected: 90-100
├── dataset-b/     "The Lazy/Cheating AI" → Expected: < 50
└── dataset-c/     "The Smart Evasion AI" → Expected: 50-70
```

### Benchmark Runner (`src/benchmark/runner.ts`)

```typescript
async function runBenchmark(): Promise<BenchmarkResult[]>
```

- Uses `import.meta.glob` (Vite) to dynamically import all fixture files
- Each fixture exports: `{ diff: string, expected: { trustScore, label, dataset } }`
- Tolerance: 20 points margin for pass/fail determination
- Returns grouped results per dataset with summary stats

### Benchmark Dashboard

- Route: `/benchmark`
- Displays 3 dataset cards with average scores
- Expandable per-fixture details
- Animated progress bars + score indicators
- Pass/fail status per fixture

---

## 🖥 Mantiz CLI

### Usage

```bash
npm run mantiz-scan
```

### Implementation (`src/cli/scan.ts`)

The CLI:
1. Captures `git diff` (staged + unstaged changes)
2. Runs `scanDiff()` on the diff
3. Outputs results to terminal
4. Appends entry to `LOOP.md` automatically
5. Exits with code 1 if trustScore < 70

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean — no cheating detected (score ≥ 70) |
| 1 | Suspicious — cheating patterns found (score < 70) |

### GitHub Actions Integration

The `.github/workflows/mantiz.yml` runs `npm run mantiz-scan` on every push/PR.
If the CLI exits with code 1, the build fails — preventing cheated code from being merged.

---

## 🛤 Routing & Pages

TanStack Router file-based routing via `tsr.config.json`.

| Route | File | Description | Auth Required |
|-------|------|-------------|---------------|
| `/` | `src/routes/index.tsx` | Landing page with hero, features, patterns | No |
| `/scan` | `src/routes/scan/index.tsx` | Diff paste & scan form | No |
| `/pr-scan` | `src/routes/pr-scan/index.tsx` | PR URL scan | Yes |
| `/login` | `src/routes/login/index.tsx` | GitHub OAuth login | No |
| `/history` | `src/routes/history/index.tsx` | Scan history | No |
| `/benchmark` | `src/routes/benchmark/index.tsx` | Benchmark dashboard | No |
| `/auth/github/callback` | `src/routes/auth/github/callback.tsx` | OAuth callback handler | No |

### Root Layout (`src/routes/__root.tsx`)

- Wraps all routes with `AuthProvider`
- Renders `<Header />` and `<Footer />`
- Route generation: `npm run generate-routes`

---

## 🎨 Styling System

### Tailwind CSS v4

Uses the new `@theme` directive syntax (NOT the old `tailwind.config.js`):

```css
@theme {
  --color-primary: #EE3124;
  --color-ink: #E6EDF3;
  --color-canvas: #0d1117;
  --color-surface-1: #161b22;
  /* ... etc */
}
```

### CSS Custom Properties

All theme values are also available as CSS custom properties:

```css
color: var(--ink);
background: var(--surface-1);
border: 1px solid var(--border);
```

### Key Classes

| Class | Purpose |
|-------|---------|
| `.page-wrap` | Max-width container (1080px) |
| `.panel` | Card with glass effect |
| `.panel-elevated` | Elevated card variant |
| `.feature-card` | Feature card with hover effect |
| `.btn` / `.btn-primary` | Button base + primary variant |
| `.severity-badge-*` | Severity level badges |
| `.code-block` | Monospace code display |
| `.table-shell` / `.table-data` | Table wrapper + data table |

### Magic UI Components

Pre-built animated components in `src/components/magicui/`:
- `animated-beam.tsx`, `particles.tsx`, `meteors.tsx`
- `marquee.tsx`, `retro-grid.tsx`, `shimmer-button.tsx`
- `bento-grid.tsx`, `numbered-ticker.tsx`, `orbiting-circles.tsx`
- `text-reveal.tsx`, `beam-network.tsx`, `animated-gradient-text.tsx`

---

## 🗄 Database Schema

### Tables (`src/schemas/index.ts`)

```typescript
users:      id (uuid), github_id, username, avatar_url, created_at
repos:      id (uuid), user_id (FK users), github_repo_id, full_name, connected_at
scans:      id (uuid), user_id (FK users), repo_id (FK repos),
            source_type (manual|github_pr), source_ref, raw_diff,
            trust_score, status (pending|complete|failed), created_at, completed_at
findings:   id (uuid), scan_id (FK scans), pattern_type, file_path,
            line_start, line_end, confidence, explanation,
            evidence_excerpt, user_verdict (unreviewed|confirmed|false_positive)
```

### Drizzle Config

```env
DATABASE_URL=postgresql://...
```

Migration commands:
```bash
npx drizzle-kit push    # Push schema to DB
npx drizzle-kit migrate # Run migrations
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | ✅ OAuth | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ OAuth | GitHub OAuth App Client Secret |
| `SESSION_SECRET` | ✅ OAuth | 32+ char random string for cookie signing |
| `DATABASE_URL` | ❌ (optional) | Neon Postgres connection string |
| `VERCEL_URL` | ✅ (auto) | Auto-set by Vercel deployment |

---

## 🛠 Development Workflow

### Running Locally

```bash
npm install
npm run dev            # Dev server on localhost:3000
npm run generate-routes # Re-generate route tree after adding routes
npx tsc --noEmit       # Type check
npm run mantiz-scan    # Run Mantiz CLI against current changes
```

### Build & Deploy

```bash
npm run build
npm run preview        # Preview production build
```

### Adding a New Route

1. Create file in `src/routes/` (e.g., `src/routes/about/index.tsx`)
2. Export using `createFileRoute('/about/')({ component: AboutPage })`
3. Run `npm run generate-routes` to update `routeTree.gen.ts`
4. Add to `NAV_LINKS` in `Header.tsx` if needed

### Adding a New Detector

1. Create file in `src/detectors/` (e.g., `src/detectors/my-detector.ts`)
2. Export a function matching: `(files: ParsedDiff[]) => Finding[]`
3. Import and register in `engine.ts` → `scanDiff()` function
4. Add confidence penalty weight in `CONFIDENCE_PENALTY` object
5. Add auto-healer instruction in `generateFixInstructions()` function
6. Add pattern type to `types.ts` → `PatternType` union
7. Add to Drizzle schema if persisting findings

### Adding a New Server Function

1. Add function in `src/server/auth.ts` (or new server file)
2. Use `createServerFn({ method: 'GET' | 'POST' })`
3. For POST with typed data: add `.validator((input) => input as MyType)`
4. Use `.handler(async ({ data }) => { ... })` to access validated data

### TypeScript Configuration

- **Strict mode** enabled (`tsconfig.json`)
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters: true` — no dead code allowed
- Path aliases: `#/*` → `./src/*`, `@/*` → `./src/*`

---

## 🧪 Testing

```bash
npm run test           # Vitest unit tests
npm run mantiz-scan    # Run Mantiz CLI against changes
npx tsc --noEmit       # Type check
```

---

## 📤 Commit Convention

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Code restructuring
test:     Tests
chore:    Tooling, config, CI/CD
style:    Formatting only
```

---

## 🧠 Key Decisions

### Why TanStack Start instead of Next.js?
- TanStack Router has superior TypeScript inference
- `createServerFn` provides type-safe RPC without API routes
- Better support for isomorphic code patterns

### Why POST for getSession?
- TanStack Start handles POST server functions differently — they have full access to `getCookie()` from the request context. GET functions sometimes lose cookie context.

### Why sessionStorage fallback?
- After OAuth callback, the redirect to `/` can cause a flash where the cookie hasn't propagated yet
- sessionStorage provides instant auth state while the server verifies in background

### Why POST for server functions with data?
- TanStack Start's `createServerFn` with POST requires `.validator()` to type the data parameter
- The handler receives `{ data }` from the destructured argument, not `args.data`

### Why fallback diff parser?
- The npm `diff` package's `parsePatch()` is strict — throws on malformed diffs
- Users might paste partial or malformed diffs; the app should handle gracefully

### Why 3 dataset benchmark?
- Judges want proof that the detectors work across different scenarios
- Dataset A (honest), B (cheating), C (evasion) covers the full spectrum
- Shows Mantiz correctly scores each profile

---

## ⚠️ Common Pitfalls

### 1. `createServerFn` with POST data
**❌ Wrong:**
```typescript
export const fn = createServerFn({ method: 'POST' }).handler(
  async (args: { data: MyType }) => { const d = args.data }
)
```
**✅ Correct:**
```typescript
export const fn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => input as MyType)
  .handler(async ({ data }) => { /* use data directly */ })
```

### 2. Import types correctly
```typescript
// ✅ Correct (verbatimModuleSyntax enabled)
import type { Finding } from './types'
import { scanDiff } from './engine'

// ❌ Wrong - breaks verbatimModuleSyntax
import { Finding } from './types'
```

### 3. UseEffect cleanup with async
Always put `return () => clearTimeout(...)` at the TOP level of useEffect, not inside an async function:
```typescript
useEffect(() => {
  let timer: ReturnType<typeof setTimeout>
  const doAsync = async () => {
    await something()
    timer = setTimeout(...)
  }
  doAsync()
  return () => clearTimeout(timer)  // ← top level!
}, [])
```

### 4. ParsedDiff type from diff-parser
The `ParsedDiff` type has `newFile` but NOT `oldFile` in the fallback parser output. Always use `file.newFile || file.oldFile || 'unknown'` for display.

### 5. Route generation
After creating a new route file, run `npm run generate-routes` to update `routeTree.gen.ts`. Without this, the route won't be registered.

### 6. Tailwind v4 syntax
Use `@theme` in CSS, NOT `tailwind.config.js`. Class-based responsive is the same (`md:flex`), but color references use `--color-*` variables.

### 7. Framed motion layout animations
When using `layoutId` for shared layout animations, wrap the elements in `<LayoutGroup>` from framer-motion:
```typescript
import { LayoutGroup } from 'framer-motion'
<LayoutGroup>
  {items.map(item => <motion.div layoutId="shared-id" />)}
</LayoutGroup>
```

---

## 📚 Reference Files

| File | Purpose |
|------|---------|
| `.rules/ai-agent-workflow.md` | AI Agent workflow instructions (Loop, OAuth, PR scan) |
| `LOOP.md` | 15 iteration development log |
| `LOOP.template.md` | Loop log template |
| `PLAN.md` | Development plan + submission checklist |
| `DESIGN.md` | Architecture decisions |
| `Mantiz-PRD.md` | Product requirements document |
| `README.md` | Public-facing project README |

---

> **Last updated:** 2 Jul 2026
> **Maintainer:** AI Agent working on Mantiz
> **Tip:** If something is missing from this context, add it! This file is meant to grow with the project.
