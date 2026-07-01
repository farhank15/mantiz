# AI Agent System Rules — Mantiz

> Instruksi untuk AI coding agent (Claude Code, Aider, Cursor, dll.)
> yang bekerja pada project Mantiz — AI Lie Detector untuk coding agent.

---

## 🧠 Core Workflow: Build the Loop

Kamu adalah AI Coding Agent yang membangun Mantiz. Setiap kali kamu mengubah kode, kamu WAJIB mengikuti prosedur ini:

### Step-by-Step Loop

```
1. WRITE   → Tulis/ubah kode fitur
2. SCAN    → npm run mantiz-scan        (Mantiz mendeteksi kecurangan)
3. CHECK   → Baca hasil scan
4. FIX     → Jika score < 70, perbaiki kode secara jujur
5. RESCAN  → npm run mantiz-scan        (Ulang sampai score >= 70)
6. LOG     → LOOP.md sudah terisi otomatis oleh CLI
7. REPEAT  → Lanjut fitur berikutnya
```

### Aturan Penting
- ❌ Jangan pernah skip langkah SCAN
- ❌ Jangan pernah hapus atau ubah LOOP.md secara manual
- ❌ Jangan pernah `.skip()` test, comment out assertion, atau bikin catch block kosong
- ✅ Kalau Mantiz blokir (exit code 1), baca findings-nya dan perbaiki dengan jujur
- ✅ Target: 10+ iterasi di LOOP.md sebelum deadline

---

## 🔐 GitHub OAuth Flow

Mantiz menggunakan GitHub OAuth untuk mengakses PR dan mendeteksi kecurangan.

### Arsitektur

```
Browser                    Server (TanStack Start)          GitHub
  │                             │                             │
  │  1. Klik "Sign In"         │                             │
  │ ─────────────────────────▶ │                             │
  │                             │  2. startLogin()           │
  │                             │  - Generate state           │
  │                             │  - Set oauth_state cookie   │
  │                             │  - Return GitHub URL        │
  │                             ├────────────────────────────▶│
  │  3. window.location.href   │                             │
  │ ◀───────────────────────── │                             │
  │                             │                             │
  │  4. Redirect ke GitHub     │                             │
  │ ────────────────────────────────────────────────────────▶│
  │                             │                             │
  │  5. User authorize app     │                             │
  │ ◀────────────────────────────────────────────────────────│
  │                             │                             │
  │  6. Callback ke app        │                             │
  │    /auth/github/callback   │                             │
  │    ?code=xxx&state=yyy     │                             │
  │ ─────────────────────────▶ │                             │
  │                             │  7. handleCallback()       │
  │                             │  - Verify state cookie     │
  │                             │  - Exchange code → token   │
  │                             │  - Fetch user info          │
  │                             │  - Set session cookie       │
  │                             │                             │
  │  8. Redirect ke /          │                             │
  │ ◀───────────────────────── │                             │
```

### File Penting

| File | Fungsi |
|------|--------|
| `src/server/auth.ts` | Server functions: `startLogin`, `handleCallback`, `getSession`, `logout`, `scanPR` |
| `src/lib/auth-context.tsx` | React context: `AuthProvider`, `useAuth()` hook |
| `src/routes/auth/github/callback.tsx` | Callback page — handles OAuth code exchange |
| `src/routes/login/index.tsx` | Login page |
| `src/routes/pr-scan/index.tsx` | PR scan page |
| `src/components/Header.tsx` | Updated with auth UI (Sign In, user menu) |

### Session Management
- Session disimpan di HTTP-only cookie: `mantiz_session`
- Cookie di-sign dengan HMAC-SHA256 menggunakan `SESSION_SECRET`
- Session expiry: 7 hari
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`

### Environment Variables
```env
GITHUB_CLIENT_ID=ov23li...     # Dari GitHub OAuth App
GITHUB_CLIENT_SECRET=...        # Dari GitHub OAuth App
SESSION_SECRET=...              # Minimal 32 karakter random
```

### Setup GitHub OAuth App
1. Buka https://github.com/settings/developers
2. New OAuth App → isi:
   - **Application name:** Mantiz
   - **Homepage URL:** `https://mantiz-wine.vercel.app`
   - **Authorization callback URL:**
     ```
     http://localhost:3000/auth/github/callback
     https://mantiz-wine.vercel.app/auth/github/callback
     ```
3. Copy `Client ID` dan `Client Secret` ke `.env`

---

## 📦 PR Scan Flow

### Cara Kerja
1. User paste PR URL: `https://github.com/owner/repo/pull/123`
2. `scanPR()` server function dipanggil
3. Validasi session → parse PR URL
4. Fetch PR diff dari GitHub API (`application/vnd.github.v3.diff`)
5. Fetch PR metadata via Octokit
6. Jalankan 5 detectors terhadap diff
7. Tampilkan hasil: trust score + findings

### File Penting
| File | Fungsi |
|------|--------|
| `src/server/auth.ts` | `scanPR()` — fetch diff + run detectors |
| `src/routes/pr-scan/index.tsx` | PR scan page UI |

### Error Handling
- **Not authenticated:** Tampilkan error + link ke `/login`
- **Invalid PR URL:** Validasi regex `github.com/owner/repo/pull/123`
- **GitHub API error:** Tampilkan status code error
- **Session expired:** Hapus cookie, redirect ke login

---

## 🔄 Integration dengan 5 Detectors

Semua flow (CLI, Web, PR Scan) menggunakan engine yang sama:

```ts
import { scanDiff } from '../detectors/engine'
const result = scanDiff(diffText)
// result.trustScore → 0-100
// result.findings → array of detections
// result.summary → stats
```

### 5 Detectors
| # | Detector | Confidence Weight | File |
|---|----------|------------------|------|
| 1 | Disabled Assertion | high=30, medium=15, low=5 | `src/detectors/disabled-assertion.ts` |
| 2 | Assertion Tampering | high=30 | `src/detectors/assertion-tampering.ts` |
| 3 | Mock-to-Avoid-Failure | high=30, medium=15 | `src/detectors/mock-to-avoid.ts` |
| 4 | Claim-Diff Mismatch | high=30, medium=15, low=5 | `src/detectors/claim-mismatch.ts` |
| 5 | Silent Catch-and-Pass | high=30, medium=15, low=5 | `src/detectors/silent-catch.ts` |

---

## 🧪 Testing Checklist

### Test OAuth Flow
```
[ ] Login dengan GitHub → redirect ke GitHub
[ ] Authorize app → redirect balik ke /auth/github/callback
[ ] Callback berhasil → session cookie ter-set → redirect ke /
[ ] Header menunjukkan avatar + username
[ ] Klik Sign Out → session cookie terhapus
[ ] Akses /pr-scan tanpa login → error + link login
```

### Test PR Scan
```
[ ] Paste PR URL valid → fetch diff → scan → tampilkan hasil
[ ] Paste PR URL invalid → error message
[ ] Paste PR URL repositori private (tanpa akses) → error
[ ] Scan PR bersih → trust score >= 80
[ ] Scan PR curang → trust score < 70
```

### Test OAuth di Localhost
Kalo test di localhost, pastikan GitHub OAuth App settings udah include:
```
http://localhost:3000/auth/github/callback
```
