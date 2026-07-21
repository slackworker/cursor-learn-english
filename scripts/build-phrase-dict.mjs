#!/usr/bin/env node
/**
 * Build offline phrase dictionary from open datasets covering:
 * - Phrasal verbs (verb + particle)
 * - Idioms (figurative MWEs)
 * - Discourse connectives (due to / instead of / rather than …)
 * - Prepositional idioms / fixed PPs (in terms of / in spite of …)
 * - Lexical collocations (ADJ+NOUN / VERB+NOUN) + verb–preposition pairs
 *
 * Output: data/phrase-dictionary.generated.json
 * Usage:  npm run dict:build
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "data", "phrase-dictionary.generated.json");
const cacheDir = path.join(root, "data", ".dict-cache");

const SOURCES = {
  phrasal: {
    url: "https://raw.githubusercontent.com/WithEnglishWeCan/generated-english-phrasal-verbs/master/phrasal.verbs.build.json",
    file: "phrasal.verbs.build.json",
  },
  idioms: {
    url: "https://raw.githubusercontent.com/HYU-NLP/MIDAS/main/data/EN_Idioms.json",
    file: "EN_Idioms.json",
  },
  dimlex: {
    url: "https://raw.githubusercontent.com/discourse-lab/en_dimlex/master/en_dimlex.xml",
    file: "en_dimlex.xml",
  },
  ppBegin: {
    url: "https://raw.githubusercontent.com/kenclr/ppidioms/master/pp-begin.txt",
    file: "pp-begin.txt",
  },
  ppFinal: {
    url: "https://raw.githubusercontent.com/kenclr/ppidioms/master/pp-final.txt",
    file: "pp-final.txt",
  },
  opensubs: {
    url: "https://huggingface.co/datasets/vladvlasov256/opensubs-collocations/resolve/main/data/en.jsonl",
    file: "opensubs-en.jsonl",
  },
};

/** Human-readable glosses for PDTB-style discourse senses. */
const PDTB_GLOSS = {
  "Contingency.Cause.Reason": "used to introduce a reason or cause",
  "Contingency.Cause.Result": "used to introduce a result or consequence",
  "Contingency.Condition.Hypothetical": "used to introduce a hypothetical condition",
  "Contingency.Condition.General": "used to introduce a general condition",
  "Contingency.Condition.Factual present": "used to introduce a factual condition",
  "Comparison.Contrast.Opposition": "used to contrast opposing ideas",
  "Comparison.Contrast.Juxtaposition": "used to juxtapose contrasting ideas",
  "Comparison.Contrast": "used to express contrast",
  "Comparison.Concession.Expectation": "used to concede a point against expectation",
  "Comparison.Concession.Contra-expectation": "used to mark something contrary to expectation",
  "Comparison": "used to make a comparison",
  "Expansion.Alternative.Chosen Alternative": "used to present a preferred alternative",
  "Expansion.Alternative.Disjunctive": "used to present exclusive alternatives",
  "Expansion.Alternative.Conjunctive": "used to present inclusive alternatives",
  "Expansion.Alternative": "used to present an alternative",
  "Expansion.Instantiation": "used to give an example",
  "Expansion.Conjunction": "used to add related information",
  "Expansion.Restatement.Specification": "used to restate or specify",
  "Expansion.Restatement": "used to restate an idea",
  "Expansion": "used to expand on an idea",
  "Temporal.Asynchronous.Succession": "used to mark sequence in time",
  "Temporal.Asynchronous.Precedence": "used to mark earlier time",
  "Temporal.Synchrony": "used to mark events happening at the same time",
};

/**
 * High-frequency fixed expressions often missing from idiom/phrasal-only lexicons.
 * English glosses only; kept small and pedagogical.
 */
const CORE_FIXED = [
  ["due to", "caused by; because of", "discourse"],
  ["owing to", "because of", "discourse"],
  ["thanks to", "because of (often positive)", "discourse"],
  ["according to", "as stated by; in the opinion of", "discourse"],
  ["in order to", "with the purpose of", "discourse"],
  ["so as to", "in order to", "discourse"],
  ["as well as", "and also; in addition to", "discourse"],
  ["as well", "also; too", "discourse"],
  ["based on", "founded on; derived from", "preposition"],
  ["depending on", "contingent on; according to", "preposition"],
  ["related to", "connected with", "preposition"],
  ["relevant to", "connected with the matter at hand", "preposition"],
  ["make sure", "ensure that something is done or true", "collocation"],
  ["make sure that", "ensure that", "collocation"],
  ["to ensure", "in order to make certain that", "collocation"],
  ["to avoid", "in order to prevent or keep away from", "collocation"],
  ["to clarify", "in order to make clearer", "collocation"],
  ["to verify", "in order to confirm correctness", "collocation"],
  ["it seems", "it appears that", "discourse"],
  ["it seems like", "it appears that", "discourse"],
  ["it looks like", "it appears that", "discourse"],
  ["it makes sense", "it is reasonable or understandable", "collocation"],
  ["make sense", "be reasonable or understandable", "collocation"],
  ["keep in mind", "remember; take into account", "collocation"],
  ["bear in mind", "remember; take into account", "collocation"],
  ["take into account", "consider; include in one's thinking", "collocation"],
  ["in terms of", "with regard to; concerning", "discourse"],
  ["with regard to", "concerning; about", "discourse"],
  ["with respect to", "concerning; about", "discourse"],
  ["as a matter of fact", "in reality; actually", "discourse"],
  ["by means of", "using; through the use of", "discourse"],
  ["for the sake of", "in the interest of; because of", "discourse"],
  ["in the long run", "over a long period of time", "discourse"],
  ["at least", "not less than; anyway", "discourse"],
  ["at most", "not more than", "discourse"],
  ["at all", "in any way (often with negation)", "discourse"],
  ["so far", "until now", "discourse"],
  ["for example", "as an illustration", "discourse"],
  ["for instance", "as an illustration", "discourse"],
  ["in other words", "to put it differently", "discourse"],
  ["that is to say", "in other words", "discourse"],
  ["on the one hand", "from one point of view", "discourse"],
  ["to some extent", "partly; somewhat", "discourse"],
  ["more or less", "approximately; almost", "discourse"],
  ["from scratch", "from the beginning; with no prior preparation", "collocation"],
  ["on behalf of", "as a representative of; for", "discourse"],
  ["in spite of", "despite", "discourse"],
  ["out of the box", "ready to use without special setup", "tech"],
  ["under the hood", "in the underlying implementation", "tech"],
  ["source of truth", "authoritative data source", "tech"],
  ["edge case", "rare or extreme scenario", "tech"],
  ["use case", "specific usage scenario", "tech"],
  ["best practice", "recommended standard approach", "tech"],
  ["working tree", "Git working directory", "tech"],
  ["pull request", "proposed code change for review", "tech"],
  ["merge conflict", "competing changes that must be resolved", "tech"],
  ["environment variable", "process configuration value from the environment", "tech"],
  ["environment variables", "process configuration values from the environment", "tech"],
  ["docker compose", "tool for defining multi-container Docker apps", "tech"],
  ["git diff", "show changes between Git commits or working tree", "tech"],
  ["git status", "show the status of the Git working tree", "tech"],
  ["technical debt", "accumulated cost of expedient technical choices", "tech"],
  ["code review", "inspection of code changes by peers", "tech"],
  ["unit test", "test of an individual software unit", "tech"],
  ["false positive", "incorrectly flagged as true/positive", "tech"],
  ["false negative", "incorrectly flagged as false/negative", "tech"],
  ["race condition", "bug from unsafe concurrent timing", "tech"],
  ["happy path", "main successful execution path", "tech"],
];

/**
 * Verb–preposition / verb–particle pairs often missing from phrasal dumps
 * (lemma form; conjugations expanded at load time).
 */
const CORE_VERB_PREP = [
  ["depend on", "be contingent on; rely on", "phrasal"],
  ["rely on", "depend on with trust or confidence", "phrasal"],
  ["focus on", "concentrate attention on", "phrasal"],
  ["based on", "founded on; derived from", "preposition"],
  ["consist of", "be made up of", "phrasal"],
  ["result in", "cause; lead to as an outcome", "phrasal"],
  ["account for", "explain; make up a portion of", "phrasal"],
  ["refer to", "mention; point to", "phrasal"],
  ["belong to", "be the property or member of", "phrasal"],
  ["contribute to", "help cause or add to", "phrasal"],
  ["respond to", "reply or react to", "phrasal"],
  ["adapt to", "adjust to new conditions", "phrasal"],
  ["adhere to", "follow or stick to a rule/plan", "phrasal"],
  ["amount to", "be equivalent to; add up to", "phrasal"],
  ["object to", "express disagreement with", "phrasal"],
  ["subscribe to", "agree with; formally receive", "phrasal"],
  ["comply with", "act in accordance with", "phrasal"],
  ["cope with", "deal successfully with", "phrasal"],
  ["deal with", "handle; take action regarding", "phrasal"],
  ["agree with", "have the same opinion as", "phrasal"],
  ["disagree with", "have a different opinion from", "phrasal"],
  ["interfere with", "get in the way of", "phrasal"],
  ["specialize in", "focus expertise on", "phrasal"],
  ["succeed in", "achieve success in", "phrasal"],
  ["engage in", "take part in", "phrasal"],
  ["participate in", "take part in", "phrasal"],
  ["invest in", "put resources into", "phrasal"],
  ["believe in", "have confidence in the value of", "phrasal"],
  ["persist in", "continue firmly with", "phrasal"],
];

/**
 * Learner / academic lexical collocations often absent from subtitle-derived lists.
 * Verb lemmas without articles; articles + conjugations expanded at load time.
 */
const CORE_COLLOCATIONS = [
  ["make decision", "decide; reach a conclusion", "collocation"],
  ["make progress", "advance; improve", "collocation"],
  ["make difference", "have a significant effect", "collocation"],
  ["make effort", "try hard to do something", "collocation"],
  ["make sense", "be reasonable or understandable", "collocation"],
  ["take place", "happen; occur", "collocation"],
  ["take look", "examine briefly", "collocation"],
  ["take care", "be careful; look after", "collocation"],
  ["take advantage", "use an opportunity (sometimes unfairly)", "collocation"],
  ["take account", "consider; include in thinking", "collocation"],
  ["take part", "participate", "collocation"],
  ["take action", "do something to deal with a problem", "collocation"],
  ["play role", "have a function or influence", "collocation"],
  ["play part", "contribute to an outcome", "collocation"],
  ["pay attention", "notice and listen carefully", "collocation"],
  ["raise question", "bring up an issue for discussion", "collocation"],
  ["raise concern", "express worry about something", "collocation"],
  ["raise issue", "bring a matter to attention", "collocation"],
  ["provide feedback", "give comments or evaluation", "collocation"],
  ["provide support", "give help or backing", "collocation"],
  ["provide information", "give facts or details", "collocation"],
  ["run test", "execute a test", "collocation"],
  ["run risk", "expose oneself to the possibility of harm", "collocation"],
  ["draw conclusion", "reach a judgment from evidence", "collocation"],
  ["draw attention", "make people notice", "collocation"],
  ["reach agreement", "come to a shared decision", "collocation"],
  ["reach consensus", "come to general agreement", "collocation"],
  ["solve problem", "find an answer to a difficulty", "collocation"],
  ["address issue", "deal with a matter", "collocation"],
  ["address problem", "deal with a difficulty", "collocation"],
  ["meet requirement", "satisfy a needed condition", "collocation"],
  ["meet deadline", "finish by the required time", "collocation"],
  ["set goal", "decide on a target to achieve", "collocation"],
  ["set priority", "decide what matters most", "collocation"],
  ["key point", "most important idea", "collocation"],
  ["key factor", "important contributing element", "collocation"],
  ["common practice", "usual or accepted way of doing things", "collocation"],
  ["best practice", "recommended standard approach", "collocation"],
  ["high frequency", "occurring often", "collocation"],
  ["high priority", "very important / urgent", "collocation"],
  ["strong argument", "convincing reason or claim", "collocation"],
  ["strong evidence", "convincing proof", "collocation"],
  ["clear picture", "good overall understanding", "collocation"],
  ["next step", "following action in a sequence", "collocation"],
  ["final decision", "last / settled choice", "collocation"],
  ["main reason", "primary cause or explanation", "collocation"],
  ["main goal", "primary objective", "collocation"],
  ["practical approach", "realistic way of doing something", "collocation"],
  ["detailed analysis", "careful close examination", "collocation"],
  ["further discussion", "additional talk or debate", "collocation"],
  ["general rule", "usual principle that applies broadly", "collocation"],
];

/** Common irregular verb surface forms (lemma → extras). */
const IRREGULAR_VERBS = {
  be: ["am", "is", "are", "was", "were", "been", "being"],
  make: ["makes", "made", "making"],
  take: ["takes", "took", "taken", "taking"],
  give: ["gives", "gave", "given", "giving"],
  get: ["gets", "got", "gotten", "getting"],
  go: ["goes", "went", "gone", "going"],
  come: ["comes", "came", "coming"],
  see: ["sees", "saw", "seen", "seeing"],
  do: ["does", "did", "done", "doing"],
  have: ["has", "had", "having"],
  say: ["says", "said", "saying"],
  know: ["knows", "knew", "known", "knowing"],
  think: ["thinks", "thought", "thinking"],
  find: ["finds", "found", "finding"],
  draw: ["draws", "drew", "drawn", "drawing"],
  run: ["runs", "ran", "running"],
  set: ["sets", "setting"],
  put: ["puts", "putting"],
  pay: ["pays", "paid", "paying"],
  meet: ["meets", "met", "meeting"],
  lead: ["leads", "led", "leading"],
  hold: ["holds", "held", "holding"],
  keep: ["keeps", "kept", "keeping"],
  leave: ["leaves", "left", "leaving"],
  feel: ["feels", "felt", "feeling"],
  bring: ["brings", "brought", "bringing"],
  begin: ["begins", "began", "begun", "beginning"],
  become: ["becomes", "became", "becoming"],
  show: ["shows", "showed", "shown", "showing"],
  write: ["writes", "wrote", "written", "writing"],
  read: ["reads", "reading"],
  rise: ["rises", "rose", "risen", "rising"],
  raise: ["raises", "raised", "raising"],
  play: ["plays", "played", "playing"],
  provide: ["provides", "provided", "providing"],
  solve: ["solves", "solved", "solving"],
  address: ["addresses", "addressed", "addressing"],
  reach: ["reaches", "reached", "reaching"],
  rely: ["relies", "relied", "relying"],
  depend: ["depends", "depended", "depending"],
  focus: ["focuses", "focusses", "focused", "focussed", "focusing", "focussing"],
  deal: ["deals", "dealt", "dealing"],
  based: ["based"],
};

function normalizePhrase(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\-\s]/g, " ")
    // strip dictionary placeholders like "do something", "someone's"
    .replace(/\b(do )?something\b/g, " ")
    .replace(/\b(do )?somebody\b/g, " ")
    .replace(/\bsomeone('s)?\b/g, " ")
    .replace(/\bone's\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(phrase) {
  return phrase.split(" ").filter(Boolean).length;
}

function isMatchable(phrase) {
  const n = tokenCount(phrase);
  if (n < 2 || n > 6) return false;
  if (/^\d/.test(phrase)) return false;
  if (/[^a-z'\-\s]/.test(phrase)) return false;
  return true;
}

function addEntry(map, phrase, gloss, category, source) {
  const key = normalizePhrase(phrase);
  if (!isMatchable(key) || !gloss) return false;
  if (map.has(key)) return false;
  map.set(key, {
    phrase: key,
    gloss: String(gloss).slice(0, 220),
    category,
    source,
  });
  return true;
}

/** Regular-ish surface forms for a verb lemma. */
function verbForms(lemma) {
  const v = String(lemma || "").toLowerCase();
  if (!v) return [];
  const forms = new Set([v]);
  if (IRREGULAR_VERBS[v]) {
    for (const f of IRREGULAR_VERBS[v]) forms.add(f);
    return [...forms];
  }
  if (v.endsWith("y") && v.length > 2 && !/[aeiou]y$/.test(v)) {
    forms.add(v.slice(0, -1) + "ies");
    forms.add(v.slice(0, -1) + "ied");
    forms.add(v + "ing");
  } else if (v.endsWith("e")) {
    forms.add(v + "s");
    forms.add(v + "d");
    forms.add(v.slice(0, -1) + "ing");
  } else if (v.endsWith("s") || v.endsWith("x") || v.endsWith("z") || v.endsWith("ch") || v.endsWith("sh")) {
    forms.add(v + "es");
    forms.add(v + "ed");
    forms.add(v + "ing");
  } else {
    forms.add(v + "s");
    forms.add(v + "ed");
    forms.add(v + "ing");
  }
  return [...forms];
}

function articleFor(noun) {
  return /^[aeiou]/.test(noun) ? "an" : "a";
}

/**
 * Expand lemma bigram into matchable surface variants:
 * conjugations for verbs; optional a/an/the between verb and noun.
 */
function expandLexicalVariants(bigram, kind) {
  const parts = normalizePhrase(bigram).split(" ").filter(Boolean);
  if (parts.length !== 2) return parts.length >= 2 ? [parts.join(" ")] : [];

  const [a, b] = parts;
  const out = new Set();

  if (kind === "VERB+NOUN" || kind === "verb-noun") {
    for (const vf of verbForms(a)) {
      out.add(`${vf} ${b}`);
      out.add(`${vf} ${articleFor(b)} ${b}`);
      out.add(`${vf} the ${b}`);
    }
  } else if (kind === "VERB+ADP" || kind === "verb-prep") {
    for (const vf of verbForms(a)) {
      out.add(`${vf} ${b}`);
    }
    // "based on" is already past-participle-as-adjective; keep as-is too
    out.add(`${a} ${b}`);
  } else {
    // ADJ+NOUN / other
    out.add(`${a} ${b}`);
    // light plural noun variant
    if (!b.endsWith("s")) out.add(`${a} ${b}s`);
  }

  return [...out];
}

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

function loadCoreFixed(map) {
  let added = 0;
  for (const [phrase, gloss, category] of CORE_FIXED) {
    if (addEntry(map, phrase, gloss, category, "core-fixed")) added += 1;
  }
  console.log(`core fixed expressions: +${added} (map size ${map.size})`);
}

function loadCoreVerbPrep(map) {
  let added = 0;
  for (const [phrase, gloss, category] of CORE_VERB_PREP) {
    for (const variant of expandLexicalVariants(phrase, "verb-prep")) {
      if (addEntry(map, variant, gloss, category, "core-verb-prep")) added += 1;
    }
  }
  console.log(`core verb-prep (+conjugations): +${added} (map size ${map.size})`);
}

const ADJ_NOUN_FIRST = new Set([
  "key",
  "common",
  "best",
  "high",
  "strong",
  "clear",
  "next",
  "final",
  "main",
  "practical",
  "detailed",
  "further",
  "general",
]);

function isAdjNounCollocation(phrase) {
  return ADJ_NOUN_FIRST.has(phrase.split(" ")[0]);
}

function loadCoreCollocations(map) {
  let added = 0;
  for (const [phrase, gloss, category] of CORE_COLLOCATIONS) {
    const kind = isAdjNounCollocation(phrase) ? "adj-noun" : "verb-noun";
    for (const variant of expandLexicalVariants(phrase, kind)) {
      if (addEntry(map, variant, gloss, category, "core-collocation")) added += 1;
    }
  }
  console.log(`core collocations (+articles/conjugations): +${added} (map size ${map.size})`);
}

function loadPhrasal(filePath, map) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const [key, val] of Object.entries(data)) {
    const gloss =
      (Array.isArray(val?.descriptions) && val.descriptions[0]) ||
      (Array.isArray(val?.synonyms) && val.synonyms.slice(0, 3).join("; ")) ||
      "";
    if (!gloss) continue;
    if (addEntry(map, key, gloss, "phrasal", "phrasal-verbs")) added += 1;
    for (const der of val?.derivatives || []) {
      if (addEntry(map, der, gloss, "phrasal", "phrasal-verbs")) added += 1;
    }
  }
  console.log(`phrasal verbs: +${added} (map size ${map.size})`);
}

function loadIdioms(filePath, map) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const row of data) {
    const meaning = String(row?.Meaning || "").trim();
    if (!meaning) continue;
    for (const idiom of row?.Idiom || []) {
      if (addEntry(map, idiom, meaning, "idiom", "midas")) added += 1;
    }
  }
  console.log(`idioms: +${added} (map size ${map.size})`);
}

function senseToGloss(senses) {
  for (const s of senses) {
    if (PDTB_GLOSS[s]) return PDTB_GLOSS[s];
  }
  if (senses[0]) {
    const last = senses[0].split(".").pop() || senses[0];
    return `discourse marker (${last.toLowerCase()})`;
  }
  return "discourse connective / marker";
}

function loadDimlex(filePath, map) {
  const xml = fs.readFileSync(filePath, "utf8");
  const entries = [
    ...xml.matchAll(/<entry id="[^"]*" word="([^"]+)">([\s\S]*?)<\/entry>/g),
  ];
  let added = 0;
  for (const [, word, body] of entries) {
    const phrase = normalizePhrase(word);
    if (!isMatchable(phrase)) continue;
    const senses = [...body.matchAll(/sense="([^"]+)"/g)].map((m) => m[1]);
    const gloss = senseToGloss([...new Set(senses)]);
    if (addEntry(map, phrase, gloss, "discourse", "en-dimlex")) added += 1;
  }
  console.log(`discourse markers (dimlex): +${added} (map size ${map.size})`);
}

function loadPpIdioms(filePath, map, label) {
  let added = 0;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(
      /^(.+?)\s+\((\d+)\)\s+-\s+\(([^)]*)\)\s+(.*?)\s*\(\)\s*$/
    );
    if (!m) continue;
    const phrase = m[1];
    const gloss = m[4].trim();
    if (!gloss || gloss === "nil") continue;
    if (addEntry(map, phrase, gloss, "preposition", label)) added += 1;
  }
  console.log(`PP idioms (${label}): +${added} (map size ${map.size})`);
}

/**
 * OpenSubtitles NPMI collocations (CC-BY 4.0).
 * Keep ADJ+NOUN / VERB+NOUN / VERB+ADP above a mild quality floor.
 * Light surface expansion only (articles / plural) — conjugations stay in core lists
 * to avoid blowing up the offline JSON.
 */
function loadOpensubsCollocations(filePath, map) {
  const minNpmi = {
    "ADJ+NOUN": 0.3,
    "VERB+NOUN": 0.25,
    "VERB+ADP": 0.32,
  };
  const maxPerType = 1500;
  const buckets = {
    "ADJ+NOUN": [],
    "VERB+NOUN": [],
    "VERB+ADP": [],
  };

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const type = row.type;
    if (!buckets[type]) continue;
    const bigram = normalizePhrase(row.bigram);
    if (!bigram || tokenCount(bigram) !== 2) continue;
    if (!(row.npmi >= minNpmi[type])) continue;
    if (/[^a-z\s]/.test(bigram)) continue;
    const [a, b] = bigram.split(" ");
    if (!a || !b || a.length < 3 || b.length < 2) continue;
    buckets[type].push(row);
  }

  let added = 0;
  for (const type of Object.keys(buckets)) {
    const rows = buckets[type]
      .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.npmi || 0) - (a.npmi || 0))
      .slice(0, maxPerType);

    for (const row of rows) {
      const bigram = normalizePhrase(row.bigram);
      const gloss =
        type === "ADJ+NOUN"
          ? `common adjective–noun collocation (${bigram})`
          : type === "VERB+NOUN"
            ? `common verb–noun collocation (${bigram})`
            : `common verb–preposition pair (${bigram})`;
      const category = type === "VERB+ADP" ? "phrasal" : "collocation";

      // Light variants only (no full conjugation fan-out)
      const variants = new Set([bigram]);
      if (type === "VERB+NOUN") {
        const [verb, noun] = bigram.split(" ");
        variants.add(`${verb} ${articleFor(noun)} ${noun}`);
        variants.add(`${verb} the ${noun}`);
      } else if (type === "ADJ+NOUN") {
        const [adj, noun] = bigram.split(" ");
        if (noun && !noun.endsWith("s")) variants.add(`${adj} ${noun}s`);
      }

      for (const variant of variants) {
        if (addEntry(map, variant, gloss, category, "opensubs")) added += 1;
      }
    }
    console.log(`  opensubs ${type}: kept ${rows.length}`);
  }

  console.log(`opensubs collocations: +${added} (map size ${map.size})`);
}

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const paths = {};
  for (const [key, src] of Object.entries(SOURCES)) {
    paths[key] = path.join(cacheDir, src.file);
    await download(src.url, paths[key]);
  }

  const map = new Map();
  // Discourse / PP / core first so common learner phrases keep good glosses
  loadCoreFixed(map);
  loadCoreVerbPrep(map);
  loadCoreCollocations(map);
  loadDimlex(paths.dimlex, map);
  loadPpIdioms(paths.ppBegin, map, "ppidioms");
  loadPpIdioms(paths.ppFinal, map, "ppidioms");
  loadPhrasal(paths.phrasal, map);
  loadIdioms(paths.idioms, map);
  loadOpensubsCollocations(paths.opensubs, map);

  const entries = Array.from(map.values()).sort((a, b) =>
    a.phrase.localeCompare(b.phrase)
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      coreFixed: "built-in high-frequency fixed expressions",
      coreVerbPrep: "built-in verb–preposition pairs with conjugations",
      coreCollocation: "built-in learner/academic collocations",
      dimlex: "https://github.com/discourse-lab/en_dimlex",
      ppidioms: "https://github.com/kenclr/ppidioms",
      phrasal:
        "https://github.com/WithEnglishWeCan/generated-english-phrasal-verbs",
      idioms: "https://github.com/HYU-NLP/MIDAS",
      opensubs:
        "https://huggingface.co/datasets/vladvlasov256/opensubs-collocations",
    },
    count: entries.length,
    entries,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`wrote ${outPath} (${entries.length} entries)`);

  // sanity: learner-facing phrases
  for (const k of [
    "due to",
    "instead of",
    "rather than",
    "it seems",
    "make sure",
    "in order to",
    "according to",
    "based on",
    "depend on",
    "depends on",
    "rely on",
    "make a decision",
    "play a role",
    "pay attention",
    "next step",
    "key point",
    "on behalf of",
  ]) {
    const hit = map.get(k);
    console.log(
      hit ? `OK  ${k} ← ${hit.source} | ${hit.gloss}` : `MISS ${k}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
