# 🗺️ LOOP.md — Mantiz Agentic Loop Log

TestSprite Season 3 Hackathon — "Build the Loop"

| # | Maker | Action | Score | Findings | Status | Next Step | Date |
|---|---|---|---|---|---|---|---|
| 1 | Agent | Setup TanStack Start + Vite + Tailwind v4 + deploy Vercel | 100 | None | PASSED | Build diff parser & detector 1 | 30 Jun |
| 2 | Agent | Create diff parser (npm diff), disabled-assertion detector, scan page UI | 100 | None | PASSED | Add remaining 4 detectors | 1 Jul |
| 3 | Agent | Add assertion-tampering detector — compares old vs new assertion values | 100 | None | PASSED | Add mock-to-avoid & silent-catch | 2 Jul |
| 4 | Agent | Add mock-to-avoid, claim-diff-mismatch, silent-catch-and-pass detectors | 55 | Multiple false positives on claim-diff | BLOCKED | Tune detector confidence thresholds | 2 Jul |
| 5 | Agent | Tune claim-diff detector: reduce noise, improve file pattern matching | 100 | None | PASSED | Setup TestSprite CLI | 2 Jul |
| 6 | Agent | Setup TestSprite CLI + API key. Create Mantiz CLI (src/cli/scan.ts) | 100 | None | PASSED | Build LOOP.md auto-logging | 2 Jul |
| 7 | Agent | Add LOOP.md auto-log to CLI, GitHub Actions workflow, system rules | 70 | Empty catch in workflow file detected | BLOCKED | Fix empty catch block in GA workflow | 3 Jul |
| 8 | Agent | Fix empty catch in workflow file — add proper error handling | 100 | None | PASSED | Implement GitHub OAuth | 3 Jul |
| 9 | Agent | GitHub OAuth: startLogin, handleCallback, session cookies, auth context | 100 | None | PASSED | Build PR scan page | 3 Jul |
| 10 | Agent | Build PR scan page — paste PR URL, Octokit fetch diff, run 5 detectors | 100 | None | PASSED | Fix diff parser crash on malformed diffs | 3 Jul |
| 11 | Agent | Fix parsePatch crash — add try-catch + fallback parser for malformed diffs | 100 | None | PASSED | Add sessionStorage fallback for auth | 3 Jul |
| 12 | Agent | Auth fix: sessionStorage fallback, POST for getSession, background verify | 100 | None | PASSED | Redesign responsive navbar | 3 Jul |
| 13 | Agent | Redesign navbar: mobile slide-in drawer, desktop animated active indicator | 100 | None | PASSED | Build benchmark fixtures | 4 Jul |
| 14 | Agent | Create 6 benchmark fixtures across 3 datasets (honest, cheating, evasion) | 100 | None | PASSED | Build benchmark runner + dashboard | 4 Jul |
| 15 | Agent | Build benchmark runner + /benchmark dashboard + auto-healer fix instructions | 100 | None | PASSED | Final polish + submit | 4 Jul |

---

## Summary

- **Total iterations:** 15
- **Total fixes:** 3 (false positive tuning, empty catch, auth cookie)
- **TestSprite CLI connected:** ✅
- **GitHub Actions CI/CD:** ✅
- **All 5 detectors operational:** ✅
- **Benchmark 3 datasets:** ✅
