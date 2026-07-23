import type { TranscriptToolUseItem } from "../transcript-content";
import { isEditToolName, mcpArguments, mcpToolName } from "./classify";
import { editActivityLine } from "./edit-diff";
import type { ProcessActivityItem } from "./types";

function truncateDisplay(text: string, max = 48): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function humanizeBrowserToolName(toolName: string): string {
  const rest = toolName.replace(/^browser_/, "").replace(/_/g, " ");
  if (!rest) return "Browser";
  return `Browser ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

/** Cursor-friendly line for CallMcpTool / GetMcpTools. */
export function mcpActivityLine(tool: TranscriptToolUseItem): string | null {
  if (tool.name === "GetMcpTools") return "Explored available tools";
  if (tool.name !== "CallMcpTool") return null;

  const toolName = mcpToolName(tool.input);
  const args = mcpArguments(tool.input);

  if (toolName === "browser_tabs") return "Browser tabs";
  if (toolName === "browser_navigate") {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    return url ? `Navigated to ${truncateDisplay(url)}` : "Navigated";
  }
  if (toolName === "browser_cdp") {
    const method = typeof args.method === "string" ? args.method.trim() : "";
    return method ? `CDP ${method}` : "CDP";
  }
  if (toolName === "browser_lock") {
    return args.action === "unlock" ? "Browser unlock" : "Browser lock";
  }
  if (toolName === "browser_snapshot") return "Browser snapshot";
  if (toolName === "browser_take_screenshot") return "Took screenshot";
  if (toolName === "browser_click") return "Browser click";
  if (toolName === "browser_type") return "Browser type";
  if (toolName === "browser_fill") return "Browser fill";
  if (toolName === "browser_scroll") return "Browser scroll";
  if (toolName === "browser_press_key") return "Browser key";
  if (toolName === "browser_select_option") return "Browser select";
  if (toolName === "browser_drag") return "Browser drag";
  if (toolName === "browser_highlight") return "Browser highlight";
  if (toolName === "browser_get_bounding_box") return "Browser bounding box";
  if (toolName === "browser_mouse_click_xy") return "Browser click";
  if (toolName === "mcp_auth") return "MCP auth";
  if (toolName.startsWith("browser_")) return humanizeBrowserToolName(toolName);
  return toolName || "MCP tool";
}

/** Cursor-style tool line inside an activity fold. */
export function toolActivityLine(tool: TranscriptToolUseItem): string {
  const mcpLine = mcpActivityLine(tool);
  if (mcpLine) return mcpLine;

  const input = tool.input;
  if (tool.name === "Grep" && typeof input.pattern === "string") {
    return `Grepped ${input.pattern}`;
  }
  if (tool.name === "Glob" && typeof input.glob_pattern === "string") {
    return `Searched files ${input.glob_pattern}`;
  }
  if (tool.name === "Read" && typeof input.path === "string") {
    return `Read ${input.path}`;
  }
  if (tool.name === "SemanticSearch" && typeof input.query === "string") {
    const q = input.query.trim();
    return q.length > 80
      ? `Searched code ${q.slice(0, 80)}…`
      : `Searched code ${q}`;
  }
  if (tool.name === "WebSearch" && typeof input.search_term === "string") {
    return `Searched web ${input.search_term}`;
  }
  if (tool.name === "Shell" || tool.name === "AwaitShell") {
    const desc =
      typeof input.description === "string" ? input.description.trim() : "";
    const cmd =
      typeof input.command === "string" ? input.command.trim() : "";
    // Cursor titles use Shell `description` (e.g. "Format collapse.css for
    // reading node") — not a truncated `node -e "` command prefix.
    if (desc) {
      const argv0 = cmd.split(/\s+/)[0]?.split(/[/\\]/).pop() ?? "";
      if (
        argv0 &&
        !desc.toLowerCase().split(/\s+/).includes(argv0.toLowerCase())
      ) {
        return `${desc} ${argv0}`;
      }
      return desc;
    }
    if (cmd) {
      const firstLine = cmd.split("\n")[0];
      return firstLine.length > 72
        ? `Ran ${firstLine.slice(0, 72)}…`
        : `Ran ${firstLine}`;
    }
  }
  if (isEditToolName(tool.name)) {
    return editActivityLine(tool);
  }
  if (tool.name === "Task" && typeof input.description === "string") {
    return input.description.trim() || "Task";
  }
  if (tool.name === "TodoWrite") {
    return "Checked to-do list";
  }
  return tool.name;
}

type TodoEntry = { status: string };

/**
 * Apply a TodoWrite to running list state and return the Cursor activity line.
 * merge:false replaces the list; merge:true patches by id.
 * When every known todo is completed → "Completed N of N to-dos".
 */
export function applyTodoWriteAndLabel(
  state: Map<string, TodoEntry>,
  tool: TranscriptToolUseItem
): string {
  const input = tool.input ?? {};
  const todos = Array.isArray(input.todos) ? input.todos : [];
  if (input.merge !== true) {
    state.clear();
  }
  for (const raw of todos) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.id !== "string") continue;
    const prev = state.get(rec.id);
    const status =
      typeof rec.status === "string"
        ? rec.status
        : prev?.status ?? "pending";
    state.set(rec.id, { status });
  }
  const all = [...state.values()];
  const completed = all.filter((t) => t.status === "completed").length;
  if (all.length > 0 && completed === all.length) {
    return `Completed ${completed} of ${all.length} to-dos`;
  }
  return "Checked to-do list";
}

/** Prefer precomputed line (TodoWrite state) when present. */
export function activityItemLine(
  item: Extract<ProcessActivityItem, { kind: "tool" }>
): string {
  return item.line ?? toolActivityLine(item.tool);
}
