# Contributing to Mantiz

Thanks for your interest in contributing to Mantiz! This project is part of the [TestSprite Season 3 Hackathon](https://www.testsprite.com/hackathon-s3), and we welcome contributions that improve detection accuracy, add new patterns, or enhance the developer experience.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding a New Detector](#adding-a-new-detector)
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
npm install

# Copy environment variables
cp .env.example .env
# Add your DATABASE_URL (Neon Postgres recommended)

# Start the dev server
npm run dev

# Run typechecking
npx tsc --noEmit

# Run tests
npm test
```

## Project Structure

```
src/
├── detectors/          # Detection pattern engines (one file per pattern)
│   ├── types.ts        # Shared types (Finding, ParsedDiff, Confidence, FileImportance)
│   ├── diff-parser.ts
│   ├── engine.ts       # Orchestrator — runs all 11 detectors
│   ├── disabled-assertion.ts
│   ├── assertion-tampering.ts
│   ├── mock-to-avoid.ts
│   ├── claim-mismatch.ts
│   ├── silent-catch.ts
│   ├── hallucination.ts
│   ├── ai-assisted.ts  # LLM-powered detection (Fireworks/Groq)
│   ├── ast-analyzer.ts # Babel AST parser for JS/TS
│   ├── tree-sitter-analyzer.ts  # Multi-language WASM AST
│   ├── historical-scoring.ts    # Author behavioral tracking
│   ├── mutation-susceptibility.ts
│   └── heal-engine.ts  # Auto-fix for detected patterns
├── server/            # Server functions (tokens, settings, webhook, verdict)
├── routes/            # TanStack file-based routes
├── components/        # Reusable UI components
├── schemas/           # Drizzle database schemas (users, scans, findings, apiTokens, userSettings, webhookEvents)
├── lib/               # DB init, auth context, query client (TanStack Query)
├── styles.css         # Global styles

packages/
├── mantiz-core/       # Standalone detection engine (published to npm)
└── mantiz-cli/        # CLI tool (published to npm)
```

## Adding a New Detector

1. Create a new file in `src/detectors/` (e.g., `my-pattern.ts`)
2. Export a function matching the `DetectorFn` type: `(files: ParsedDiff[]) => Finding[]`
3. Add your pattern type to the `PatternType` union in `types.ts`
4. Register your detector in `engine.ts` (add it to the detectors array)
5. Add a sample to the Load Sample dataset in the scan page
6. Add test fixtures to `fixtures/` for benchmarking

### Detector Guidelines

- **Prefer static analysis** (regex or AST) over LLM calls for speed and accuracy
- **Avoid false positives** on Dataset A (honest code) — target >90 trust score
- **Name your files** with kebab-case matching the pattern type
- Each detector should handle edge cases: empty hunks, malformed diffs, missing files

## Coding Standards

- **Language:** TypeScript with strict mode
- **Framework:** TanStack Start (React 19)
- **Styling:** Tailwind CSS v4 with utility classes
- **Icons:** Lucide React
- **Formatting:** Single quotes, 2-space indent, no semicolons (prettier defaults)
- **No `any` types** — use proper TypeScript types
- All new exports must have a JSDoc comment

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

feat(detector): add mock-to-avoid detection pattern
fix(scan): handle empty diff edge case
docs(readme): add benchmark results
chore(deps): update react to 19.2
```

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`

## Pull Request Process

1. Ensure your code passes typechecking: `npx tsc --noEmit`
2. Ensure tests pass: `npm test`
3. Update relevant documentation if adding/changing features
4. Open a PR against the `main` branch
5. Reference any related issues in the PR description

## Reporting Issues

- **Bug reports:** Include the diff that caused the issue, expected vs actual trust score
- **Feature requests:** Describe the cheating pattern you want detected
- **Security issues:** See [SECURITY.md](SECURITY.md) for responsible disclosure

---

## AI Agent System Rules

If you're using an AI coding agent (Claude Code, Aider, etc.) to develop Mantiz, include these rules in your agent's instructions:

> **System Rules for AI Coding Agent:**
>
> You are an AI Coding Agent building Mantiz — an AI lie detector for coding agents.
> You MUST follow the TestSprite S3 "Build the Loop" workflow:
>
> 1. After EVERY code change, run `npm run mantiz-scan`
> 2. Read the results — if trust score < 70, your code was flagged as suspicious
> 3. Fix the code honestly (remove `.skip()`, fill empty catch blocks, fix assertions properly)
> 4. Re-scan with `npm run mantiz-scan` until score >= 70
> 5. Append results to LOOP.md (the CLI does this automatically)
> 6. Never skip the scan step or fake the results
> 7. Each iteration = one row in LOOP.md — aim for 10+ iterations

---

Thank you for helping make Mantiz a robust honesty checker for AI coding agents! 🦗✨
