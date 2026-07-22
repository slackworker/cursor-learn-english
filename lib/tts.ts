/** Strip markdown / code noise so browser TTS reads natural language. */
export function stripMarkdownForTTS(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[a-zA-Z_][a-zA-Z0-9_]*\/[a-zA-Z0-9_/.\-]+/g, " ") // file paths
    .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, " ") // camelCase identifiers
    .replace(/\.[a-z][a-z0-9_-]*/gi, " ") // CSS class selectors
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*-{3,}\s*$/gm, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Split long text into utterance-sized chunks.
 * Chrome often stalls mid-speech on very long single utterances.
 */
export function chunkTextForTTS(text: string, maxLen = 220): string[] {
  const plain = text.trim();
  if (!plain) return [];
  if (plain.length <= maxLen) return [plain];

  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i]!;
    if (!".!?。！？…".includes(ch)) continue;
    let end = i + 1;
    while (end < plain.length && /\s/.test(plain[end]!)) end++;
    const piece = plain.slice(start, end).trim();
    if (piece) sentences.push(piece);
    start = end;
    i = end - 1;
  }
  const rest = plain.slice(start).trim();
  if (rest) sentences.push(rest);

  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      flush();
      for (let i = 0; i < sentence.length; i += maxLen) {
        const piece = sentence.slice(i, i + maxLen).trim();
        if (piece) chunks.push(piece);
      }
      continue;
    }
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length > maxLen) {
      flush();
      buf = sentence;
    } else {
      buf = next;
    }
  }
  flush();
  return chunks.filter(Boolean);
}

/**
 * Word/phrase + primary English gloss in one utterance.
 * Prefer punctuation pause over separate speak() calls — Edge often inserts
 * multi-second gaps between queued utterances.
 */
export function buildVocabSpeakText(term: string, gloss?: string): string {
  const t = term.trim();
  if (!t) return "";
  const g = gloss?.trim();
  if (!g) return t;
  // Period + em dash: slightly longer than "." alone, still one continuous speak.
  return `${t}. — ${g}`;
}
