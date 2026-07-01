# AI Agent System Rules — Mantiz

This file contains core guidelines for AI coding agents developing or maintaining Mantiz.

## 🧠 S3 Loop Engineering Workflow

Every time you modify the codebase, you MUST execute the following verification loop:

```
1. WRITE   → Implement features or fix bugs.
2. SCAN    → Run "npm run mantiz-scan" (Mantiz scans local diff for cheating).
3. VERIFY  → Run "testsprite test run <test-id> --target-url <live-url> --wait".
4. FIX     → If tests fail, get failure bundle via "testsprite test artifact get <run-id>", fix issues.
5. LOG     → Update LOOP.md to document the iteration.
```

## 🔐 Core Architecture

* **Scan Engine**: Unified detector at `src/detectors/engine.ts` supporting 6 detectors (Assertion Tampering, Mock Abuse, Hallucinated Matchers, claim-diff mismatch, silent catches, disabled assertions).
* **CLI Engine**: Entry points at `packages/mantiz-cli` (NPM client) and `src/cli/scan.ts` (local loop checker).
* **Web UI**: TanStack Start app deployed on Vercel utilizing Neon Postgres DB for saving scan history.
