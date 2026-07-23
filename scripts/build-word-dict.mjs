#!/usr/bin/env node
/**
 * Build offline word dictionary (IPA + English gloss) from open datasets:
 * - Kaikki / Wiktionary English extract (definitions / POS; up to 3 senses)
 * - open-dict-data/ipa-dict en_US (IPA phonetics)
 *
 * Sense ranking prefers unmarked modern senses: drop obsolete/archaic/rare
 * and form-of for primary when real definitions exist; among survivors, pick
 * the (etymology, POS) block with the most unmarked senses (Wiktionary's
 * productive modern entry), then its first gloss.
 *
 * Coverage is capped to learner-useful lemmas: FrequencyWords en_50k ∪ IPA ∪
 * NGSL/CEFR ∪ Wiktionary senses tagged Computing/Programming/Internet/etc.
 *
 * Output: data/word-dictionary.generated.json
 * Usage:  npm run dict:build:words
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "data", "word-dictionary.generated.json");
const cacheDir = path.join(root, "data", ".dict-cache");

const IPA_URL =
  "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt";
const KAIKKI_URL =
  "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz";
const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";
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

const MAX_GLOSSES = 3;
const MAX_SENSES_PER_WORD = 48;

/** Keep learner-useful POS; drop names, affixes, symbols, etc. */
const POS_MAP = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adjective: "adjective",
  adv: "adverb",
  adverb: "adverb",
  prep: "preposition",
  preposition: "preposition",
  conj: "conjunction",
  conjunction: "conjunction",
  det: "determiner",
  determiner: "determiner",
  article: "article",
  pron: "pronoun",
  pronoun: "pronoun",
  intj: "interjection",
  interjection: "interjection",
  num: "numeral",
  numeral: "numeral",
  number: "numeral",
  particle: "particle",
  contraction: "contraction",
};

/** Tags that should not win as the card primary. */
const BAD_PRIMARY_TAGS = new Set([
  "obsolete",
  "archaic",
  "rare",
  "historical",
  "dated",
  "slang",
  "vulgar",
  "offensive",
  "derogatory",
  "ethnic slur",
  "slur",
  "misspelling",
  "eye dialect",
  "pronunciation-spelling",
  "uncommon",
  "dialectal",
  "dialect",
]);

const FORM_OF_TAGS = new Set([
  "form-of",
  "alt-of",
  "alternative",
  "misspelling",
  "abbreviation",
  "initialism",
  "acronym",
  "clipping",
]);

/** Prefer modern topical entries slightly when block sizes are close. */
const TOPICAL_CAT_RE =
  /\b(computing|programming|software|internet|databases?|machine learning|software engineering)\b/i;

async function download(url, dest) {
  if (fs.existsSync(dest)) {
    const st = fs.statSync(dest);
    if (st.size > 1000) {
      console.log(`cache hit ${path.basename(dest)} (${st.size} bytes)`);
      return;
    }
  }
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const tmp = `${dest}.partial`;
  const file = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let written = 0;
  let lastLog = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    written += value.length;
    if (!file.write(value)) {
      await new Promise((resolve) => file.once("drain", resolve));
    }
    if (written - lastLog > 50 * 1024 * 1024) {
      lastLog = written;
      console.log(`  … ${(written / 1024 / 1024).toFixed(0)} MB`);
    }
  }
  await new Promise((resolve, reject) => {
    file.end(() => resolve());
    file.on("error", reject);
  });
  fs.renameSync(tmp, dest);
  console.log(`saved ${path.basename(dest)} (${written} bytes)`);
}

function normalizeWord(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .trim();
}

/** Single-token dictionary keys only (matches vocab tokenizer). */
function isSingleWord(word) {
  if (!word || word.length < 2 || word.length > 40) return false;
  if (/\s/.test(word)) return false;
  if (!/[a-z]/.test(word)) return false;
  if (/[^a-z'-]/.test(word)) return false;
  return true;
}

function cleanGloss(def) {
  return String(def || "")
    .replace(/\s+/g, " ")
    .replace(/^to\s+/i, "")
    .trim()
    .slice(0, 220);
}

/**
 * Narrow American IPA (ɹ/ɫ/ɝ…) → learner-dictionary style.
 * e.g. /ˈɔɹ/ → /ˈɔːr/, /ˈwɔtɝ/ → /ˈwɔtɜːr/
 */
function normalizeLearnerIpa(ipa) {
  let s = String(ipa || "");
  if (!s) return "";
  s = s.replace(/ɝ/g, "ɜːr");
  s = s.replace(/ɚ/g, "ər");
  s = s.replace(/ɹ/g, "r");
  s = s.replace(/ɫ/g, "l");
  s = s.replace(/ɡ/g, "g");
  s = s.replace(/ɔr/g, "ɔːr");
  s = s.replace(/ɑr/g, "ɑːr");
  s = s.replace(/ːː/g, "ː");
  return s;
}

function cleanIpa(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  const first = s.split(",")[0].trim();
  if (!first) return "";
  const wrapped =
    first.startsWith("/") && first.endsWith("/")
      ? first
      : `/${first.replace(/^\/+|\/+$/g, "")}/`;
  return normalizeLearnerIpa(wrapped);
}

function loadIpa(filePath) {
  const map = new Map();
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const word = normalizeWord(line.slice(0, tab));
    if (!isSingleWord(word)) continue;
    const ipa = cleanIpa(line.slice(tab + 1));
    if (!ipa) continue;
    if (!map.has(word)) map.set(word, ipa);
  }
  return map;
}

function addCsvWords(filePath, allow, wordCol = 0) {
  if (!fs.existsSync(filePath)) return 0;
  let n = 0;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    // naive CSV: take first field / requested column before comma (quoted-safe enough for these lists)
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") {
        cols.push(cur);
        cur = "";
      } else cur += ch;
    }
    cols.push(cur);
    const raw = cols[wordCol] || cols[0] || "";
    if (/^[A-Za-z_]+$/.test(raw) && raw === raw.toUpperCase() && raw !== "word") {
      // header-ish
    }
    for (const part of String(raw).split(/[\s;/|]+/)) {
      const w = normalizeWord(part);
      if (!isSingleWord(w) || allow.has(w)) continue;
      allow.add(w);
      n += 1;
    }
  }
  return n;
}

function loadAllowlist(ipaMap) {
  const allow = new Set(ipaMap.keys());
  const freqPath = path.join(cacheDir, "en_50k.txt");
  if (fs.existsSync(freqPath)) {
    for (const line of fs.readFileSync(freqPath, "utf8").split("\n")) {
      const w = normalizeWord(line.split(/\s+/)[0]);
      if (isSingleWord(w)) allow.add(w);
    }
  }
  addCsvWords(path.join(cacheDir, "NGSL_1.2_stats.csv"), allow, 0);
  addCsvWords(
    path.join(cacheDir, "NGSL_1.2_lemmatized_for_teaching.csv"),
    allow,
    0
  );
  addCsvWords(path.join(cacheDir, "SUP_lemmatized.csv"), allow, 0);
  addCsvWords(path.join(cacheDir, "cefrj-vocabulary-profile-1.5.csv"), allow, 0);
  addCsvWords(
    path.join(cacheDir, "octanove-vocabulary-profile-c1c2-1.0.csv"),
    allow,
    0
  );
  return allow;
}

function normalizePos(raw) {
  const key = String(raw || "")
    .toLowerCase()
    .trim();
  return POS_MAP[key] || null;
}

function senseTags(sense) {
  const out = [];
  for (const t of sense?.tags || []) out.push(String(t).toLowerCase());
  for (const t of sense?.raw_tags || []) out.push(String(t).toLowerCase());
  return out;
}

function senseCategories(sense) {
  const out = [];
  for (const c of sense?.categories || []) {
    if (typeof c === "string") out.push(c);
    else if (c && typeof c === "object") {
      if (c.name) out.push(String(c.name));
      if (c.orig) out.push(String(c.orig));
    }
  }
  return out;
}

function isFormOfSense(sense, tags) {
  if (sense?.form_of || sense?.alt_of) return true;
  return tags.some((t) => FORM_OF_TAGS.has(t));
}

function isBadPrimarySense(tags, gloss) {
  if (tags.some((t) => BAD_PRIMARY_TAGS.has(t))) return true;
  if (
    /\b(obsolete|archaic|rare|historical|dated|slang|vulgar|offensive)\b/i.test(
      gloss
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Prefer the productive modern Wiktionary entry: among unmarked senses,
 * choose the (etymology, POS) block with the most survivors, then its first.
 * Fall back to form-of / remaining senses when needed (e.g. are → be).
 */
function pickGlosses(meanings) {
  if (meanings.length === 0) return [];

  const good = [];
  const formOf = [];
  for (const m of meanings) {
    if (m.bad) continue;
    else if (m.formOf) formOf.push(m);
    else good.push(m);
  }
  const pool = good.length > 0 ? good : formOf.length > 0 ? formOf : meanings;

  const blocks = new Map();
  for (const m of pool) {
    const key = `${m.etym}::${m.pos || ""}`;
    let list = blocks.get(key);
    if (!list) {
      list = [];
      blocks.set(key, list);
    }
    list.push(m);
  }

  let bestKey = null;
  let bestScore = -Infinity;
  let bestFirstOrder = Infinity;
  for (const [key, list] of blocks) {
    list.sort((a, b) => a.order - b.order);
    const topicalBonus = list.some((m) => m.topical) ? 2 : 0;
    const score = list.length + topicalBonus;
    const firstOrder = list[0].order;
    if (
      score > bestScore ||
      (score === bestScore && firstOrder < bestFirstOrder)
    ) {
      bestScore = score;
      bestFirstOrder = firstOrder;
      bestKey = key;
    }
  }

  const primaryBlock = blocks.get(bestKey) || pool;
  // Within a block, prefer topical (computing/internet) senses — helps
  // abbreviations like "api" where every gloss is form-of/initialism.
  primaryBlock.sort((a, b) => {
    if (a.topical !== b.topical) return a.topical ? -1 : 1;
    return a.order - b.order;
  });
  const primary = primaryBlock[0];

  const out = [];
  const push = (m) => {
    if (!m?.gloss) return;
    if (out.some((x) => x.gloss === m.gloss)) return;
    out.push({ gloss: m.gloss, ...(m.pos ? { pos: m.pos } : {}) });
  };

  push(primary);

  const samePos = pool
    .filter((m) => m !== primary && m.pos === primary.pos)
    .sort((a, b) => a.order - b.order);
  for (const m of samePos) {
    if (out.length >= MAX_GLOSSES) break;
    push(m);
  }
  const others = pool
    .filter((m) => m !== primary)
    .sort((a, b) => a.order - b.order);
  for (const m of others) {
    if (out.length >= MAX_GLOSSES) break;
    push(m);
  }
  return out;
}

async function loadKaikki(filePath) {
  /** @type {Map<string, Array<{gloss:string,pos:string,etym:number,order:number,formOf:boolean,bad:boolean,topical:boolean}>>} */
  const byWord = new Map();
  /** @type {Set<string>} */
  const topicalWords = new Set();
  let lines = 0;
  let kept = 0;

  const input = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    lines += 1;
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.lang_code && obj.lang_code !== "en") continue;
    const word = normalizeWord(obj.word);
    if (!isSingleWord(word)) continue;
    const pos = normalizePos(obj.pos);
    if (!pos) continue;

    // kaikii stores etymology_number as a string ("1", "2", …)
    const etym = Number(obj.etymology_number) || 0;
    const senses = Array.isArray(obj.senses) ? obj.senses : [];
    let bucket = byWord.get(word);
    if (!bucket) {
      bucket = [];
      byWord.set(word, bucket);
    }

    for (const sense of senses) {
      if (bucket.length >= MAX_SENSES_PER_WORD) break;
      const glosses = Array.isArray(sense?.glosses) ? sense.glosses : [];
      const gloss = cleanGloss(glosses[0]);
      if (!gloss) continue;
      const tags = senseTags(sense);
      const cats = senseCategories(sense);
      const topical = cats.some((c) => TOPICAL_CAT_RE.test(c));
      if (topical) topicalWords.add(word);
      bucket.push({
        gloss,
        pos,
        etym,
        order: bucket.length,
        formOf: isFormOfSense(sense, tags),
        bad: isBadPrimarySense(tags, gloss),
        topical,
      });
      kept += 1;
    }

    if (lines % 500000 === 0) {
      console.log(
        `  kaikki … ${lines} lines, ${byWord.size} words, ${kept} senses`
      );
    }
  }

  console.log(
    `kaikki done: ${lines} lines → ${byWord.size} words, ${kept} senses, ${topicalWords.size} topical`
  );
  return { byWord, topicalWords };
}

async function run() {
  fs.mkdirSync(cacheDir, { recursive: true });

  const ipaPath = path.join(cacheDir, "en_US.ipa.txt");
  await download(IPA_URL, ipaPath);

  const kaikkiPath = path.join(cacheDir, "kaikki-en.jsonl.gz");
  await download(KAIKKI_URL, kaikkiPath);

  await download(FREQ_URL, path.join(cacheDir, "en_50k.txt"));
  await download(NGSL_STATS_URL, path.join(cacheDir, "NGSL_1.2_stats.csv"));
  await download(
    NGSL_LEMMA_URL,
    path.join(cacheDir, "NGSL_1.2_lemmatized_for_teaching.csv")
  );
  await download(NGSL_SUP_URL, path.join(cacheDir, "SUP_lemmatized.csv"));
  await download(CEFRJ_URL, path.join(cacheDir, "cefrj-vocabulary-profile-1.5.csv"));
  await download(
    OCTANOVE_URL,
    path.join(cacheDir, "octanove-vocabulary-profile-c1c2-1.0.csv")
  );

  const ipaMap = loadIpa(ipaPath);
  console.log(`IPA entries: ${ipaMap.size}`);

  const allow = loadAllowlist(ipaMap);
  console.log(`allowlist seeds: ${allow.size}`);

  const { byWord, topicalWords } = await loadKaikki(kaikkiPath);
  const map = new Map();
  let skipped = 0;

  for (const [word, meanings] of byWord) {
    if (!allow.has(word) && !topicalWords.has(word)) {
      skipped += 1;
      continue;
    }
    const glosses = pickGlosses(meanings);
    if (glosses.length === 0) continue;
    map.set(word, {
      word,
      gloss: glosses[0].gloss,
      glosses: glosses.length > 1 ? glosses : undefined,
      pos: glosses[0].pos,
      source: "wiktionary",
      ipa: ipaMap.get(word),
    });
  }
  console.log(`coverage filter skipped ${skipped} obscure lemmas`);

  const entries = Array.from(map.values())
    .map((e) => ({
      word: e.word,
      gloss: e.gloss,
      ...(Array.isArray(e.glosses) && e.glosses.length > 1
        ? { glosses: e.glosses }
        : {}),
      ...(e.ipa ? { ipa: e.ipa } : {}),
      ...(e.pos ? { pos: e.pos } : {}),
      ...(e.source ? { source: e.source } : {}),
    }))
    .sort((a, b) => a.word.localeCompare(b.word));

  const withIpa = entries.filter((e) => e.ipa).length;
  const withGlosses = entries.filter(
    (e) => Array.isArray(e.glosses) && e.glosses.length > 1
  ).length;
  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      wiktionary:
        "https://kaikki.org/dictionary/English/ (Wiktextract / enwiktionary)",
      ipa: "https://github.com/open-dict-data/ipa-dict",
      coverage:
        "FrequencyWords en_50k ∪ IPA ∪ NGSL/CEFR ∪ Wiktionary computing/internet topical",
    },
    count: entries.length,
    withIpa,
    withGlosses,
    entries,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(
    `wrote ${outPath} (${entries.length} entries, ${withIpa} with IPA, ${withGlosses} multi-gloss)`
  );

  for (const k of [
    "content",
    "because",
    "the",
    "however",
    "refactor",
    "commit",
    "file",
    "prompt",
    "deploy",
    "are",
    "user",
    "key",
    "build",
    "middleware",
    "api",
    "monorepo",
  ]) {
    const hit = map.get(k);
    if (!hit) {
      console.log(`MISS ${k}`);
      continue;
    }
    const alt =
      Array.isArray(hit.glosses) && hit.glosses.length > 1
        ? ` (+${hit.glosses.length - 1} alts)`
        : "";
    console.log(
      `OK  ${k} [${hit.pos || "—"}] ${hit.ipa || "—"} | ${hit.gloss}${alt}`
    );
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
