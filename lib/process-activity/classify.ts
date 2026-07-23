import type { TranscriptToolUseItem } from "../transcript-content";
import type { ActivityToolKind } from "./types";

/** UI-chrome tools Cursor does not put in Explored / Ran folds. */
const SKIP_PROCESS_TOOLS = new Set([
  "AskQuestion",
  "SwitchMode",
  "GenerateImage",
]);

/** Shown inside Explored (does not count toward files/searches). */
export function isExploreChromeTool(name: string): boolean {
  return name === "TodoWrite";
}

export function isSkippedProcessTool(name: string): boolean {
  return SKIP_PROCESS_TOOLS.has(name);
}

export function classifyToolName(name: string): "task" | ActivityToolKind {
  if (name === "Task") return "task";
  if (
    name === "Grep" ||
    name === "Glob" ||
    name === "SemanticSearch" ||
    name === "WebSearch" ||
    name === "WebFetch" ||
    name === "Read" ||
    name === "ReadLints" ||
    name === "FetchMcpResource" ||
    name === "GetMcpTools" ||
    name === "CallMcpTool"
  ) {
    return "explore";
  }
  if (
    name === "Write" ||
    name === "StrReplace" ||
    name === "Delete" ||
    name === "EditNotebook"
  ) {
    return "edit";
  }
  if (name === "Shell" || name === "AwaitShell") return "shell";
  return "other";
}

export function isEditToolName(name: string): boolean {
  return (
    name === "Write" ||
    name === "StrReplace" ||
    name === "Delete" ||
    name === "EditNotebook"
  );
}

export function mcpToolName(input: Record<string, unknown>): string {
  return typeof input.toolName === "string" ? input.toolName : "";
}

export function mcpArguments(
  input: Record<string, unknown>
): Record<string, unknown> {
  const args = input.arguments;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

/** CallMcpTool against browser MCP (cursor-ide-browser / browser_*). */
export function isBrowserMcpCall(tool: TranscriptToolUseItem): boolean {
  if (tool.name !== "CallMcpTool") return false;
  const name = mcpToolName(tool.input);
  if (name.startsWith("browser_")) return true;
  return tool.input.server === "cursor-ide-browser";
}
