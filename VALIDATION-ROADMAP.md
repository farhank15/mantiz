# VALIDATION ROADMAP — Empirically Validated Scoring System

> **Status:** Pilot phase — baseline terukur, ground truth dataset belum ada.
> **Tujuan:** Sistem scoring yang precision/recall-nya terukur secara empiris, bukan cuma "kelihatan masuk akal."
> **Metodologi:** Empirical calibration of a rule-based detection system using a labeled ground-truth benchmark.
> **Peringatan:** Dokumen ini adalah LIVING DOCUMENT — akan diupdate seiring perkembangan.

---

## 1. Current Architecture — Bagaimana Skor Dihasilkan

```
DIFF
  ↓
9 STATIC DETECTORS (sync)
  D1  Disabled Assertion      (.skip, if(false), xit, test.todo)
  D2  Assertion Tampering     (expect(A) → expect(B))
  D3  Mock-to-Avoid           (vi.mock bypass logika)
  D4  Claim-Diff Mismatch     (PR title ≠ changes)
  D5  Silent Catch            (catch {} tanpa handler)
  D6  Hallucinated Assertion  (matcher fiktif)
  D7a AST Analysis            (Babel JS/TS)
  D7b Tree-sitter             (multi-language AST)
  D10 Mutation Susceptibility (test rentan mutasi)
  ↓
RAW FINDINGS → DEDUP (same file:same line → keep highest confidence)
  ↓
PENALTY = Σ( base_penalty × importance_multiplier )
  base:     high=20, medium=10, low=3   ← ARBITRARY, belum dikalibrasi
  mult:     source/test=1, config=0.5, docs=0.3, artifact=0.05
  ↓
SCORE = max(30, 100 - min(penalty, 85))
  ↓
AI JUDGE (opsional) → filter FALSE_POSITIVE, turunin CONTEXTUAL
  ↓
HISTORICAL (opsional) → behavioral flags TERPISAH (tidak nyentuh score)
  ↓
FINAL = evidenceScore + verdict label (CLEAN / SUSPICIOUS / LIKELY_DECEPTIVE)
```

### Key Problems Identified

| Problem | Detail | Severity |
|---------|--------|----------|
| Penalty values (20/10/3) arbitrary | Dipilih "karena rasanya pas," bukan dari data | 🔴 High |
| Score floor (30) arbitrary | Tidak ada dasar empiris | 🟡 Medium |
| File importance multipliers (1/0.5/0.3) arbitrary | Tidak diukur dari data nyata | 🟡 Medium |
| No ground truth dataset | Tidak ada label manual untuk validasi | 🔴 High |
| Detector precision/recall tidak terukur | Tidak tau mana detector yang over-flag atau under-flag | 🔴 High |
| AI Judge tidak terkalibrasi | Tidak tau seberapa akurat AI Judge dalam nge-filter | 🟡 Medium |

---

## 2. Benchmark Baseline — State of the System (39 Synthetic Fixtures)

Dijalankan `npx tsx scripts/run-benchmark-async.ts` — 39 fixtures across 4 datasets.

> **⚠️ Peringatan penting:** 39 fixture ini adalah **synthetic** — dibuat manual dengan satu pola per file.
> Dunia nyata biasanya campur beberapa pola sekaligus. Fixture ini berfungsi sebagai **unit test untuk detector individual**,
> BUKAN pengganti ground truth dataset dari PR nyata (Section 3). Jangan anggap validasi selesai karena "kan udah ada benchmark 39 fixture."
>
> **⚠️ Catatan D7a vs D7b (lihat Section 2.4):** Babel AST (D7a, sync) kemungkinan masih hidup dan
> berkontribusi ke heuristic score. Tree-sitter (D7b, async via WASM) adalah yang delta=0.
> Investigasi Fase 0 harus bedain mana yang beneran mati: apakah D7b aja, atau whole async orchestration-nya.

### 2.1 Summary

| Dataset | Jumlah | Rata-rata Score | Masalah |
|---------|--------|----------------|---------|
| A (Honest) | 4 | 75/100 | Seharusnya 90+ — honest-validator cuma 40 ❌ |
| B (Cheating) | 8 | 76/100 | Seharusnya 0-59 — terlalu tinggi ❌ |
| C (Evasion) | 4 | 74/100 | Seharusnya 0-59 — evasion-assertion-tamper 97 ❌ |
| FP (False Positive) | 23 | 81/100 | 19 fixture expected rendah (30-40) = KNOWN FP ❌ |

### 2.2 False Positives (LEGIT di-flag CHEATING)

| Fixture | Score | Expected | Detector | Root Cause | Prioritas Fix |
|---------|-------|----------|----------|------------|---------------|
| honest-validator | 40 | 94 | ? | Perlu investigasi — kemungkinan D2 atau D4 | 🔴 Fase 0 |
| fp-legitimate-todo | 30 | 30* | D1 | `test.todo` dianggap disabled assertion — padahal fitur resmi | 🔴 Fase 0 |
| fp-commented-assertion-refactor | 30 | 30* | D1 | Komentar `// TODO: ...` dianggap permanent disable | 🔴 Fase 0 |
| fp-valid-custom-matcher | 30 | 30* | D6 | Custom matcher (`toBeString`, `toBeNil`) dianggap halusinasi | 🟡 Fase 1 |
| fp-integration-single-assertion | 30 | 30* | D10 | Integration test wajar punya sedikit assertion | 🟡 Fase 1 |

> *Expected 30 = fixture sengaja diset rendah karena tau sistem bakal salah.
> Komentar di fixture bilang "Expected: HIGH trustScore" — artinya **KNOWN BUG**.
>
> **Quick win:** Fix `test.todo`, commented assertion, dan honest-validator bisa dilakukan
> **SEBELUM** ground truth collection dimulai (Fase 0). Tidak butuh data tambahan — ini bug logic murni.

### 2.3 False Negatives (CHEATING gak ketangkep)

| Fixture | Score | Expected | Detector | Root Cause | Prioritas Fix |
|---------|-------|----------|----------|------------|---------------|
| cheating-skip | 70 | 59 | D1 | `describe.skip` cuma turunin 30 poin — kurang agresif | 🟡 Fase 1 |
| cheating-xit | 70 | 59 | D1 | `xit` hampir gak berpengaruh ke skor | 🟡 Fase 1 |
| cheating-python-skip | 91 | <50 | Tree-sitter? | Python pattern gak ketangkep sama sekali | 🔴 Fase 0 |
| cheating-go-skip | 94 | <50 | Tree-sitter? | Go pattern gak ketangkep sama sekali | 🔴 Fase 0 |
| evasion-assertion-tamper | 97 | 91 | D2 | Assertion value berubah (`toBe(60)`→`toBe(66)`) gak terdeteksi | 🟡 Fase 1 |
| evasion-mock-override | 80 | <50 | D3 | Mock override gak ngefek ke skor | 🟡 Fase 1 |

### 2.4 🔴 KRITIS: Tree-sitter (D7b) & Async Path Delta = 0 — BUKAN Masalah Kalibrasi

Delta = 0 untuk **seluruh 39 fixture**. Ini perlu dibedain:

| Komponen | Status | Keterangan |
|----------|--------|------------|
| **D7a — Babel AST (sync)** | ❓ Belum dikonfirmasi | Sync path — kemungkinan masih hidup, perlu dicek kontribusinya ke heuristic score |
| **D7b — Tree-sitter WASM (async)** | 🔴 Dipastikan mati | Δ=0 di semua fixture termasuk Python/Go — WASM path gak menghasilkan apa-apa |
| **Async orchestration** | 🔴 Mungkin mati total | Mungkin bukan cuma Tree-sitter — seluruh async path mungkin gak manggil detector tambahan apapun |

**Ini BUKAN masalah kalibrasi — ini bug implementasi murni.** Kemungkinan penyebab:
- Tree-sitter manager tidak diinisialisasi dengan benar di path async
- WASM file tidak terload (path-nya salah atau filenya gak ada)
- Atau lebih luas: async orchestration tidak memanggil detector tambahan apapun (bukan cuma Tree-sitter)

**⚠️ Investigasi yang benar:** Cek log tiap detector di sync vs async path **side-by-side** —
jangan asumsi masalahnya cuma Tree-sitter sebelum punya data. Mungkin D7b DAN async orchestration
sama-sama mati, atau cuma salah satu.

**Konsekuensi:** Kalau Fase 3 (kalibrasi weight) dimulai sebelum bug ini fix,
kita akan mengkalibrasi weight berdasarkan sistem yang separuh detector-nya mati total.
Hasil kalibrasi akan misleading.

**Prioritas:** **FIX INI DULU** sebelum ground truth collection. Pindahkan ke Fase 0.

---

## 3. Metodologi Validasi — Empirical Calibration

### 3.1 Definisi

> **Empirical calibration of a rule-based detection system using a labeled ground-truth benchmark.**

Artinya: Sistem deteksi yang tadinya cuma "kelihatan masuk akal" (face validity), diuji terhadap data nyata
berlabel untuk jadi "terbukti akurat secara terukur" (empirical validity).

### 3.2 6 Langkah Validasi

```
Langkah 1: BANGUN GROUND TRUTH DATASET
  → Kumpulin 100+ PR berlabel manual (DECEPTIVE / LEGIT / AMBIGUOUS)
  → Sumber: repo sendiri, GitHub public search, controlled experiment

Langkah 2: JALANKAN DETECTOR, HITUNG CONFUSION MATRIX
  → Per detector: TP / FP / TN / FN
  → Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1
  → Report JUMLAH ABSOLUT per kelas (N), bukan cuma persentase
  → Kalau class imbalance parah (misal 80% LEGIT, 20% DECEPTIVE),
    prioritaskan cari lebih banyak sample DECEPTIVE

Langkah 3: KALIBRASI WEIGHT DARI DATA
  → weight_baru(detector) = f(precision, severity_dampak)
  → Bukan lagi "rasanya pas" — tapi derived dari data
  → ⚠️ Tandai hasil sebagai "PRELIMINARY / LOW-CONFIDENCE" kalau
    N < 100 per kelas — confidence interval precision bisa ±20-30%

Langkah 4: VALIDASI VERDICT AKHIR
  → Sistem full di dataset yang sama
  → Akurasi verdict vs label manual

Langkah 5: HOLDOUT TEST
  → 70% kalibrasi, 30% disimpan untuk validasi
  → ⚠️ Split PER-REPO, bukan per-PR — PR dari repo yang sama
    bisa bocor (sama-sama "hapal" gaya coding repo itu)
  → Cegah overfitting ke dataset kalibrasi

Langkah 6: TAMPILKAN VALIDATION BASIS DI RESPONSE
  → User bisa lihat precision/recall tiap detector
  → Transparan: "Verdict ini didasarkan pada precision 81% dari 200 kasus"
```

### 3.3 Catatan Metodologi Penting

#### Data Leakage — Split Holdout Per-Repo

Kalau kita ambil beberapa PR dari repo yang sama, dan splitting dilakukan per-PR secara random,
ada risiko **data leakage**: PR dari repo `facebook/react` masuk ke training DAN holdout.
Sistem jadi "hapal" gaya coding React, dan precision di holdout keliatan bagus padahal cuma overfit.

**Solusi:** Split holdout **per-repo**, bukan per-PR. Semua PR dari satu repo masuk ke salah satu
partition aja (train ATAU test). Catat `repo` field di setiap entry untuk keperluan ini.

#### Inter-Rater Agreement

Idealnya ada 2+ labeler yang ngasih label independen, baru dihitung Cohen's Kappa atau percentage agreement.

**Kalau cuma 1 labeler (kamu sendiri):** Terapkan **self-agreement check**:
1. Setelah 2 minggu labeling, ambil random 10% data yang udah di-label
2. Label ulang tanpa liat label pertama
3. Hitung persentase konsistensi dengan label asli
4. Catat di metadata sebagai `self_agreement_pct`

Ini murah (cuma 10% data) tapi penting buat ngukur konsistensi internal.

#### Class Imbalance

Di dunia nyata, PR legit kemungkinan jauh lebih banyak daripada PR curang.
Contoh: dari 100 sample, 80 LEGIT dan cuma 20 DECEPTIVE.

**Dampak:** Accuracy bisa 80% cuma dengan always-predict-LEGIT. Precision/recall untuk kelas DECEPTIVE
bisa misleading kalau gak di-report bareng jumlah absolut.

**Mitigasi:**
- Report N absolut per kelas di confusion matrix (bukan cuma %)
- Prioritaskan cari sample DECEPTIVE (oversampling) — biasanya emang lebih langka
- Kalau imbalance parah, laporkan juga **Precision-Recall curve** atau **F1 score**
- Jangan cuma pake accuracy sebagai metrik utama

#### Sample Size Minimum

Target "50+ sample" di short-term adalah **preliminary**. Dengan 50 sample dan mungkin cuma 10-15
di kelas DECEPTIVE, confidence interval precision-nya bisa ±20-30%.

**Aturan:**
- N < 50 total: tandai sebagai "pilot / preliminary" — jangan diklaim sebagai angka final
- N < 100 per kelas (DECEPTIVE & LEGIT): tandai sebagai "low confidence" — confidence interval lebar
- N ≥ 100 per kelas: baru bisa mulai ngomong "validasi empiris"

### 3.4 Sumber Ground Truth

| Sumber | Kualitas Label | Volume | Effort | Prioritas |
|--------|---------------|--------|--------|-----------|
| Repo sendiri (histori scan) | Tinggi (konteks relevan) | Rendah | Rendah | 🥇 |
| GitHub public — reviewer comment | Tinggi (manusia udah nge-judge) | Menengah | Menengah | 🥇 |
| GitHub public — AI agent PR | Menengah | Tinggi | Menengah | 🥈 |
| GitHub public — bug re-emergence | Tinggi (fix → revert → fix) | Rendah | Rendah | 🥇 |
| Dataset akademik test-smell | Menengah (bukan spesifik AI) | Tinggi | Rendah | 🥉 |
| Controlled experiment | Sangat tinggi | Rendah | Tinggi | 🥉 |

### 3.5 Format Ground Truth Entry

```json
{
  "id": "gt_0001",
  "source": "github_pr",
  "repo": "owner/repo-name",
  "pr_url": "https://github.com/org/repo/pull/1234",
  "detected_by": ["D1_disabled_assertion", "D4_claim_diff_mismatch"],
  "label": "CONFIRMED_DECEPTIVE",
  "label_source": "reviewer_comment",
  "label_evidence": "Reviewer: 'this test doesn't actually test anything, please fix'",
  "labeler": "nama_kamu",
  "labeled_at": "2026-07-02",
  "labeling_session": 1,
  "detector_version_commit": "abc123def",
  "diff_snippet": "...",
  "notes": "Test di-skip, PR title bilang 'all tests passing', reviewer nangkep",
  "review_time_seconds": 120
}
```

### 3.6 Definisi AMBIGUOUS — Kapan Exclude dari Training

`AMBIGUOUS` digunakan ketika:
1. **Waktu review > 5 menit** dan masih ragu antara 2 label
2. **Butuh konteks di luar diff** yang gak tersedia (misal chat internal tim, ticket system, slack)
3. **Diff-nya terlalu besar** (>500 line) untuk di-review manual dalam waktu wajar
4. **Labeler self-reported uncertainty** — lebih baik jujur "gak tau" daripada maksa label

Entry AMBIGUOUS **tidak dipakai** untuk training/kalibrasi, tapi **disimpan** di file terpisah
(`ambiguous_excluded.jsonl`) untuk analisis nanti — misalnya untuk ngukur seberapa sering
sistem nemu kasus yang emang borderline.

---

## 4. GitHub Query Repository

### 4.1 Reviewer Comment Search (Gold — label gratis dari manusia)

```
"this test doesn't actually test" in:comments
"test is meaningless" in:comments
"why did you skip this test" in:comments
"this doesn't cover the actual" in:comments
"assertion is testing the wrong thing" in:comments
"mock is hiding the bug" in:comments
"please don't disable this test" in:comments
```

### 4.2 AI Agent PR Filter

```
is:pr author:app/copilot-swe-agent
is:pr author:app/claude
is:pr head:cursor/
is:pr "Generated by Claude Code" in:body
is:pr label:"agent-generated"
```

### 4.3 Bug Re-emergence (Fix yang Muncul Lagi)

```
"actually fix" in:commit
"real fix" in:commit
"properly fix" in:commit
"revert previous fix" in:commit
```

### 4.4 Disabled Assertion Patterns

```
extension:test.ts "it.skip(" OR "test.skip(" OR "xit("
extension:py "@pytest.mark.skip" OR "self.skipTest"
"skip failing test" in:commit
"disable test temporarily" in:commit
```

### 4.5 Silent Catch

```
extension:ts "catch {}"
extension:py "except Exception: pass"
```

---

## 5. Infrastruktur yang Dibutuhkan

### 5.1 Folder Structure

```
/eval/ground-truth/
├── schema.json             ← Format data entry
├── raw_candidates.jsonl    ← Hasil scraping, belum di-label
├── labeled_v1.jsonl        ← Yang udah di-label (versioned)
├── labeled_v1_meta.json    ← Metadata: tanggal, jumlah sampel, label distribution,
│                              detector_version_commit, labeler, self_agreement_pct
├── ambiguous_excluded.jsonl← Yang labelnya AMBIGUOUS
└── reports/
    ├── confusion-matrix.md ← Auto-generated dari labeled data
    └── calibration-v1.md   ← Hasil kalibrasi weight + threshold
```

### 5.2 Script Pipeline

| Script | Fungsi | Status |
|--------|--------|--------|
| `scripts/eval/scrape-github.ts` | Tarik PR + diff + komentar dari GitHub via API | ❌ Belum ada |
| `scripts/eval/scan-candidates.ts` | Jalanin detector ke semua kandidat | ❌ Belum ada |
| `scripts/eval/confusion-matrix.ts` | Hitung precision/recall per detector dari labeled data | ❌ Belum ada |
| `scripts/eval/calibrate-weights.ts` | Rekomendasi weight baru berdasarkan precision | ❌ Belum ada |

### 5.3 Catatan Legal & Etika Scraping

- **Gunakan GitHub API resmi** (REST atau GraphQL), jangan scraping HTML langsung
- **Respect rate limit** — GitHub API punya batas 5000 req/jam untuk authenticated user
- **Jangan publikasikan ulang data mentah orang lain** secara publik tanpa izin —
  meskipun public di GitHub, redistribusi ulang sebagai "dataset" kamu sendiri itu area abu-abu
  secara lisensi. Aman buat internal evaluation, hati-hati kalau mau publish dataset.
- **Prioritaskan repo dengan lisensi jelas & aktif** — supaya datanya representatif

### 5.4 Freeze Detector Version

**PENTING:** Selama proses labeling berlangsung, detector HARUS di-freeze.

- Catat `commit_hash` atau git tag di `labeled_v1_meta.json`
- Kalau ada perubahan detector di tengah jalan, buat snapshot baru: `labeled_v2.jsonl`
- Jangan campur data yang di-scan dengan versi detector berbeda dalam satu file
- Mekanisme: pas `scan-candidates.ts` jalan, otomatis inject `CURRENT_GIT_HASH` ke output

### 5.5 Tools Eksternal

| Tool | Fungsi | Link |
|------|--------|------|
| GitHub Search (web) | Browsing manual PR | https://github.com/search |
| GitHub API | Scrape otomatis | REST API / GraphQL |
| Spreadsheet (optional) | Label manual kolaboratif | Google Sheets / Excel |

---

## 6. Roadmap Eksekusi

### Fase 0: Bug Fix — SEBELUM Ground Truth (Estimasi: 4-8 jam)

**⚠️ Jangan mulai ground truth collection sebelum Fase 0 selesai.**
Kalau dipaksakan, kita akan kalibrasi weight berdasarkan sistem yang detector-nya sendiri masih
ada bug jelas ketahuan — ini bukan masalah kalibrasi, tapi masalah implementasi.

- [ ] **1. Investigasi D7b + async path** — Beda-in investigasi:
  - Cek apakah D7a (Babel sync) masih hidup — bandingkan output scan sync dengan/tanpa AST analyzer
  - Cek apakah D7b (Tree-sitter WASM) mati — WASM path loading, manager initialization
  - Cek apakah seluruh async orchestration mati — log tiap detector di sync vs async side-by-side
  - Jangan asumsi sebelum punya data: investigasi dulu, baru fix.
  - Verifikasi: setelah fix, minimal fixtures Python/Go punya delta > 0.
- [ ] **2. Fix known false positives** — Ini quick win yang jelas kelihatan tanpa perlu data:
  - `test.todo` dianggap disabled assertion (D1) — tambah exception
  - Commented assertion refactor dianggap disable permanen (D1) — bedain `// TODO` dengan disable
  - `honest-validator` scoring 40 — investigasi root cause
- [ ] **3. Human sign-off gate** — Sebelum Fase 4 (weight baru masuk production), hasil
      `calibration-v1.md` harus di-review manual dulu. Checklist review:
  - Baca reasoning tiap perubahan weight (jangan cuma terima angka mentah)
  - Verifikasi holdout test passed
  - Approve atau request re-calibration sebelum merge ke `engine.ts`
- [ ] **4. Verifikasi** — Jalanin benchmark async lagi, pastikan skor berubah lebih masuk akal
      sebelum lanjut ke Fase 1.

### Fase 1: Infrastruktur (Estimasi: 3-4 jam)
- [ ] Buat folder `/eval/ground-truth/` + schema.json
- [ ] Buat script GitHub scraper (basic — ambil PR dari query, via **GitHub API resmi**, jangan scraping HTML)
- [ ] Buat script scan-candidates (jalanin detector ke hasil scrape, inject git hash)
- [ ] Buat script confusion matrix (precision/recall per detector + N absolut)
- [ ] Siapkan mekanisme freeze detector version
- [ ] Catat reproduibility info di `scripts/eval/README.md`:
  - Versi Node.js (`node --version`)
  - Versi dependency kunci (`npm ls` untuk packages/terkait)
  - Biar kalau re-run 2 bulan lagi dan hasilnya beda, gampang tau itu karena env atau beneran detector berubah

### Fase 2: Pengumpulan Data (Estimasi: 2-3 jam scraping + 15-20 jam labeling)
- [ ] **Time-box:** Fase ini punya batas 2 minggu. Kalau progress < 50% di minggu ke-2:
  - Keputusan eksplisit: lanjut dengan N yang ada (tandai PRELIMINARY) vs stop & cari sumber data lain
  - Jangan biarkan Fase 2 nge-drag tanpa batas jelas — lebih baik 80 sample berkualitas daripada 0 sample sempurna
- [ ] Scrape ~100-150 kandidat dari 5 kategori sumber
- [ ] Jalanin detector ke semua kandidat (catat detector version)
- [ ] **Saring/redact info sensitif** sebelum disimpan di `labeled_v1.jsonl`:
  - Nama personal di komentar reviewer
  - Email di commit messages
  - Internal context yang gak relevan
  - Terutama kalo file ini kepegang >1 orang nantinya
- [ ] Label manual — prioritas kualitas, isi `label_evidence` dengan detail, catat waktu review
- [ ] Self-agreement check: setelah 2 minggu, re-label 10% data, hitung konsistensi

### Fase 3: Analisis & Kalibrasi (Estimasi: 3-4 jam)
- [ ] Hitung confusion matrix per detector (termasuk N absolut per kelas)
- [ ] Identifikasi detector precision rendah (perlu revisi logic)
- [ ] Identifikasi detector recall rendah (perlu detector baru)
- [ ] Rekomendasi weight baru berdasarkan precision data
- [ ] ⚠️ Tandai hasil sebagai "PRELIMINARY" kalau N < 100 per kelas

### Fase 4: Implementasi (Estimasi: 4-8 jam)
- [ ] Revisi weight/threshold di engine.ts berdasarkan hasil kalibrasi
- [ ] Fix false positive yang teridentifikasi (D1 test.todo, D6 custom matcher, dll)
- [ ] Fix false negative yang teridentifikasi (Python/Go tree-sitter, D2 evasion, dll)
- [ ] Tambah validationBasis di response (precision/recall per detector)

### Fase 5: Validasi (Estimasi: 2-3 jam)
- [ ] Holdout test — jalanin di 30% data yang disimpan (split per-repo)
- [ ] Bandingkan precision/recall holdout vs kalibrasi
- [ ] Dokumentasi hasil akhir di VALIDATION-ROADMAP.md

### Fase 6: CI Integration (BARU — Estimasi: 2-3 jam)
- [ ] **Trigger:** Setiap PR yang nyentuh file detector (`src/detectors/*.ts`, `packages/mantiz-core/src/detectors/*.ts`)
- [ ] **Action:** Jalanin `confusion-matrix.ts` terhadap `labeled_v1.jsonl` secara otomatis
- [ ] **Gate starting point:** Gagal build kalau precision ATAU recall turun **>5 poin absolut**
      dari baseline `calibration-v1.md`. Angka ini bisa direvisi setelah lihat noise natural dari re-run.
- [ ] Catat history performa tiap commit biar bisa liat tren detector degradation

---

## 7. Target & Success Criteria

### Short-term (1-2 minggu) — Fase 0 + 1
- [ ] Tree-sitter delta=0 bug terfix — minimal Python/Go fixtures punya delta > 0
- [ ] 3 false positive quick win terfix (test.todo, commented assertion, honest-validator)
- [ ] Infrastruktur `/eval/ground-truth/` siap — schema, scraper, scan script
- [ ] Ground truth dataset: 50+ sample berlabel (tandai PRELIMINARY)

### Medium-term (1-2 bulan) — Fase 2 + 3
- [ ] Ground truth dataset: 100+ sample berlabel, dengan self-agreement > 90%
- [ ] Confusion matrix per detector: precision/recall terukur, N absolut per kelas
- [ ] Weight/threshold tidak lagi arbitrary — derived dari data
- [ ] Holdout test passed — precision/recall konsisten antara kalibrasi dan validasi

### Long-term (3+ bulan) — Fase 4 + 5 + 6
- [ ] Sistem bisa klaim "empirically validated"
- [ ] Response menampilkan validationBasis (precision/recall per detector)
  - Versi response dibump (`scoringVersion: "v2"`) pas weight berubah signifikan —
    biar konsumen API gak bingung skor tiba-tiba shift tanpa pemberitahuan
- [ ] CI check otomatis — tiap PR detector diukur terhadap benchmark
- [ ] Re-validasi berkala (tiap kuartal): ground truth dataset di-refresh dengan sample terbaru
      — pola AI agent cheating bakal berubah seiring waktu (agent baru, teknik evasion baru)
- [ ] Dataset mencapai N ≥ 200 dengan distribusi kelas yang balanced

---

## 8. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Label fatigue — kualitas label turun di tengah | Ground truth gak reliable | Batasi sesi labeling max 2 jam/hari; stratified sampling biar gak bosen |
| Bias sampling — cuma PR dari repo tertentu aja | Sistem overfit ke pola spesifik | Ambil dari 5+ kategori sumber berbeda |
| Label ambiguity — sukar bedain DECEPTIVE vs LEGIT | Noise di data | Kategori AMBIGUOUS dengan definisi jelas (>5 menit ragu); exclude dari training |
| Overfitting ke dataset kalibrasi | Precision tinggi di data latih, rendah di data baru | Holdout test WAJIB; split per-repo, bukan per-PR |
| Detector logic berubah selama labeling | Baseline gak konsisten | Freeze detector version; catat commit hash di metadata; snapshot kalau ada perubahan |
| PII/data sensitivity di label_evidence | Informasi personal bocor | Saring/redact info sensitif di kolom `label_evidence` — nama, email, internal context |
| Ground truth collection macet di tengah | Progress berhenti tanpa batas jelas | Time-box 2 minggu; exit criteria eksplisit: lanjut dengan N yang ada vs stop |
| Pola AI cheating berubah setelah validasi | Precision turun tanpa terdeteksi | Re-validasi berkala tiap kuartal; refresh ground truth dengan sample terbaru |
| Tree-sitter delta=0 tidak segera difix | Kalibrasi berdasarkan sistem yang separuh mati | **PRIORITAS: Fiks sebelum Fase 1** — pindah ke Fase 0 |
| Class imbalance (terlalu banyak LEGIT) | Precision/recall misleading | Report N absolut; oversampling DECEPTIVE; jangan cuma pake accuracy |
| Sample size terlalu kecil (N < 50) | Confidence interval precision ±20-30% | Tandai sebagai "PRELIMINARY"; jangan klaim angka final |
| Data leakage (repo yang sama masuk train + test) | Holdout tidak valid | Split per-repo, bukan per-PR |

---

## 9. Glossary

| Istilah | Definisi |
|---------|----------|
| **Ground Truth** | Data yang labelnya sudah dikonfirmasi benar (oleh manusia) |
| **Confusion Matrix** | Tabel TP/FP/TN/FN yang ngukur performa classifier |
| **Precision** | Dari yang di-flag, berapa % yang beneran curang |
| **Recall** | Dari yang beneran curang, berapa % yang ketangkep |
| **F1** | Harmonic mean precision & recall |
| **Face Validity** | "Kelihatannya masuk akal" — tanpa bukti empiris |
| **Empirical Validity** | "Terbukti akurat secara terukur" — dengan data |
| **Holdout** | Data yang disimpan, gak dipakai buat kalibrasi |
| **Data Leakage** | Informasi dari test set bocor ke training set — bikin validasi gak berguna |
| **Overfitting** | Sistem bagus di data latih tapi jelek di data baru |
| **Stratified Sampling** | Ambil sample proporsional per kategori, bukan random |
| **Class Imbalance** | Distribusi label gak seimbang (misal 80% LEGIT, 20% DECEPTIVE) |
| **Inter-Rater Agreement** | Konsistensi antar pemberi label (Cohen's Kappa) |
| **Self-Agreement** | Konsistensi labeler yang sama di waktu berbeda |
| **Behavioral Flag** | Sinyal statistik (odd_hours, volatility) — BUKAN bukti kebohongan |
| **Evidence Score** | Skor dari detector literal (D1-D10) — yang bisa "dituduhkan" |
| **PRELIMINARY** | Label untuk hasil kalibrasi dengan N < 100 per kelas — belum final |
| **Fase 0** | Bug fix sebelum ground truth collection — Tree-sitter + known false positives |
