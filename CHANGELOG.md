# Changelog

All notable changes to Mantiz will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **user_settings** table — per-user threshold, AI toggle, minScore, webhook URL
- **webhook_events** table — delivery history tracking with retry status
- **Settings page** — scan settings UI (threshold slider, AI toggle, minScore, webhook URL + test + history)
- **Webhook v2** — 3x retry with exponential backoff, HMAC-SHA256 signing, event types (scan.completed/scan.failed)
- **CLI `--save` flag** — persist scan results to cloud history (requires `--token`)
- **CLI `--ai` flag** — enable AI-assisted detection from CLI
- **`/api/scan` `useAi` param** — AI detection support for API scans
- **User Verdict** — tag findings as confirmed / false_positive in history modal
- **File importance weighting** — findings in config/docs/artifact get reduced score penalty
- **GitHub Action `use-ai` input** — enable AI detection from reusable action

### Changed
- **Threshold system** — moved from hardcoded 70 to per-user configurable setting
- **Scoring** — added file importance multipliers (core/test=1.0, config=0.5, docs=0.3, artifact=0.05)
- **`/api/scan`** — now loads user settings for threshold + AI detection + webhook delivery
- **`testWebhook`** — converted to `createServerFn` for safe client-side invocation

### Infrastructure
- **Migration 0004** — added `user_settings` + `webhook_events` tables
- **New env var:** `WEBHOOK_SECRET` — for HMAC webhook signing

---

_Mantiz is built for the TestSprite Season 3 Hackathon._
