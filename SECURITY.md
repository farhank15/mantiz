# Security Policy

## Supported Versions

As Mantiz is currently in active development as part of the TestSprite Hackathon, only the latest commit on the `main` branch is supported with security updates.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in Mantiz, please follow responsible disclosure:

1. **Do not** create a public GitHub issue for the vulnerability
2. **Do not** post about it in public forums or social media
3. **Do** send a private report to: **[farhankurnia15@example.com](mailto:farhankurnia15@example.com)** (replace with actual email)

### What to include in your report

- **Type of vulnerability** (e.g., XSS, remote code execution, data exposure)
- **Affected area** (e.g., diff parser, scan results, API endpoint)
- **Steps to reproduce** — include a sample payload if possible
- **Impact** — what an attacker could achieve
- **Suggested fix** (optional but appreciated)

### Response Timeline

- **48 hours:** Acknowledgment of receipt
- **7 days:** Initial assessment and remediation plan
- **14 days:** Fix deployed or mitigation in place

## Scope

The following are in scope for security reports:
- The Mantiz web application (`https://mantiz-wine.vercel.app`)
- The detection engine (`src/detectors/`)
- API endpoints and data handling

The following are **out of scope**:
- Dependencies with known CVEs (report those to the respective maintainers)
- Theoretical attacks requiring physical access

## Safe Harbor

We will not pursue legal action against security researchers who:
- Follow this disclosure policy
- Act in good faith
- Avoid exploiting vulnerabilities beyond what's necessary for verification

## Hall of Fame

We maintain a private Hall of Fame for valid security reports. Contributors who report valid vulnerabilities will be acknowledged (with permission).

---

Thank you for helping keep Mantiz and its users safe. 🔒
