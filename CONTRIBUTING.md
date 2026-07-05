# Contributing to Mantiz

Thanks for your interest in contributing to Mantiz! This project is part of the [TestSprite Season 3 Hackathon](https://www.testsprite.com/hackathon-s3), and we welcome contributions that improve detection accuracy, add new patterns, or enhance the developer experience.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding a New Detector](#adding-a-new-detector)
- [Adding Multi-Language Support](#adding-multi-language-support)
- [Coding Standards](#coding-standards)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its terms.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/mantiz.git`
3. Create a feature branch: `git checkout -b feat/your-feature-name`

## Development Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Add your DATABASE_URL (Neon Postgres recommended)

# Start the dev server
pnpm run dev

# Run typechecking
npx tsc --noEmit

# Run tests
npm test
```

## Project Structure

```
src/
├── detectors/              # Detection pattern engines (one file per pattern)
│   ├── types.ts            # Shared types (Finding, ParsedDiff, Confidence, FileImportance)
│   ├── diff-parser.ts      # Parse raw git diff → ParsedDiff[]
│   ├── engine.ts           # Orchestrator — runs all detectors (sync + async)
│   ├── language-registry.ts # Multi-language config — 7 languages, test framework patterns
│   ├── disabled-assertion.ts
│   ├── assertion-tampering.ts
│   ├── mock-to-avoid.ts
│   ├── claim-mismatch.ts
│   ├── silent-catch.ts
│   ├── hallucination.ts
│   ├── ai-assisted.ts      # LLM-powered detection (Fireworks/Groq) + RAG context injection
│   ├── ai-judge.ts         # LLM-powered false positive filter
│   ├── ast-analyzer.ts     # Babel AST parser for JS/TS
│   ├── tree-sitter-analyzer.ts  # Multi-language WASM AST (8 languages)
│   ├── tree-sitter-manager.ts   # WASM parser loader
│   ├── historical-scoring.ts    # Author behavioral tracking
│   ├── mutation-susceptibility.ts
│   └── heal-engine.ts      # Auto-fix — template-based + AI-driven patch generation
├── server/                 # Server-side logic
│   ├── auth.ts             # GitHub OAuth + server functions (scanPR, scanDiff, getScanHistory)
│   ├── github-app.ts       # GitHub App JWT auth + webhook HMAC verify + installation CRUD
│   ├── github-pr-comment.ts # Post PR review comments + check runs + suggested changes
│   ├── repo-indexer.ts     # Fetch repo files via GitHub API → index to Qdrant
│   ├── code-indexer.ts     # Tree-sitter chunking → embedding → Qdrant upsert
│   ├── code-rag.ts         # Qdrant client + searchSymbol + buildRagContext
│   ├── embedding-provider.ts # Embedding abstraction (Fireworks primary, OpenAI fallback)
│   ├── tokens.ts           # API token generation, verification, scan save
│   ├── settings.ts         # Per-user settings (threshold, AI toggle, webhook URL)
│   ├── webhook.ts          # Webhook delivery to user-defined endpoints
│   ├── share.ts            # Share link generation
│   ├── verdict.ts          # User verdict (confirmed/false positive)
│   ├── rate-limiter.ts     # Sliding window rate limiter (3 tiers)
│   └── middleware.ts       # Validation helpers
├── routes/                 # TanStack file-based routes
│   ├── index.tsx           # Landing page
│   ├── scan/index.tsx      # Manual diff scan
│   ├── pr-scan/index.tsx   # PR URL scan
│   ├── login/index.tsx     # GitHub OAuth login
│   ├── history/index.tsx   # Scan history + findings modal + user verdict
│   ├── settings/index.tsx  # Settings + API token management
│   ├── benchmark/index.tsx # Benchmark dashboard
│   ├── share/$id.tsx       # Public share link
│   └── api/
│       ├── scan.tsx        # Public API endpoint (POST /api/scan)
│       ├── mock-login.tsx  # E2E test auth bypass
│       └── github/
│           ├── webhook.tsx # GitHub App webhook receiver
│           └── callback.tsx # OAuth callback
├── components/             # Reusable UI components
│   ├── Header.tsx, Footer.tsx, PageHeader.tsx, etc.
│   └── magicui/            # Magic UI animated components
├── schemas/                # Drizzle ORM schemas (11 tables)
└── lib/                    # DB init, auth context, query client

packages/
├── mantiz-core/            # Standalone detection engine (published to npm)
│   ├── src/
│   │   ├── engine.ts       # Core engine (sync + async)
│   │   ├── diff-parser.ts  # Diff → ParsedDiff[]
│   │   ├── language-registry.ts  # Multi-language config
│   │   ├── detectors/      # 6 detectors — all multi-language via language-registry.ts
│   │   └── types.ts        # Finding, ParsedDiff, Confidence, FileImportance, PatternType
│   └── README.md
└── mantiz-cli/              # CLI tool (published to npm)
    ├── src/index.ts         # CLI entry — git diff → scan → output
    └── README.md
```

## Adding a New Detector

1. Create a new file in `src/detectors/` (e.g., `my-pattern.ts`)
2. Export a function matching the `DetectorFn` type: `(files: ParsedDiff[]) => Finding[]`
3. Add your pattern type to the `PatternType` union in `types.ts`
4. Register your detector in `engine.ts`
5. Add test fixtures to `tests/fixtures/` for benchmarking

### Detector Guidelines

- **Prefer static analysis** (regex or AST) over LLM calls for speed
- **Avoid false positives** on honest code — target >90 trust score
- **Support multi-language** via `language-registry.ts` — don't hardcode JS/TS patterns
- Each detector should handle edge cases: empty hunks, malformed diffs, missing files

## Adding Multi-Language Support

All detectors share a centralized `language-registry.ts` that defines:

```typescript
interface LanguageConfig {
  name: string
  extensions: string[]
  testPatterns: {
    skipAllTests?: string[]      // Patterns for skipping entire suites
    skipSingleTest?: string[]    // Patterns for skipping individual tests
    conditionalSkip?: string[]   // Patterns like if(false), if env var
    assertionTamper?: string[]   // Assertion patterns per language
    mockPatterns?: string[]      // Mock/ stub/ spy patterns
    catchPatterns?: string[]     // Catch/ except/ rescue patterns
  }
}
```

To add a new language:
1. Add a new entry to `LANGUAGE_CONFIG` in `language-registry.ts`
2. Add file extensions to `SUPPORTED_EXTENSIONS`
3. Add test framework patterns
4. Add Tree-sitter WASM parser config (optional, for AST analysis)

## Coding Standards

- **Language:** TypeScript with strict mode
- **Framework:** TanStack Start (React 19)
- **Styling:** Tailwind CSS v4 with utility classes
- **Icons:** Lucide React
- **Formatting:** Single quotes, 2-space indent, no semicolons
- **No `any` types** — use proper TypeScript generics
- All new exports must have a JSDoc comment

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

feat(detector): add mock-to-avoid detection pattern
fix(scan): handle empty diff edge case
docs(readme): add multi-language benchmark results
chore(deps): update react to 19.2
```

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`

## Pull Request Process

1. Ensure your code passes typechecking: `npx tsc --noEmit`
2. Ensure tests pass: `npm test`
3. If updating detectors, run the CI gate: `npx tsx scripts/eval/ci-check.ts`
4. Update relevant documentation if adding/changing features
5. Open a PR against the `main` branch

## Reporting Issues

- **Bug reports:** Include the diff that caused the issue, expected vs actual trust score
- **Feature requests:** Describe the cheating pattern you want detected
- **Security issues:** See [SECURITY.md](SECURITY.md) for responsible disclosure

---

Thank you for helping make Mantiz a robust honesty checker for AI coding agents! 🦗✨
