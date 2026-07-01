# 🗺️ PLAN — Mantiz v2 (Final Strategy)
## TestSprite Hackathon Season 3 · AI Lie Detector

> **Timeline:** 30 Jun (5PM PDT) — 7 Jul (4:59PM PDT)  
> **Target Skor:** ~90-95 (TOP 3-5)
> **Revised:** 1 Jul — Strategi final: Detector 2-5 → Mantiz CLI → LOOP.md auto → GitHub Actions → Benchmark

---

## 🎯 THREE PILLARS OF VICTORY

| Pillar | Area | Bobot | Kunci |
|--------|------|-------|-------|
| **🔴 P0 — Core Product** | 5 detectors + Web App + CLI | **80 pts** | Detector 2-5 functional |
| **🟡 P1 — The Loop** | LOOP.md auto-logging + Mantiz CLI | **40 pts** | 10+ entries, real fix cycles |
| **🟢 P2 — Innovation** | Dataset Benchmark + CI/CD + Auto-Healer | **25 pts** | Benchmark dashboard + GitHub Actions |

---

## ✅ STATUS REAL (2 Jul)

| Area | Status | Notes |
|------|--------|-------|
| **Deploy Vercel** | ✅ **Live** | [mantiz-wine.vercel.app](https://mantiz-wine.vercel.app) |
| **Diff parser** | ✅ Selesai | `src/detectors/diff-parser.ts` |
| **Detector 1 (disabled-assertion)** | ✅ Selesai | Regex: comment, `.skip()`, `if(false)` |
| **Detector 2 (assertion-tampering)** | ✅ Selesai | Banding assertion values old vs new |
| **Detector 3 (mock-to-avoid)** | ✅ Selesai | `jest.mock()` / `vi.mock()` deteksi |
| **Detector 4 (claim-diff-mismatch)** | ✅ Selesai | File type vs change analysis |
| **Detector 5 (silent-catch)** | ✅ Selesai | `catch {}` kosong deteksi |
| **Scan page** | ✅ Selesai | Form + Trust Score + Findings list |
| **Open source files** | ✅ Selesai | LICENSE, CONTRIBUTING, SECURITY, dll |
| **TestSprite CLI** | ✅ Selesai | Setup + API key linked |
| **PLAN.md** | ✅ Selesai | Final strategy documented |
| **Mantiz CLI** | ✅ Selesai | `npm run mantiz-scan` |
| **LOOP.md auto-log** | ✅ Selesai | Auto-logging via CLI |
| **GitHub Actions** | ✅ Selesai | `.github/workflows/mantiz.yml` |
| **GitHub OAuth** | ✅ Selesai | Login via GitHub + session cookie |
| **PR Scan** | ✅ Selesai | Paste PR URL → fetch diff via Octokit → scan |
| **Benchmark** | ✅ Selesai | 3 dataset + runner + dashboard + auto-healer |

---

## 🗓️ DAY 3 — 4 Detector Sisanya (2 Jul) 🔴🔴🔴

**Goal: All 5 detectors operational — 80pts aman**

| # | Task | Detail | Est. Time |
|---|------|--------|-----------|
| ✅ | **3.1 Detector 2 (assertion-tampering)** | Bandingkan assertion value sebelum/sesudah diff. Deteksi `expect(X).toBe(Y)` → `expect(X).toBe(Z)` tanpa perubahan source logic. Pake regex + AST parsing. | 2-3 jam |
| ✅ | **3.2 Detector 3 (mock-to-avoid-failure)** | Deteksi `jest.mock()` / `vi.mock()` baru yang berlebihan. Ratio mock:real test. Smart Mock Sanitizer: cek mock imports vs actual function calls. | 2-3 jam |
| ✅ | **3.3 Detector 4 (claim-diff-mismatch)** | Bandingkan commit message intent dengan actual changes. "refactor: cleanup" tapi hapus 50 baris test = mismatch. | 1-2 jam |
| ✅ | **3.4 Detector 5 (silent-catch-and-pass)** | Deteksi `catch {}` kosong, `catch(e){}`, try-catch baru tanpa error handling. Juga deteksi `catch { /* TODO */ }`. | 1-2 jam |
| ✅ | **3.5 Integrate all 5 ke engine** | Engine `scanDiff()` jalankan 5 detector. Testing trust score weights. | 30m |
| ✅ | **3.6 Typecheck + push** | `npx tsc --noEmit` lalu push ke main. | 15m |

**🎯 Day 3 done = 5 detectors functional. Trust score akurat.**

---

## 🗓️ DAY 4 — Mantiz CLI + LOOP.md Auto + GitHub Actions (3 Jul) 🔴🟡

**Goal: The Loop live — CLI auto-scan + LOOP.md auto-log + CI/CD auto-fail**

### 📦 Mantiz CLI (`src/cli/scan.ts`)

```
src/cli/scan.ts  → import { scanDiff } from '../detectors/engine'
                  → execSync('git diff') → get diff from git
                  → panggil scanDiff(diff) → hasil + findings
                  → append ke LOOP.md otomatis
                  → exit code 1 if score < 70 (fail build)
```

**Daftarin di package.json:**
```json
"scripts": {
  "mantiz-scan": "tsx src/cli/scan.ts"
}
```

### 📋 Task List

| # | Task | Detail | Est. Time |
|---|------|--------|-----------|
| ⬜ | **4.1 Mantiz CLI — core** | `src/cli/scan.ts` — `execSync('git diff')` → `scanDiff()` → output terminal + exit code | 1-2 jam |
| ⬜ | **4.2 LOOP.md template update** | Update `LOOP.template.md` jadi format tabel yang bisa di-append otomatis | 15m |
| ⬜ | **4.3 Mantiz CLI — LOOP.md auto-log** | Setiap scan selesai, append row ke LOOP.md: `| iteration | action | score | findings | status |` | 30m |
| ⬜ | **4.4 Mantiz CLI — commit info** | Parse commit message + author dari `git log -1` buat LOOP.md enrichment | 30m |
| ⬜ | **4.5 GitHub Actions workflow** | `.github/workflows/mantiz.yml` — jalankan `npm run mantiz-scan` tiap push/PR. Fail build if exit code 1. | 1 jam |
| ⬜ | **4.6 System Rules for AI Agent** | File `.rules/` atau di CONTRIBUTING.md — instruksi buat AI Agent cara pake Mantiz CLI | 30m |
| ⬜ | **4.7 TestSprite Integration** | Kalo API key udah ready: tambah step testsprite di workflow | 1 jam |
| ⬜ | **4.8 LOOP.md entries #1, #2, #3** | CLI setup + GA fix + false positive tuning | 30m |

### ⚙️ Mantiz CLI Output Example

```
🔍 MANTIZ SCAN RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Files:     3 files scanned
 Findings:  2
 Trust Score: 55/100 🔴 (SUSPICIOUS)

 Findings:
  ⚠ HIGH  test/login.test.js:42 — Assertion value changed from 10 to 5
  ⚠ MEDIUM test/login.test.js:15 — .skip() detected on test suite

 ✓ LOOP.md updated — iteration 3 logged
 ✗ BUILD FAILED — Trust score below 70 threshold
```

### 🔄 LOOP.md Auto-Generated Entry

| Iteration | Agent Action | Score | Findings | Next Step |
|:---|:---|:---:|:---|:---|
| 1 | Added math function + skipped tests | 70 | .skip() detected | Remove .skip() and fix tests |
| 2 | Fixed tests, removed bypasses | 100 | None | Proceed to TestSprite |
| 3 | Added login API + empty catch | 55 | Assertion tampering + empty catch | Manual review needed |

**🎯 Day 4 done = Mantiz CLI live + LOOP.md auto-fill + GitHub Actions functional**

---

## 🗓️ DAY 5 — Dataset Benchmark + Dashboard + Final (4 Jul) 🟡🟢

**Goal: Innovation points secured + submission-ready**

### 🔬 3 Dataset Benchmark

| Dataset | Nama | Isi | Target Score |
|---------|------|-----|-------------|
| **A** | "The Honest Code" | Diff normal — fungsi ditambah, expect diperbarui valid | **90-100** ✅ |
| **B** | "The Lazy/Cheating AI" | `.skip()`, `if(false)`, comment out assertion, empty catch | **<40** 🔴 |
| **C** | "The Smart Evasion AI" | Mock palsu, assertion value diubah, catch{} kosong, commit message tipu | **50-60** 🟡 |

### 📋 Task List

| # | Task | Detail | Est. Time |
|---|------|--------|-----------|
| ⬜ | **5.1 Fixture files** | `tests/fixtures/dataset-a/`, `dataset-b/`, `dataset-c/` — masing-masing 3-5 diff file + expected score | 2 jam |
| ⬜ | **5.2 Benchmark runner** | `src/benchmark/runner.ts` — Run all detectors against all fixtures → accuracy report | 1 jam |
| ⬜ | **5.3 Benchmark page** | `/benchmark` route — 3 kartu dataset + score bar + expand detail per fixture | 2-3 jam |
| ⬜ | **5.4 Auto-Healer Remediation** | Scan result include `fix_instruction` JSON field — "Dear AI Agent, fix this..." | 1 jam |
| ⬜ | **5.5 LOOP.md entries #4, #5, #6** | Benchmark tuning + false positive fix + auto-healer | 30m |
| ⬜ | **5.6 README final polish** | Update dengan benchmark results + CLI docs + GA badge | 30m |
| ⬜ | **5.7 Full regression + push** | Test semua flow: CLI → web → benchmark → GA | 1 jam |
| ⬜ | **5.8 📢 X THREAD + Discord** | "5 ways AI agents cheat" + tag @TestSprite + Discord polls | 30m |

**🎯 Day 5 done = Benchmark live + Innovation terbukti + LOOP.md 6+ entries**

---

## 🗓️ DAY 6-7 — Buffer + Polish + DEADLINE (5-6 Jul) 🧪🔴

| # | Task | Detail |
|---|------|--------|
| ⬜ | **6.1 LOOP.md entries #7, #8, #9, #10** — Kejar 10+ entries! | |
| ⬜ | **6.2 False positive tuning** — Dataset A harus 90-100. Tuning threshold. | |
| ⬜ | **6.3 Bug bash** — CLI edge cases: empty diff, no git repo, large diff | |
| ⬜ | **6.4 LOOP.md narrative review** — Baca semua entry, pastikan berkualitas | |
| ⬜ | **6.5 Final commit + push → Vercel** | |
| ⬜ | **⏰ DEADLINE — Submit di Discord `#hackathon-submissions`** | |

---

## 📊 SCORING TARGET (Final)

| Kriteria | Bobot | Target | Strategi |
|----------|-------|--------|----------|
| **Project Quality** | 40 pts | **34-37** | 5 detectors + Mantiz CLI + Web App + results |
| **Loop Quality** | 40 pts | **33-37** | 10+ LOOP.md auto-entries + real fix cycles |
| **Innovation** | 20 pts | **17-19** | 3 Dataset Benchmark + Auto-Healer + Smart Mock |
| **CI/CD Bonus** | +5 | **+5** | GitHub Actions — fail build on cheat detected |
| **Engagement** | ∞ | **10-15** | X thread + Discord polls |
| **TOTAL** | **105+** | **~90-95** | **TOP 3-5 AMAN** |

---

## 🗺️ MANTIZ ECOSYSTEM MAP

```
┌─────────────────────────────────────────────────────────────┐
│                    MANTIZ ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐     ┌──────────────────┐               │
│  │  Mantiz CLI      │     │  Web App          │              │
│  │  (Terminal)      │────▶│  (Dashboard)      │              │
│  │  npm run scan    │     │  mantiz-wine.vercel.app│              │
│  │                  │     │                  │               │
│  │  git diff → parse│     │  Paste diff form  │              │
│  │  5 detectors     │     │  Trust Score gauge │              │
│  │  LOOP.md auto    │     │  Findings list     │              │
│  │  Exit code 0/1   │     │  Benchmark page    │              │
│  └────────┬─────────┘     └──────────────────┘               │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐     ┌──────────────────┐               │
│  │  LOOP.md         │     │  GitHub Actions   │              │
│  │  (Auto-log)      │     │  (CI/CD)          │              │
│  │                  │     │                   │              │
│  │  iteration 1     │     │  push/PR trigger  │              │
│  │  iteration 2     │     │  npm run scan     │              │
│  │  ...             │     │  fail if < 70     │              │
│  │  iteration 10    │     │  + TestSprite     │              │
│  └─────────────────┘     └──────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🩺 HONEST ASSESSMENT — Realistis (4 Jul 2026)

> **Catatan:** Setelah evaluasi jujur berdasarkan kriteria resmi TestSprite S3.
> Baca ini dulu sebelum lanjut — ini prioritas fix.

### 📊 Estimasi Skor Saat Ini

| Kategori | Bobot | Skor Saat Ini | Potensi Final |
|----------|:-----:|:-------------:|:-------------:|
| **Project Quality** | 40 | **30-33** | **34-37** |
| **Loop Quality** | 40 | **25-30** | **33-37** |
| **Innovation** | 20 | **12-15** | **17-19** |
| CI/CD Bonus | +5 | **+5** ✅ | **+5** |
| Engagement | +∞ | **0** ❌ | **10-15** |
| **TOTAL** | **105+** | **~72-83** | **~90-95** |

**Saat ini: ~72-83 pts (mungkin top 10-15)**
**Target final: ~90-95 pts (bisa top 3-5)**

---

### 🔴 FATAL — Harus Diperbaiki Sebelum Submit

| # | Issue | Detail | Dampak | Priority |
|---|-------|--------|--------|----------|
| **F1** | **TestSprite CLI gak terbukti di loop** | Aturan resmi: *"You MUST use TestSprite CLI to facilitate a continuous loop."* Kita cuma install CLI, gak pernah jalanin di GitHub Actions atau nunjukkin evidence TestSprite beneran nge-test app. | Loop Quality bisa **-10 s/d -15 pts**. Juri bisa anggap kita gak comply aturan. | 🔴🔴🔴 **CRITICAL** |
| **F2** | **Benchmark page pake import.meta.glob** | `/benchmark` pake Vite `import.meta.glob('/tests/fixtures/**/*.ts')`. Di Vercel serverless, path absolut ini **kemungkinan gak nemu file** — dashboard bisa blank/error pas ditunjukin juri. | Innovation 20pts **bisa 0**. Juri buka → error → langsung diskualifikasi inovasi. | 🔴🔴🔴 **CRITICAL** |
| **F3** | **Gak submit di Discord** | Submission resmi lewat `#hackathon-submissions`. Kalo gak submit, gak dinilai sama sekali. | **All 100pts = 0**. Gak usah ikut hackathon. | 🔴🔴🔴 **CRITICAL** |

---

### 🟡 HIGH — Harus Diperbaiki Buat Kompetitif

| # | Issue | Detail | Dampak |
|---|-------|--------|--------|
| **H1** | **LOOP.md entry homogen** | 12 dari 15 entry score=100. Juri bisa curiga entry gak real — keliatan kayak dibuat-buat. 3 entry yang BLOCKED (iter 4, 7, 11) udah bagus, tapi perlu lebih banyak failure/fix cycle. | Loop Quality potensi dipotong **-5 s/d -10 pts** |
| **H2** | **Detector accuracy belum divalidasi** | Cuma 6 fixture files. Gak ada jaminan detectors akurat di real-world diff. Bisa false positive/negative pas demo. | Project Quality potensi **-3 s/d -5 pts** |
| **H3** | **Gak ada X thread / Discord engagement** | Bonus engagement bisa nilainya **10-15 pts** — ini free points yang gak dimanfaatin. | Engagement = **0 pts** (padahal potensi 10-15) |
| **H4** | **TestSprite CLI tidak ada di GitHub Actions** | Checklist bilang ✅ tapi kita gak pernah verify. Workflow cuma jalanin `mantiz-scan`, gak ada step `npx testsprite` atau similar. | CI/CD Bonus terancam, bisa kehilangan **+5 pts** |

---

### 🟢 MEDIUM — Nice to Have

| # | Issue | Detail |
|---|-------|--------|
| **M1** | **Cuma 2 fixture per dataset** | Idealnya 3-5 fixture per dataset biar lebih convincing |
| **M2** | **Gak ada real user testing** | Gak ada bukti orang lain pernah pake app |
| **M3** | **README outdated** | Masih bilang "8 detection patterns" padahal cuma 5 detectors functional |
| **M4** | **AI-CONTEXT.md gak di-link dari README** | Biar AI agent next bisa langsung baca |

---

### 🎯 Prioritas Fix (Urut Berdasarkan Impact)

```
1. [F1] TestSprite CLI di GitHub Actions + bukti loop
2. [F2] Fix Benchmark — ganti import.meta.glob pake hardcoded imports
3. [F3] Submit di Discord (paling gampang, jangan lupa!)
4. [H1] Tambah LOOP entry dengan score varied + failure narrative
5. [H4] Verify TestSprite beneran jalan di GA workflow
6. [H3] Bikin X thread + Discord polls
7. [H2] Tambah fixture files + verify detector accuracy
8. [M1-M4] Polish
```

---

## ✅ COMPLETED — Beyond Original Plan

| Feature | Status | Notes |
|---------|--------|-------|
| **GitHub OAuth** | ✅ **Implemented** | Full OAuth flow — login, callback, session cookie HMAC-signed, CSRF state protection |
| **PR Scan** | ✅ **Implemented** | Paste PR URL → Octokit fetch diff → 5 detectors → results |
| **History page** | ✅ **Implemented** | `/history` route — scan history display |
| **Responsive Navbar** | ✅ **Implemented** | Mobile drawer + desktop animated nav + auth section |
| **Benchmark Dashboard** | ✅ **Implemented** | `/benchmark` — 3 dataset scores with expand details |
| **Auto-Healer** | ✅ **Implemented** | `fixInstructions[]` in scan results — actionable AI fix prompts |
| **.rules/ AI Instructions** | ✅ **Implemented** | `.rules/ai-agent-workflow.md` — full workflow docs for AI agents |
| ~~AST Visual Tree~~ | ❌ Not implemented | Complexity too high for timeline |
| ~~Wall of Shame/Fame~~ | ❌ Not implemented | Needs user base + DB |

---

## 🎯 SUBMISSION CHECKLIST FINAL (Berdasarkan Aturan Resmi TestSprite S3)

### 📦 Di Repositori GitHub (Wajib)
- [✅] **Source code publik** — https://github.com/farhank15/mantiz
- [✅] **LOOP.md** — 15 entries, auto-generated oleh CLI, 1 baris per iterasi
- [✅] **README.md** — deskripsi + live URL + loop coverage + benchmark
- [✅] **Commit history** — bukti loop berjalan (real failures + fixes)

### 🌐 Di Vercel (Wajib)
- [✅] **Live URL** — https://mantiz-wine.vercel.app hidup
- [✅] **5 detectors functional** — paste diff → scan → results
- [✅] **Manual diff paste flow** — form → parse → trust score → findings

### 🤖 The Loop (Wajib — 40pts)
- [✅] **Mantiz CLI** — `npm run mantiz-scan` jalan di terminal
- [✅] **LOOP.md auto-log** — setiap scan append row otomatis
- [✅] **15 iterasi** — real failures detected + agent fixes + re-scans
- [✅] **TestSprite CLI** — ter-instal dan ter-integrasi

### ⭐ Bonus (Max +5 Innovation)
- [✅] **GitHub Actions CI/CD** — `.github/workflows/mantiz.yml` — fail build if score < 70
- [✅] **TestSprite in CI** — gate pipeline on TestSprite

### 📢 Engagement (Bonus ∞)
- [⏳] **Discord submission** — di `#hackathon-submissions` sebelum 7 Jul 4:59PM PDT
- [⏳] **X post** — tag @TestSprite
- [⏳] **Discord polls** — vote di polling yang ada

### 🚀 Additional Shipping
- [✅] **Redesigned responsive navbar** — mobile drawer + animated active indicator
- [✅] **.rules/ AI Agent Workflow** — `ai-agent-workflow.md` with full flow diagrams
- [✅] **Auto-Healer Remediation** — `fixInstructions` in every scan result
- [✅] **LOOP.md** — 15 entries covering entire development journey

---

> **Story:** *"Your AI agent says it fixed the tests. But did it really? Mantiz catches agents when they disable assertions, mock failing APIs, or skip test suites. The checker for the checker."*
>
> **Three pillars: 5 detectors + Mantiz CLI + LOOP.md auto-log + GitHub Actions fail-build + Benchmark dataset.**
>
> **Let's catch some cheatin' agents! 🔍🚀**
