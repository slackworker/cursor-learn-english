#!/usr/bin/env node
/**
 * Build offline word dictionary (IPA + English gloss) from open datasets:
 * - Wordset Dictionary (definitions / POS; keep up to 3 senses, auto-pick primary)
 * - open-dict-data/ipa-dict en_US (IPA phonetics)
 *
 * Output: data/word-dictionary.generated.json
 * Usage:  npm run dict:build:words
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "data", "word-dictionary.generated.json");
const cacheDir = path.join(root, "data", ".dict-cache");

const IPA_URL =
  "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt";
const WORDSET_BASE =
  "https://raw.githubusercontent.com/wordset/wordset-dictionary/master/data";

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

/**
 * Always-win overrides (tech / learner senses preferred over Wordset's first sense).
 * IPA may be empty — filled from ipa-dict when available.
 */
const CORE_OVERRIDE = [
  ["api", "", "application programming interface", "noun"],
  ["repo", "", "short for repository; project source tree", "noun"],
  ["refactor", "/ɹiˈfæktɚ/", "restructure code without changing behavior", "verb"],
  ["lint", "", "static analysis that flags style or code issues", "verb"],
  ["linter", "", "tool that runs lint checks", "noun"],
  ["commit", "", "record a snapshot of changes in version control", "verb"],
  ["branch", "", "diverging line of development in version control", "noun"],
  ["merge", "", "combine changes from different branches", "verb"],
  ["deploy", "", "release software to a target environment", "verb"],
  ["endpoint", "", "URL or route exposing an API operation", "noun"],
  ["middleware", "", "software layer between request and handler", "noun"],
  ["schema", "", "structure or shape of data", "noun"],
  ["payload", "", "data carried by a request or message", "noun"],
  ["token", "", "unit of text or an auth credential", "noun"],
  ["prompt", "", "input text given to a language model", "noun"],
  ["corpus", "", "collection of texts used for analysis", "noun"],
  ["vocab", "", "short for vocabulary", "noun"],
  ["glossary", "", "list of terms with brief definitions", "noun"],
  ["phonetic", "", "related to speech sounds", "adjective"],
  ["ipa", "", "International Phonetic Alphabet", "noun"],
  ["file", "", "a set of related records or a named data object on disk", "noun"],
  ["code", "", "instructions written in a programming language", "noun"],
  ["bug", "", "defect or error in software", "noun"],
  ["cache", "", "temporary storage for faster reuse", "noun"],
  ["stack", "", "layered set of technologies, or LIFO data structure", "noun"],
  ["query", "", "request for data, especially from a database", "noun"],
  ["server", "", "computer or process that provides services to clients", "noun"],
  ["client", "", "program or device that requests services from a server", "noun"],
  ["build", "", "compile or assemble a software package", "verb"],
  ["debug", "", "find and fix defects in software", "verb"],
  ["render", "", "generate UI or output from data/templates", "verb"],
  ["parse", "", "analyze text or data according to a grammar/format", "verb"],
];

/**
 * Wordset omits many closed-class / ultra-high-frequency words.
 * Gap-fill only when missing; IPA filled from ipa-dict when blank.
 */
const CORE_FUNCTION = [
  ["the", "", "definite article; used before a specific noun", "article"],
  ["to", "", "marks an infinitive, direction, or recipient", "preposition"],
  ["of", "", "belonging to; relating to; made from", "preposition"],
  ["and", "", "connects words or clauses of equal weight", "conjunction"],
  ["that", "", "introduces a clause; points to something", "conjunction"],
  ["it", "", "refers to a thing, situation, or impersonal subject", "pronoun"],
  ["for", "", "intended to benefit; because of; during", "preposition"],
  ["with", "", "accompanied by; using; having", "preposition"],
  ["you", "", "the person or people being addressed", "pronoun"],
  ["this", "", "the one nearby or just mentioned", "determiner"],
  ["from", "", "starting at; originating in; because of", "preposition"],
  ["an", "", "indefinite article before a vowel sound", "article"],
  ["my", "", "belonging to the speaker", "determiner"],
  ["would", "", "past of will; used for polite or hypothetical meaning", "verb"],
  ["their", "", "belonging to them", "determiner"],
  ["what", "", "asks for information; the thing that", "pronoun"],
  ["if", "", "on the condition that; whether", "conjunction"],
  ["who", "", "asks about or refers to a person", "pronoun"],
  ["which", "", "asks about or refers to a choice among things", "pronoun"],
  ["me", "", "object form of I", "pronoun"],
  ["when", "", "at what time; at the time that", "adverb"],
  ["into", "", "to the inside of; becoming", "preposition"],
  ["your", "", "belonging to the person addressed", "determiner"],
  ["could", "", "past of can; used for possibility or polite requests", "verb"],
  ["them", "", "object form of they", "pronoun"],
  ["than", "", "used in comparisons", "conjunction"],
  ["its", "", "belonging to it", "determiner"],
  ["how", "", "in what way; to what extent", "adverb"],
  ["our", "", "belonging to us", "determiner"],
  ["because", "", "for the reason that", "conjunction"],
  ["these", "", "plural of this", "determiner"],
  ["us", "", "object form of we", "pronoun"],
  ["or", "", "presents an alternative", "conjunction"],
  ["but", "", "introduces a contrast", "conjunction"],
  ["not", "", "makes a verb or adjective negative", "adverb"],
  ["as", "", "in the role of; while; because; equally", "conjunction"],
  ["at", "", "in a place or time; toward", "preposition"],
  ["by", "", "near; through the agency of; not later than", "preposition"],
  ["on", "", "in contact with a surface; about a topic", "preposition"],
  ["in", "", "inside; during; using a language/medium", "preposition"],
  ["is", "", "third-person singular present of be", "verb"],
  ["are", "", "present plural of be", "verb"],
  ["was", "", "past singular of be", "verb"],
  ["were", "", "past plural of be", "verb"],
  ["be", "", "exist; occur; used as a linking or auxiliary verb", "verb"],
  ["been", "", "past participle of be", "verb"],
  ["being", "", "present participle of be; existence", "verb"],
  ["have", "", "possess; experience; used as an auxiliary", "verb"],
  ["has", "", "third-person singular of have", "verb"],
  ["had", "", "past of have", "verb"],
  ["do", "", "perform; used as an auxiliary for questions/negation", "verb"],
  ["does", "", "third-person singular of do", "verb"],
  ["did", "", "past of do", "verb"],
  ["will", "", "marks future; be willing to", "verb"],
  ["can", "", "be able to; be allowed to", "verb"],
  ["may", "", "possibility or permission", "verb"],
  ["might", "", "possibility (often weaker than may)", "verb"],
  ["should", "", "advice, expectation, or obligation", "verb"],
  ["shall", "", "formal future or obligation", "verb"],
  ["must", "", "necessity or strong obligation", "verb"],
  ["about", "", "concerning; approximately; around", "preposition"],
  ["above", "", "at a higher level than", "preposition"],
  ["across", "", "from one side to the other of", "preposition"],
  ["after", "", "later than; following", "preposition"],
  ["against", "", "in opposition to; next to", "preposition"],
  ["along", "", "from one end toward the other of", "preposition"],
  ["among", "", "in the middle of; one of", "preposition"],
  ["around", "", "on all sides of; approximately", "preposition"],
  ["before", "", "earlier than; in front of", "preposition"],
  ["behind", "", "at the back of", "preposition"],
  ["below", "", "at a lower level than", "preposition"],
  ["beneath", "", "under; lower than", "preposition"],
  ["beside", "", "next to", "preposition"],
  ["between", "", "in the space separating two things", "preposition"],
  ["beyond", "", "on the farther side of; exceeding", "preposition"],
  ["during", "", "throughout the time of", "preposition"],
  ["except", "", "not including", "preposition"],
  ["inside", "", "within", "preposition"],
  ["near", "", "close to", "preposition"],
  ["off", "", "away from; not on", "preposition"],
  ["onto", "", "to a position on", "preposition"],
  ["out", "", "away from the inside", "adverb"],
  ["outside", "", "beyond the limits of", "preposition"],
  ["over", "", "above; more than; during", "preposition"],
  ["since", "", "from a past time until now; because", "preposition"],
  ["through", "", "from one end/side to the other; by means of", "preposition"],
  ["throughout", "", "in every part of; during the whole of", "preposition"],
  ["toward", "", "in the direction of", "preposition"],
  ["towards", "", "in the direction of", "preposition"],
  ["under", "", "below; less than", "preposition"],
  ["until", "", "up to the time of", "preposition"],
  ["upon", "", "on (often formal)", "preposition"],
  ["via", "", "by way of; through", "preposition"],
  ["without", "", "not having; in the absence of", "preposition"],
  ["although", "", "in spite of the fact that", "conjunction"],
  ["though", "", "even if; however", "conjunction"],
  ["unless", "", "except if", "conjunction"],
  ["while", "", "during the time that; whereas", "conjunction"],
  ["whereas", "", "in contrast with the fact that", "conjunction"],
  ["whether", "", "if … or not; expressing a choice", "conjunction"],
  ["nor", "", "and not; used after neither", "conjunction"],
  ["yet", "", "up to now; nevertheless", "adverb"],
  ["also", "", "in addition; too", "adverb"],
  ["just", "", "exactly; recently; only", "adverb"],
  ["only", "", "solely; no more than", "adverb"],
  ["even", "", "used to emphasize surprise or extremity", "adverb"],
  ["still", "", "continuing; nevertheless", "adverb"],
  ["already", "", "before now; sooner than expected", "adverb"],
  ["always", "", "at all times; every time", "adverb"],
  ["never", "", "at no time; not ever", "adverb"],
  ["often", "", "many times; frequently", "adverb"],
  ["sometimes", "", "on some occasions", "adverb"],
  ["usually", "", "most of the time", "adverb"],
  ["really", "", "in fact; very", "adverb"],
  ["very", "", "to a high degree", "adverb"],
  ["too", "", "also; more than enough", "adverb"],
  ["so", "", "to such a degree; therefore", "adverb"],
  ["then", "", "at that time; next; in that case", "adverb"],
  ["there", "", "in that place; used to introduce existence", "adverb"],
  ["here", "", "in this place", "adverb"],
  ["where", "", "in or to what place", "adverb"],
  ["why", "", "for what reason", "adverb"],
  ["quite", "", "to a fairly high degree; completely", "adverb"],
  ["rather", "", "preferably; to some degree", "adverb"],
  ["almost", "", "nearly; not quite", "adverb"],
  ["enough", "", "as much as needed", "determiner"],
  ["each", "", "every one considered separately", "determiner"],
  ["every", "", "all members of a group, taken one by one", "determiner"],
  ["any", "", "one or some, without specifying which", "determiner"],
  ["some", "", "an unspecified amount or number", "determiner"],
  ["many", "", "a large number of", "determiner"],
  ["much", "", "a large amount of", "determiner"],
  ["more", "", "a greater amount or number", "determiner"],
  ["most", "", "the greatest amount or number", "determiner"],
  ["few", "", "a small number of", "determiner"],
  ["little", "", "a small amount of; not much", "determiner"],
  ["other", "", "different; additional", "determiner"],
  ["another", "", "one more; a different one", "determiner"],
  ["such", "", "of the type previously mentioned", "determiner"],
  ["same", "", "identical; not different", "adjective"],
  ["own", "", "belonging to oneself", "adjective"],
  ["both", "", "the two; the one and the other", "determiner"],
  ["either", "", "one or the other of two", "determiner"],
  ["neither", "", "not one and not the other of two", "determiner"],
  ["all", "", "the whole number or amount of", "determiner"],
  ["no", "", "not any; used to give a negative answer", "determiner"],
  ["yes", "", "used to agree or affirm", "interjection"],
  ["he", "", "male person previously mentioned", "pronoun"],
  ["she", "", "female person previously mentioned", "pronoun"],
  ["they", "", "people or things previously mentioned", "pronoun"],
  ["we", "", "the speaker and at least one other person", "pronoun"],
  ["him", "", "object form of he", "pronoun"],
  ["her", "", "object form of she; belonging to her", "pronoun"],
  ["his", "", "belonging to him", "determiner"],
  ["himself", "", "reflexive form of he", "pronoun"],
  ["herself", "", "reflexive form of she", "pronoun"],
  ["itself", "", "reflexive form of it", "pronoun"],
  ["themselves", "", "reflexive form of they", "pronoun"],
  ["yourself", "", "reflexive form of you", "pronoun"],
  ["myself", "", "reflexive form of I", "pronoun"],
  ["someone", "", "some person", "pronoun"],
  ["somebody", "", "some person", "pronoun"],
  ["something", "", "some thing; an unspecified object", "pronoun"],
  ["anyone", "", "any person", "pronoun"],
  ["anybody", "", "any person", "pronoun"],
  ["anything", "", "any thing; whatever", "pronoun"],
  ["everyone", "", "every person", "pronoun"],
  ["everybody", "", "every person", "pronoun"],
  ["everything", "", "all things", "pronoun"],
  ["nobody", "", "no person", "pronoun"],
  ["nothing", "", "not anything", "pronoun"],
  ["however", "", "in whatever way; nevertheless", "adverb"],
  ["therefore", "", "for that reason", "adverb"],
  ["thus", "", "in this way; as a result", "adverb"],
  ["instead", "", "as an alternative", "adverb"],
  ["otherwise", "", "in a different way; if not", "adverb"],
  ["meanwhile", "", "at the same time", "adverb"],
  ["furthermore", "", "in addition; moreover", "adverb"],
  ["moreover", "", "in addition to what has been said", "adverb"],
  ["nevertheless", "", "in spite of that", "adverb"],
  ["nonetheless", "", "in spite of that", "adverb"],
];

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
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`saved ${path.basename(dest)} (${buf.length} bytes)`);
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
  s = s.replace(/ɡ/g, "g"); // IPA g (U+0261) → ASCII g
  // Common rhotic vowel lengthening used in AmE learner dictionaries
  s = s.replace(/ɔr/g, "ɔːr");
  s = s.replace(/ɑr/g, "ɑːr");
  s = s.replace(/ːː/g, "ː");
  return s;
}

function cleanIpa(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // ipa-dict: "/ˈfoo/, /ˈbar/" → first form
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

/**
 * Niche / marked senses that should not win as the card primary.
 * Keep this list narrow — broad domain labels (biology, anatomy…) often
 * mark the *main* sense and must not trigger recovery.
 */
const NICHE_SENSE_RE =
  /\b(drug|drugs|narcotic|heroin|cocaine|opium|slang|vulgar|archaic|obsolete|heraldry|nautical|theology|dialect|offensive|derogatory|taboo|hebrew alphabet|greek alphabet|letter of the|taxonomic|indehiscent|spermatozoa|semen)\b/i;
const MARKED_SENSE_RE =
  /\b(selfishly|unethically|immorally|illegally|vulgarly)\b/i;

const MAX_GLOSSES = 3;

function isBadPrimarySense(meaning) {
  const def = String(meaning?.def || "");
  return NICHE_SENSE_RE.test(def) || MARKED_SENSE_RE.test(def);
}

function sensePos(meaning) {
  const pos = String(meaning?.speech_part || "").toLowerCase();
  return pos || undefined;
}

/**
 * Primary = first Wordset sense, unless it is clearly niche/marked.
 * Wordset examples often sit on rare senses, so we do not prefer them.
 * When recovering, prefer a surviving noun (common for content words).
 */
function pickPrimaryMeaning(meanings) {
  if (meanings.length === 0) return null;
  const first = meanings[0];
  if (!isBadPrimarySense(first)) return first;
  const good = meanings.filter((m) => !isBadPrimarySense(m));
  if (good.length === 0) return first;
  return (
    good.find((m) => sensePos(m) === "noun") || good[0]
  );
}

/** Primary first, then other senses (same POS → other non-niche → rest), capped. */
function pickGlossList(meanings, primary) {
  const out = [];
  const primaryPos = sensePos(primary);
  const push = (m) => {
    const gloss = cleanGloss(m?.def);
    if (!gloss) return;
    if (out.some((x) => x.gloss === gloss)) return;
    out.push({ gloss, ...(sensePos(m) ? { pos: sensePos(m) } : {}) });
  };

  push(primary);

  for (const m of meanings) {
    if (out.length >= MAX_GLOSSES) break;
    if (m === primary || isBadPrimarySense(m)) continue;
    if (primaryPos && sensePos(m) !== primaryPos) continue;
    push(m);
  }
  for (const m of meanings) {
    if (out.length >= MAX_GLOSSES) break;
    if (m === primary || isBadPrimarySense(m)) continue;
    push(m);
  }
  for (const m of meanings) {
    if (out.length >= MAX_GLOSSES) break;
    if (out.some((x) => x.gloss === cleanGloss(m?.def))) continue;
    push(m);
  }
  return out;
}

function loadWordsetLetter(filePath, map) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const entry of Object.values(data)) {
    const word = normalizeWord(entry?.word);
    if (!isSingleWord(word) || map.has(word)) continue;
    const meanings = (Array.isArray(entry?.meanings) ? entry.meanings : []).filter(
      (m) => m?.def
    );
    const picked = pickPrimaryMeaning(meanings);
    if (!picked) continue;
    const glosses = pickGlossList(meanings, picked);
    if (glosses.length === 0) continue;
    map.set(word, {
      word,
      gloss: glosses[0].gloss,
      glosses: glosses.length > 1 ? glosses : undefined,
      pos: glosses[0].pos || sensePos(picked),
      source: "wordset",
    });
    added += 1;
  }
  return added;
}

function applyCoreRows(rows, map, ipaMap, { override }) {
  let n = 0;
  for (const [word, ipa, gloss, pos] of rows) {
    const key = normalizeWord(word);
    if (!key || !isSingleWord(key)) continue;
    if (!override && map.has(key)) continue;
    const resolvedIpa = cleanIpa(ipa) || ipaMap.get(key) || undefined;
    const cleaned = cleanGloss(gloss);
    map.set(key, {
      word: key,
      gloss: cleaned,
      // Local rows are intentional single-sense overrides.
      glosses: undefined,
      ipa: resolvedIpa,
      pos,
      source: "local",
    });
    n += 1;
  }
  return n;
}

async function run() {
  fs.mkdirSync(cacheDir, { recursive: true });

  const ipaPath = path.join(cacheDir, "en_US.ipa.txt");
  await download(IPA_URL, ipaPath);

  for (const letter of LETTERS) {
    const dest = path.join(cacheDir, `wordset-${letter}.json`);
    await download(`${WORDSET_BASE}/${letter}.json`, dest);
  }

  const ipaMap = loadIpa(ipaPath);
  console.log(`IPA entries: ${ipaMap.size}`);

  const map = new Map();
  for (const letter of LETTERS) {
    const file = path.join(cacheDir, `wordset-${letter}.json`);
    const n = loadWordsetLetter(file, map);
    console.log(`wordset ${letter}.json → ${n} new`);
  }

  // Attach IPA where available
  for (const [word, entry] of map) {
    const ipa = ipaMap.get(word);
    if (ipa) entry.ipa = ipa;
  }

  const nFunc = applyCoreRows(CORE_FUNCTION, map, ipaMap, { override: true });
  const nOver = applyCoreRows(CORE_OVERRIDE, map, ipaMap, { override: true });
  console.log(`core function ${nFunc}; core override ${nOver}`);

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
      wordset: "https://github.com/wordset/wordset-dictionary",
      ipa: "https://github.com/open-dict-data/ipa-dict",
      coreFunction: "built-in high-frequency function words (Wordset gaps)",
      coreOverride: "built-in tech / learner sense overrides",
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
    console.log(`OK  ${k} ${hit.ipa || "—"} | ${hit.gloss}${alt}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
