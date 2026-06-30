# Changelog

All notable changes to Mantiz will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Detection engine** with 5 pattern detectors:
  - Disabled Assertion — detects commented-out assertions, `.skip()`, `if(false)` blocks
  - Assertion Tampering — detects changed expected values without source logic changes
  - Mock-to-Avoid-Failure — detects mock-heavy diffs with low real-path coverage
  - Claim-Diff Mismatch — compares commit message intent with actual changes
  - Silent Catch-and-Pass — detects empty `catch {}` blocks swallowing errors
- **Diff parser** — parses unified git diffs into structured hunks using `parsePatch`
- **Trust Score** (0-100) — weighted scoring by confidence level
- **Scan page** — paste diff → scan → results with expandable findings
- **Landing page** — redesigned with Detection Patterns grid, Loop Architecture section
- **Benchmark dataset** — 3 scenarios: Honest Code, Cheating AI, Smart Evasion AI
- **Auto-Healer remediation** — AI-agent-friendly fix instructions in scan results

### Changed
- **UI overhaul** — Migrated to Lucide icons throughout, bento-grid layout for detection patterns
- **README** — Complete rewrite with badges, features table, quick start, tech stack
- **GitHub links** — Fixed to point to farhank15/mantiz

### Infrastructure
- **Deployed** to [mantiz-wine.vercel.app](https://mantiz-wine.vercel.app)
- **PLAN.md** — Revised strategy focusing on detectors → benchmark → LOOP.md
- **Added** standard open-source files: LICENSE, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, .npmrc, .editorconfig, .gitattributes, SUPPORT.md

---

_Mantiz is built for the TestSprite Season 3 Hackathon._
