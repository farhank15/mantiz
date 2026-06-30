# 🗺️ PLAN — Mantiz (5+2 Hari)
## TestSprite Hackathon Season 3 · AI Lie Detector

> **Timeline:** 30 Jun (5PM PDT) — 7 Jul (4:59PM PDT)  
> **Strategy:** ✅ 5 hari build aktif + 2 hari buffer testing/trial & error  
> **Target Skor:** ~95+ (Top 1)

---

## 🎯 FOKUS UTAMA

| Prioritas | Area | Bobot |
|-----------|------|-------|
| **P0 - Wajib** | 5 detectors berfungsi + diff paste flow + live URL | 80 pts |
| **P1 - Penting** | GitHub OAuth + PR scan + history page | Should Have |
| **P2 - Bonus** | CI/CD GitHub Action + README + demo video | +5 pts |
| **P3 - Engagement** | Discord polls + X thread + sharing | ∞ Bonus |

**Rule utama:** P0 selesai dulu sebelum sentuh P1. P1 selesai sebelum P2. Deadline > fitur.

---

## 🗓️ DAY 1 — Setup & Deploy 🔴 (Sen, 30 Jun)

**Goal: Live URL + DB online + TestSprite siap**

| # | Task | Detail | Time |
|---|------|--------|------|
| ✅ | 1.0 | **DESIGN ADJUSTMENT** — CrowdStrike SOC dark theme applied | Selesai |
| ⬜ | 1.1 | **Git remote + push** — `git remote add origin`, `git push -u origin main` | 10m |
| ⬜ | 1.2 | **Neon DB push** — `drizzle-kit push` ke Neon (pake DATABASE_URL dari .env) | 10m |
| ⬜ | 1.3 | **Deploy ke Vercel** — import repo → deploy → **https://mantiz.vercel.app** 🔥 | 15m |
| ⬜ | 1.4 | **Install TestSprite CLI** — `npm install -g @testsprite/testsprite-cli` | 5m |
| ⬜ | 1.5 | **Setup TestSprite** — `testsprite setup` → API key → create project → skill install | 15m |
| ⬜ | 1.6 | **Verify** — `testsprite auth status` + first test run | 10m |
| ⬜ | 1.7 | **LOOP.md entry #1** — Catat iterasi pertama | 5m |

**✅ Day 1 done = Live URL + DB + TestSprite jalan + 1 LOOP entry**

---

## 🗓️ DAY 2 — Diff Paste + Detector 1 (Sel, 1 Jul)

**Goal: End-to-end: paste diff → parse → detect → hasil**

| # | Task | Detail | Priority |
|---|------|--------|----------|
| ⬜ | 2.1 | **Diff paste form** — Textarea + submit → POST ke server function | P0 |
| ⬜ | 2.2 | **Diff parser** — Parse raw diff pake `diff` npm package → structured hunks | P0 |
| ⬜ | 2.3 | **Detector 1 (disabled-assertion)** — Babel AST: cari comment out, `.skip()`, `if(false)` | P0 |
| ⬜ | 2.4 | **Results renderer** — List findings + confidence badge + evidence excerpt | P0 |
| ⬜ | 2.5 | **Trust score 0-100** — Weighted: high=30pts, medium=15pts, low=5pts | P0 |
| ⬜ | 2.6 | **TestSprite loop** — 2-3 iterasi: form validation → detector fix → score calc | P1 |
| ⬜ | 2.7 | **LOOP.md #2 & #3** — form validation fix + detector 1 false positive fix | P1 |

---

## 🗓️ DAY 3 — 4 Detector Sisanya (Rab, 2 Jul)

**Goal: All 5 detection patterns operational**

| # | Task | Detail | Priority |
|---|------|--------|----------|
| ⬜ | 3.1 | **Detector 2 (assertion-tampering)** — Compare expected values before/after diff | P0 |
| ⬜ | 3.2 | **Detector 3 (mock-to-avoid)** — Deteksi mock baru tanpa real-path test | P0 |
| ⬜ | 3.3 | **Detector 4 (claim-diff mismatch)** — Parse commit message vs changed files | P0 |
| ⬜ | 3.4 | **Detector 5 (silent-catch)** — Deteksi empty catch block baru | P0 |
| ⬜ | 3.5 | **Fixture curation** — 2-3 true-positive + 1-2 false-positive per detector | P1 |
| ⬜ | 3.6 | **TestSprite loop** — 4 iterasi (per detector, false positive tuning) | P1 |
| ⬜ | 3.7 | **LOOP.md #4, #5, #6, #7** — Satu entry per detector | P1 |
| ⬜ | 3.8 | **📢 X THREAD** — \"5 ways AI agents cheat test suites\" + tag @TestSprite | P2 |

---

## 🗓️ DAY 4 — GitHub OAuth + PR Scan + History (Kam, 3 Jul)

**Goal: Connect GitHub → scan PR + scan history page**

| # | Task | Detail | Priority |
|---|------|--------|----------|
| ⬜ | 4.1 | **GitHub OAuth** — better-auth + GitHub OAuth app → login | P1 |
| ⬜ | 4.2 | **Repo/PR list** — Octokit `GET /user/repos` → `GET /pulls` | P1 |
| ⬜ | 4.3 | **PR diff scan** — Fetch PR diff → run detection engine | P1 |
| ⬜ | 4.4 | **Scan history page** — List all scans + date + trust score | P1 |
| ⬜ | 4.5 | **Results page polish** — Confidence badges, evidence expand, trust score gauge | P1 |
| ⬜ | 4.6 | **Feedback buttons** — "False positive" / "Confirmed" → persist `user_verdict` | P1 |
| ⬜ | 4.7 | **TestSprite loop** — OAuth flow test, history page edge cases | P1 |
| ⬜ | 4.8 | **LOOP.md #8, #9** — OAuth fix + history edge case | P1 |

---

## 🗓️ DAY 5 — CI/CD + README + Final Push (Jum, 4 Jul)

**Goal: Submission-ready + +5 Innovation bonus**

| # | Task | Detail | Priority |
|---|------|--------|----------|
| ⬜ | 5.1 | **GitHub Action** — `.github/workflows/mantiz.yml` — Mantiz scan on every PR | P2 |
| ⬜ | 5.2 | **TestSprite in CI** — `testsprite test run --all` in same workflow | P2 |
| ⬜ | 5.3 | **README** — App description, live URL, loop summary, tech stack | P2 |
| ⬜ | 5.4 | **Demo video** — 2-3 min screen recording (opsional) | P2 |
| ⬜ | 5.5 | **Full regression** — Test semua flow: paste, scan, history, OAuth | P0 |
| ⬜ | 5.6 | **📢 X SHARE** — Screenshot scan result + tag @TestSprite (5 pts) | P2 |
| ⬜ | 5.7 | **LOOP.md #10, #11** — CI/CD + regression entries | P0 |

**✅ Day 5 done = Semua siap submit**

---

## 🗓️ DAY 6-7 — Buffer Testing & Trial & Error 🧪 (Sab-Min, 5-6 Jul)

**Goal: Fix bug, LOOP.md cleanup, final polish**

| # | Task | Detail |
|---|------|--------|
| ⬜ | 6.1 | **Bug bash** — Test semua flow, catet bug, fix satu-satu |
| ⬜ | 6.2 | **Edge case handling** — Empty diff, large PR, no findings, error states |
| ⬜ | 6.3 | **LOOP.md narrative review** — Baca semua entry, pastikan berkualitas |
| ⬜ | 6.4 | **Performance check** — Load time, build size, DB query speed |
| ⬜ | 6.5 | **Discord polls #2 & #3** — Jangan lupa vote! |

---

## 🔴 DAY 7 — DEADLINE (Min, 6 Jul)

**⏰ Submit sebelum 4:59PM PDT (≈ 6:59AM WIB, 7 Jul)**

| # | Task | Time |
|---|------|------|
| ⬜ | Full regression — TestSprite run ALL flows | 30m |
| ⬜ | LOOP.md final review — pastikan 10+ entries | 15m |
| ⬜ | Final commit + push → Vercel auto-deploy | 10m |
| ⬜ | **Post di Discord `#hackathon-submissions`** | 5m |
| ⬜ | **Include:** live URL + repo link + TestSprite account | 5m |
| ⬜ | Final X post: \"Mantiz is live — AI lie detector for code\" | 5m |
| ⬜ | Final Discord polls | 5m |
| ⏰ | **4:59PM PDT — DEADLINE** | |

---

## 📊 SCORING TARGET

| Kriteria | Bobot | Target 5 Hari | Notes |
|----------|-------|---------------|-------|
| Project Quality | 40 pts | **32-35** | 5 detectors + paste flow + results + Postgres |
| Loop Quality | 40 pts | **32-35** | 10+ LOOP.md entries, real bug→fix cycles |
| Innovation | 20 pts | **16-18** | First-of-its-kind concept |
| CI/CD Bonus | +5 pts | **+5** | GitHub Action + TestSprite |
| Engagement | ∞ | **10-15** | 2 X posts + Discord polls + thread |
| **TOTAL** | **100+** | **~90-95** | **TOP 3-5 AMAN** |

---

## 🚨 RISIKO & MITIGASI

| Risiko | Mitigasi |
|--------|----------|
| **Deploy gagal** | Coba `npm run build` dulu lokal. Kalo error >30m → contingency (Vite + Express) |
| **Neon DB error** | Cek DATABASE_URL di .env. Kalo masih error → pake Supabase (drop-in Postgres) |
| **TestSprite promo code telat** | Tanya di Discord `#hackathon-questions`. Pake `npx` sementara |
| **Detector false positive** | Curate fixtures dari Day 2. Tuning threshold pake TestSprite loop |
| **OAuth flow rumit** | Skip OAuth kalo >2 jam. Fokus ke manual diff paste flow (udah cukup buat 80 pts) |
| **CI/CD action error** | Test workflow lokal pake `act` dulu. Jangan push broken workflow ke main |
| **Kehabisan waktu** | **DROP** fitur: OAuth → CI/CD → demo video. Jangan korbankan LOOP quality |

---

## 🎯 SUBMISSION CHECKLIST FINAL

- [ ] **Live URL** — https://mantiz.vercel.app hidup
- [ ] **GitHub repo** — publik + LOOP.md + source
- [ ] **LOOP.md** — 10+ entries, real fix cycles
- [ ] **README** — app description + live URL + loop coverage
- [ ] **TestSprite account** — terdaftar
- [ ] **Discord post** di `#hackathon-submissions`
- [ ] **5 detectors** — semua functional
- [ ] **Manual diff paste** — flow lengkap

---

> **Quote:** *"Your agent writes the code. The open-source TestSprite CLI checks it: real tests against your live app, with verdicts your agent acts on. Write, verify, fix, verify."*
>
> — TestSprite S3
>
> **Let's catch some cheatin' agents! 🔍🚀**
