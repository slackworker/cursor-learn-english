#!/usr/bin/env node
/**
 * Build offline word-difficulty lexicon for vocab filtering:
 * - NGSL 1.2 (rank + lemma expansions)
 * - CEFR-J Vocabulary Profile + Octanove C1/C2
 * - Approximate Zipf from OpenSubtitles FrequencyWords (en_50k)
 *
 * Output: data/word-difficulty.generated.json
 * Usage:  npm run dict:build:difficulty
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "data", "word-difficulty.generated.json");
const cacheDir = path.join(root, "data", ".dict-cache");

const NGSL_STATS_URL =
  "https://raw.githubusercontent.com/FabriceBoyer/word_lists/main/ngsl/1.2/csv/NGSL_1.2_stats.csv";
const NGSL_LEMMA_URL =
  "https://raw.githubusercontent.com/FabriceBoyer/word_lists/main/ngsl/1.2/csv/NGSL_1.2_lemmatized_for_teaching.csv";
const NGSL_SUP_URL =
  "https://raw.githubusercontent.com/FabriceBoyer/word_lists/main/ngsl/1.2/csv/SUP_lemmatized.csv";
const CEFRJ_URL =
  "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv";
const OCTANOVE_URL =
  "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv";
const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";

const CEFR_ORDER = { a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6 };

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`cache hit ${path.basename(dest)}`);
    return;
  }
  console.log(`fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function normalizeWord(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^['"]+|['"]+$/g, "");
}

function isToken(w) {
  return /^[a-z][a-z'-]*[a-z]$|^[a-z]$/.test(w) && w.length <= 40;
}

/** Minimal CSV splitter (handles quoted fields). */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsvRows(filePath, { restJoinKey } = {}) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    if (restJoinKey && header.includes(restJoinKey)) {
      // NGSL lemma files: Word,Lemmas — Lemmas is an unquoted comma list.
      row[header[0]] = cols[0] ?? "";
      row[restJoinKey] = cols.slice(1).join(",");
    } else {
      for (let j = 0; j < header.length; j++) {
        row[header[j]] = cols[j] ?? "";
      }
    }
    rows.push(row);
  }
  return { header, rows };
}

function expandSlashForms(headword) {
  return String(headword || "")
    .split("/")
    .map((p) => normalizeWord(p.replace(/\./g, "")))
    .filter(Boolean);
}

function easierCefr(a, b) {
  if (!a) return b;
  if (!b) return a;
  return CEFR_ORDER[a] <= CEFR_ORDER[b] ? a : b;
}

function buildNgsl(statsPath, lemmaPath, supPath) {
  const { rows: statsRows } = readCsvRows(statsPath);
  const lemmaRank = new Map();
  for (const row of statsRows) {
    const lemma = normalizeWord(row.Lemma);
    const rank = Number(row.Rank);
    if (!lemma || !Number.isFinite(rank) || rank <= 0) continue;
    lemmaRank.set(lemma, rank);
  }

  const ranks = {};
  const assign = (word, rank) => {
    if (!isToken(word)) return;
    const prev = ranks[word];
    if (prev == null || rank < prev) ranks[word] = rank;
  };

  const { rows: lemmaRows } = readCsvRows(lemmaPath, {
    restJoinKey: "Lemmas",
  });
  for (const row of lemmaRows) {
    const head = normalizeWord(row.Word);
    const rank = lemmaRank.get(head);
    if (rank == null) continue;
    assign(head, rank);
    const extras = String(row.Lemmas || "")
      .split(",")
      .map((s) => normalizeWord(s))
      .filter(Boolean);
    for (const form of extras) assign(form, rank);
  }

  // Days / months supplementary list — treat as "known basics" (rank after NGSL).
  const { rows: supRows } = readCsvRows(supPath, { restJoinKey: "Lemmas" });
  const supBase = 9000;
  let i = 0;
  for (const row of supRows) {
    const head = normalizeWord(row.Word);
    const rank = supBase + i;
    i += 1;
    assign(head, rank);
    const extras = String(row.Lemmas || "")
      .split(",")
      .map((s) => normalizeWord(s))
      .filter(Boolean);
    for (const form of extras) assign(form, rank);
  }

  return {
    lemmaCount: lemmaRank.size,
    formCount: Object.keys(ranks).length,
    ranks,
  };
}

function buildCefr(cefrPath, octanovePath) {
  const levels = {};
  const ingest = (filePath) => {
    const { rows } = readCsvRows(filePath);
    for (const row of rows) {
      const level = normalizeWord(row.CEFR);
      if (!CEFR_ORDER[level]) continue;
      for (const form of expandSlashForms(row.headword)) {
        if (!isToken(form)) continue;
        levels[form] = easierCefr(levels[form], level);
      }
    }
  };
  ingest(cefrPath);
  ingest(octanovePath);
  return {
    count: Object.keys(levels).length,
    levels,
  };
}

function buildZipf(freqPath) {
  const lines = fs.readFileSync(freqPath, "utf8").split(/\r?\n/).filter(Boolean);
  const counts = new Map();
  let total = 0;
  for (const line of lines) {
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const word = normalizeWord(line.slice(0, sp));
    const count = Number(line.slice(sp + 1));
    if (!isToken(word) || !Number.isFinite(count) || count <= 0) continue;
    counts.set(word, (counts.get(word) || 0) + count);
    total += count;
  }

  const scores = {};
  for (const [word, count] of counts) {
    // Zipf ≈ log10(frequency per billion tokens); matches wordfreq-style scale.
    const zipf = Math.log10((count / total) * 1e9);
    scores[word] = Math.round(zipf * 100) / 100;
  }

  return {
    count: Object.keys(scores).length,
    corpusTokens: total,
    scores,
  };
}

async function run() {
  fs.mkdirSync(cacheDir, { recursive: true });

  const ngslStats = path.join(cacheDir, "NGSL_1.2_stats.csv");
  const ngslLemma = path.join(cacheDir, "NGSL_1.2_lemmatized_for_teaching.csv");
  const ngslSup = path.join(cacheDir, "SUP_lemmatized.csv");
  const cefrj = path.join(cacheDir, "cefrj-vocabulary-profile-1.5.csv");
  const octanove = path.join(cacheDir, "octanove-vocabulary-profile-c1c2-1.0.csv");
  const freq = path.join(cacheDir, "en_50k.txt");

  await download(NGSL_STATS_URL, ngslStats);
  await download(NGSL_LEMMA_URL, ngslLemma);
  await download(NGSL_SUP_URL, ngslSup);
  await download(CEFRJ_URL, cefrj);
  await download(OCTANOVE_URL, octanove);
  await download(FREQ_URL, freq);

  const ngsl = buildNgsl(ngslStats, ngslLemma, ngslSup);
  const cefr = buildCefr(cefrj, octanove);
  const zipf = buildZipf(freq);

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      ngslStats: NGSL_STATS_URL,
      ngslLemmas: NGSL_LEMMA_URL,
      ngslSup: NGSL_SUP_URL,
      cefrj: CEFRJ_URL,
      octanove: OCTANOVE_URL,
      frequencyWords: FREQ_URL,
      citations: {
        ngsl: "Browne, C., Culligan, B., & Phillips, J. NGSL 1.2 (CC BY-SA 4.0)",
        cefrj:
          "CEFR-J Wordlist (Tono Lab) via openlanguageprofiles/olp-en-cefrj",
        zipf: "HermitDave FrequencyWords 2018 en_50k (OpenSubtitles-derived)",
      },
    },
    ngsl: {
      lemmaCount: ngsl.lemmaCount,
      formCount: ngsl.formCount,
      ranks: ngsl.ranks,
    },
    cefr: {
      count: cefr.count,
      levels: cefr.levels,
    },
    zipf: {
      count: zipf.count,
      corpusTokens: zipf.corpusTokens,
      scores: zipf.scores,
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(payload));
  const mb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
  console.log(
    `wrote ${outPath} (${mb} MB) ngslForms=${ngsl.formCount} cefr=${cefr.count} zipf=${zipf.count}`
  );

  for (const w of ["the", "was", "because", "refactor", "abandon", "ephemeral"]) {
    console.log(
      `${w}: ngsl=${ngsl.ranks[w] ?? "—"} cefr=${cefr.levels[w] ?? "—"} zipf=${zipf.scores[w] ?? "—"}`
    );
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
