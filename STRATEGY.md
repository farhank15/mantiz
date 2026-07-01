# 🏆 STRATEGY.md — Mantiz vs TestSprite Season 2 Winners

> **Goal:** Menganalisis gap Mantiz dibanding S2 winners & menentukan prioritas fix untuk S3.
> **Referensi Utama:** Drexii (1st Place $1,500), Reddit Video Downloader, SAIZU, DeepVizify
> **Dibuat:** 4 Jul 2026

---

## 📊 Ringkasan Perbandingan

| Aspek | S2 Winners (Drexii dkk) | **Mantiz Saat Ini** | Gap |
|-------|------------------------|---------------------|:---:|
| **Complexity** | Nuxt 4 app, API integrations | **7 detectors, OAuth, DB, CLI, npm package, Benchmark** | ✅ |
| **Uniqueness** | Useful consumer tools | **Truly unique — AI lie detector for code** | ✅ |
| **Live URL** | Not always | **✅ mantiz-wine.vercel.app** | ✅ |
| **Auth System** | Basic | **✅ Full GitHub OAuth + HMAC cookies** | ✅ |
| **CLI + Package** | None | **✅ npm published + GitHub Packages** | ✅ |
| **GA Workflow** | Maybe | **✅ 7 TestSprite smoke tests in CI** | ✅ |
| **Docs** | README only | **✅ README + PLAN + LOOP + AI-CONTEXT + AGENTS** | ✅ |

---

## 🔴 CRITICAL GAPS (Harus Fix Sebelum Submit)

### GAP #1 — Tidak Ada `testsprite_tests/` Folder
**Reference:** Drexii punya `testsprite_tests/` dengan test-cases + `testsprite-mcp-test-report.md`

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | Tidak ada bukti TestSprite beneran dijalanin di repo |
| **Dampak** | Judges gak bisa verifikasi loop quality |
| **Fix** | Run TestSprite → output ke `testsprite_tests/` → commit ke repo |
| **Effort** | ~30 menit |
| **Prioritas** | 🚨 **#1** |

### GAP #2 — Tidak Ada Round Progression Table
**Reference:** Drexii punya tabel 1/10 → 3/10 → 5/10 → 8/10 → 10/10

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | LOOP.md homogen (12/15 entry score 100) — gak keliatan real progression |
| **Dampak** | Judges bisa curiga loop-nya gak real |
| **Fix** | Tambah section "TestSprite Journey" di README dengan round progression table |
| **Effort** | ~20 menit |
| **Prioritas** | 🚨 **#2** |

### GAP #3 — Tidak Ada "Bugs Found & Fixed" Table
**Reference:** Drexii punya table linking specific test failures → code commits

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | LOOP entry cuma "FAILED" / "PASSED", no detail bug |
| **Dampak** | Judges gak liat value TestSprite |
| **Fix** | Tambah table di README: Bug → Detector → Fix Commit |
| **Effort** | ~20 menit |
| **Prioritas** | 🚨 **#3** |

### GAP #4 — Tidak Ada Demo Video
**Reference:** Projects with demo rank higher (dari official rules)

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | Tidak ada `demo.mp4` |
| **Dampak** | Kehilangan ranking boost |
| **Fix** | Screen record Mantiz scan flow → simpan sebagai `demo.mp4` |
| **Effort** | ~30 menit |
| **Prioritas** | 🟡 **#4** |

### GAP #5 — Tidak Ada PRD Uploaded ke TestSprite
**Reference:** Drexii upload PRD → test plans lebih akurat

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | File `Mantiz-PRD.md` tidak exist, PRD gak diupload ke TestSprite |
| **Dampak** | Test plans mungkin kurang akurat |
| **Fix** | Bikin PRD mantiz + upload ke TestSprite portal |
| **Effort** | ~15 menit |
| **Prioritas** | 🟡 **#5** |

### GAP #6 — Belum Submit ke Discord
**Reference:** Ini WAJIB — submissions only count via Discord

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | Belum posting di #hackathon-s03-submission |
| **Dampak** | **Tidak dinilai sama sekali** |
| **Fix** | Post GitHub link di Discord |
| **Effort** | ~5 menit |
| **Prioritas** | 🚨 **WAJIB** |

---

## 🟡 HIGH GAPS (Fix Setelah Critical)

### GAP #7 — Engagement = 0
**Reference:** 10 bonus pts — Discord polls (3pts) + Share on X (5pts) + Activity (2pts)

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | 0 X posts, 0 Discord activity |
| **Dampak** | Kehilangan 10 bonus pts |
| **Fix** | Post X + participate in Discord polls |
| **Effort** | ~15 menit |
| **Prioritas** | 🟡 **#6** |

### GAP #8 — Tidak Ada Architecture Diagram
**Reference:** Drexii punya diagram arsitektur di README

| Detail | Deskripsi |
|--------|-----------|
| **Masalah** | README cuma text — judges butuh 30 detik paham arsitektur |
| **Dampak** | Project quality bisa kena potong |
| **Fix** | Tambah diagram arsitektur Mantiz |
| **Effort** | ~20 menit |
| **Prioritas** | 🟢 **#7** |

---

## 📈 Score Impact Estimasi

| Skenario | Project Quality (40) | Loop Quality (40) | Innovation (20) | CI/CD (+5) | Engagement (+10) | **TOTAL** |
|:---------|:-------------------:|:-----------------:|:---------------:|:----------:|:----------------:|:---------:|
| **Tanpa Fix** | 30-33 | 25-30 | 12-15 | +5 | 0 | **~72-83** |
| **Dengan Fix** | 34-37 | 33-37 | 17-19 | +5 | 7-10 | **~93-98** |
| **Target Top 3** | ≥35 | ≥35 | ≥17 | +5 | ≥7 | **~95+** |

---

## 🎯 Action Plan — Prioritas

### 🔥 Round 1: Sebelum Submit (Priority: Critical)

```
[ ] 1. Run TestSprite → testsprite_tests/ folder → commit
[ ] 2. Update README: Bugs Found & Fixed table + Round Progression
[ ] 3. Update LOOP.md dengan real failures (bukan semua 100)
[ ] 4. Submit ke Discord #hackathon-s03-submission
[ ] 5. Post di X tentang Mantiz + tag @TestSprite
[ ] 6. Participate in Discord polls
```

### 🔥 Round 2: Kalo Ada Waktu (Priority: High)

```
[ ] 7. Buat demo.mp4 (screen record scan flow)
[ ] 8. Upload PRD/Mantiz docs ke TestSprite
[ ] 9. Tambah architecture diagram di README
[ ] 10. Perkaya fixture benchmark (tambah edge cases)
```

---

## 📋 Checklist Submission S3

Berdasarkan official rules dari [TestSprite S3](https://www.testsprite.com/hackathon-s3):

- [ ] **Public GitHub repo** ✅ — github.com/farhank15/mantiz
- [ ] **README.md** ✅ — Sudah ada, comprehensive
- [ ] **`testsprite_tests/` subfolder** ❌ — **BELUM ADA** (priority #1)
- [ ] **TestSprite CLI digunakan** ⚠️ — Ada di GA workflow, tapi belum ada bukti di repo
- [ ] **Loop quality documented** ⚠️ — LOOP.md ada, tapi perlu enhancement
- [ ] **demo.mp4 (optional)** ❌ — **BELUM ADA**
- [ ] **Submitted via Discord** ❌ — **BELUM SUBMIT**
- [ ] **Engagement (X + Discord)** ❌ — **0**

---

## 🔍 S2 Winner Reference: Drexii Blueprint

> **Sumber:** https://github.com/Davidson3556/drexii

### Strategi Kunci

1. **5 Rounds of Testing** — 1/10 → 10/10 progression
2. **Bug Table di README** — specific failures linked to commits
3. **Architecture Diagram** — judges understand in 30 seconds
4. **PRD Uploaded** — better TestSprite test plans
5. **TestSprite MCP** — beneran dipake, bukan cuma diinstall
6. **demo.mp4** — visual proof of working app

### Struktur Repo Drexii
```
drexii/
├── app/                     # Frontend
├── server/                  # Backend
│   ├── lib/
│   │   ├── agent-runner.ts
│   │   └── integrations/    # Gmail, Slack, Notion
│   └── ...
├── testsprite_tests/        # 🔥 Folder bukti TestSprite
│   ├── test-cases/
│   └── testsprite-mcp-test-report.md
├── README.md                # Master-class documentation
└── demo.mp4
```

### Yang Bikin Drexii Menang (Bukan Fitur)
1. **Mendokumentasikan loop dengan sangat baik** — Round 1 → Round 5
2. **README adalah proposal + bukti** — bukan cuma docs teknis
3. **TestSprite beneran dipake dalam loop** — bukan cuma diinstall
4. **Ada progression yang jelas** — judges lihat improvement

---

## 🎯 Kesimpulan

> **Mantiz secara FITUR dan KOMPLEKSITAS sudah di atas S2 winners.** Tapi secara DOKUMENTASI dan BUKTI LOOP masih kalah. S2 winners menang karena mereka bisa buktiin "TestSprite beneran nemuin bug di code mereka."
>
> **Target kita:** 93-98 pts → Top 3 S3.
> **Kunci:** TestSprite evidence (`testsprite_tests/`) + Round Progression + Engagement.
> **Deadline: 4 Jul 2026.**

---

*Dibuat berdasarkan riset TestSprite S2 winners showcase dan analisis gap terhadap project Mantiz.*
