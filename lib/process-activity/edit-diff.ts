import type { TranscriptToolUseItem } from "../transcript-content";

function splitDiffLines(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

/**
 * Line add/delete counts via LCS — matches Cursor edit titles
 * (e.g. DialogueTimeline.tsx +1 -1, process-fold.css +54 -2).
 */
export function lineDiffStats(
  oldText: string,
  newText: string
): { plus: number; minus: number } {
  const a = splitDiffLines(oldText);
  const b = splitDiffLines(newText);
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return { plus: 0, minus: 0 };
  // Cap DP size for huge Write payloads; fall back to full replace counts.
  if (m * n > 250_000) {
    return { plus: n, minus: m };
  }
  const prev = new Array<number>(n + 1).fill(0);
  const cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = 0;
    for (let j = 1; j <= n; j += 1) {
      cur[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], cur[j - 1]);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = cur[j];
  }
  const lcs = prev[n];
  return { plus: n - lcs, minus: m - lcs };
}

export function editDiffStatsFromTool(
  tool: TranscriptToolUseItem
): { plus: number; minus: number } | null {
  const input = tool.input ?? {};
  if (tool.name === "StrReplace") {
    const oldS = typeof input.old_string === "string" ? input.old_string : null;
    const newS = typeof input.new_string === "string" ? input.new_string : null;
    if (oldS == null || newS == null) return null;
    return lineDiffStats(oldS, newS);
  }
  if (tool.name === "Write") {
    const contents =
      typeof input.contents === "string"
        ? input.contents
        : typeof input.content === "string"
          ? input.content
          : null;
    if (contents == null) return null;
    return { plus: splitDiffLines(contents).length, minus: 0 };
  }
  if (tool.name === "Delete") {
    return null;
  }
  return null;
}

/** Cursor file-type glyph before the edit basename. */
export function editFileIcon(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext === "tsx" || ext === "jsx") return "⚛";
  if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") {
    return "#";
  }
  if (ext === "json" || ext === "jsonc") return "{}";
  if (ext === "md" || ext === "mdx") return "MD";
  if (
    ext === "ts" ||
    ext === "js" ||
    ext === "mjs" ||
    ext === "cjs" ||
    ext === "mts" ||
    ext === "cts"
  ) {
    return "JS";
  }
  return "·";
}

/** Cursor edit card title: "⚛ DialogueTimeline.tsx +1 -1". */
export function editActivityLine(tool: TranscriptToolUseItem): string {
  const path = typeof tool.input.path === "string" ? tool.input.path : "";
  const base = path.split(/[/\\]/).pop() || tool.name;
  const icon = editFileIcon(path || base);
  const stats = editDiffStatsFromTool(tool);
  if (stats) {
    return `${icon} ${base} +${stats.plus} -${stats.minus}`;
  }
  return `${icon} ${base}`;
}

/** Changed lines for a compact Cursor-like edit preview. */
export function editDiffPreviewLines(
  tool: TranscriptToolUseItem
): { type: "add" | "del"; text: string }[] {
  const input = tool.input ?? {};
  if (tool.name === "StrReplace") {
    const oldS = typeof input.old_string === "string" ? input.old_string : "";
    const newS = typeof input.new_string === "string" ? input.new_string : "";
    const a = splitDiffLines(oldS);
    const b = splitDiffLines(newS);
    const m = a.length;
    const n = b.length;
    if (m * n > 250_000) {
      return [
        ...a.slice(0, 40).map((text) => ({ type: "del" as const, text })),
        ...b.slice(0, 40).map((text) => ({ type: "add" as const, text })),
      ];
    }
    // Backtrack LCS to emit only changed lines (order preserved).
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array<number>(n + 1).fill(0)
    );
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1] + 1
            : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const out: { type: "add" | "del"; text: string }[] = [];
    let i = m;
    let j = n;
    const stack: { type: "add" | "del"; text: string }[] = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        i -= 1;
        j -= 1;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        stack.push({ type: "add", text: b[j - 1] });
        j -= 1;
      } else if (i > 0) {
        stack.push({ type: "del", text: a[i - 1] });
        i -= 1;
      }
    }
    for (let k = stack.length - 1; k >= 0; k -= 1) out.push(stack[k]);
    return out;
  }
  if (tool.name === "Write") {
    const contents =
      typeof input.contents === "string"
        ? input.contents
        : typeof input.content === "string"
          ? input.content
          : "";
    return splitDiffLines(contents)
      .slice(0, 80)
      .map((text) => ({ type: "add" as const, text }));
  }
  return [];
}
