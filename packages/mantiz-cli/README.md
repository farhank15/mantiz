# @mantiz/cli

**Mantiz CLI — AI lie detector for coding agents.**

Scan git diffs for AI agent cheating patterns — like a polygraph for your test suite.

## Installation

```bash
npm install -g @mantiz/cli
```

Or run without installation:

```bash
npx @mantiz/cli
```

## Usage

```bash
# Scan your current git diff
mantiz-scan

# Scan with JSON output (for CI)
mantiz-scan --json

# Scan a specific diff file
mantiz-scan --diff "$(cat my-diff.diff)"

# Cloud scan with API token (results saved to your history)
mantiz-scan --token mtz_abc123

# Cloud scan + persist results to your Mantiz history
mantiz-scan --token mtz_abc123 --save

# Enable AI-assisted detection (LLM-powered semantic analysis)
mantiz-scan --token mtz_abc123 --ai

# Help
mantiz-scan --help
```

## CI/CD Integration

```yaml
# .github/workflows/mantiz.yml
name: Mantiz Scan
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx @mantiz/cli --token ${{ secrets.MANTIZ_API_TOKEN }} --save --ai
```

Get your API token at: https://mantiz-wine.vercel.app/settings

## Exit Codes

- `0` — All clean (Trust Score ≥ 70)
- `1` — Cheating detected (Trust Score < 70)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MANTIZ_API_TOKEN` | API token for cloud scan mode |
| `MANTIZ_API_URL` | API URL (default: https://mantiz-wine.vercel.app) |

## Features

- **`--save`** — Persist scan results to your Mantiz cloud history (requires `--token`)
- **`--ai`** — Enable AI-assisted detection using LLM (Fireworks/Groq)
- **`--json`** — Output results as JSON for CI/CD pipelines
- **Threshold** — Default 70. Configure per-user in [Settings](https://mantiz-wine.vercel.app/settings)
