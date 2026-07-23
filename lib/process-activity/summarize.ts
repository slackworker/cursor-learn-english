import type { TranscriptToolUseItem } from "../transcript-content";
import { isBrowserMcpCall, isExploreChromeTool } from "./classify";
import type { ActivityToolKind } from "./types";

function countExploreParts(tools: TranscriptToolUseItem[]): {
  files: number;
  searches: number;
  browserActions: number;
} {
  let files = 0;
  let searches = 0;
  let browserActions = 0;
  for (const tool of tools) {
    if (isExploreChromeTool(tool.name)) continue;
    if (tool.name === "GetMcpTools") {
      // Cursor: "Explored available tools" counts as a search.
      searches += 1;
      continue;
    }
    if (isBrowserMcpCall(tool)) {
      browserActions += 1;
      continue;
    }
    if (
      tool.name === "Grep" ||
      tool.name === "Glob" ||
      tool.name === "SemanticSearch" ||
      tool.name === "WebSearch" ||
      tool.name === "WebFetch"
    ) {
      searches += 1;
    } else if (tool.name === "Read" || tool.name === "ReadLints") {
      files += 1;
    } else {
      // Non-browser CallMcpTool / FetchMcpResource / etc.
      files += 1;
    }
  }
  return { files, searches, browserActions };
}

function exploreCountLabel(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export function summarizeActivity(
  kind: ActivityToolKind,
  tools: TranscriptToolUseItem[]
): string {
  if (kind === "explore") {
    const { files, searches, browserActions } = countExploreParts(tools);
    const tailParts: string[] = [];
    if (searches > 0) {
      tailParts.push(exploreCountLabel(searches, "search", "searches"));
    }
    if (browserActions > 0) {
      tailParts.push(
        exploreCountLabel(browserActions, "browser action", "browser actions")
      );
    }
    if (files === 1 && tailParts.length > 0) {
      const read = tools.find((t) => t.name === "Read");
      const path = typeof read?.input.path === "string" ? read.input.path : "";
      const base = path.split(/[/\\]/).pop();
      if (base) {
        return `Explored ${base}, ${tailParts.join(", ")}`;
      }
    }
    const parts: string[] = [];
    if (files > 0) {
      parts.push(exploreCountLabel(files, "file", "files"));
    }
    parts.push(...tailParts);
    if (parts.length === 0) {
      // TodoWrite-only (or other chrome) folds: Cursor shows bare "Explored".
      return "Explored";
    }
    return `Explored ${parts.join(", ")}`;
  }
  if (kind === "edit") {
    return tools.length === 1 ? "Edited 1 file" : `Edited ${tools.length} files`;
  }
  if (kind === "shell") {
    return tools.length === 1
      ? "Ran 1 command"
      : `Ran ${tools.length} commands`;
  }
  return tools.length === 1 ? "Used 1 tool" : `Used ${tools.length} tools`;
}
