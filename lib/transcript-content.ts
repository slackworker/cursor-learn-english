/** Parsed assistant content from Cursor agent-transcripts JSONL (read-only). */

export type TranscriptTextItem = {
  type: "text";
  text: string;
};

export type TranscriptToolUseItem = {
  type: "tool_use";
  name: string;
  input: Record<string, unknown>;
};

export type TranscriptContentItem = TranscriptTextItem | TranscriptToolUseItem;

/** One assistant message line in JSONL — matches Cursor streaming step order. */
export type TranscriptAssistantStep = {
  items: TranscriptContentItem[];
};

const FILE_EDIT_TOOLS = new Set(["Write", "StrReplace", "Delete", "EditNotebook"]);

export function isFileEditTool(name: string): boolean {
  return FILE_EDIT_TOOLS.has(name);
}

export function toolUsePath(input: Record<string, unknown>): string | null {
  const path = input.path ?? input.target_notebook;
  return typeof path === "string" && path.trim() ? path.trim() : null;
}

export function toolUseLabel(name: string, input: Record<string, unknown>): string {
  const filePath = toolUsePath(input);
  if (filePath) {
    const base = filePath.split(/[/\\]/).pop() ?? filePath;
    if (isFileEditTool(name)) return base;
    return `${name} · ${base}`;
  }
  if (name === "Shell" && typeof input.command === "string") {
    const cmd = input.command.trim().split("\n")[0];
    return cmd.length > 60 ? `${cmd.slice(0, 60)}…` : cmd;
  }
  if (name === "Grep" && typeof input.pattern === "string") {
    return `Grep · ${input.pattern}`;
  }
  if (name === "Glob" && typeof input.glob_pattern === "string") {
    return `Glob · ${input.glob_pattern}`;
  }
  return name;
}

type RawContentBlock = {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
};

export function parseAssistantContent(
  content: RawContentBlock[] | undefined
): TranscriptAssistantStep | null {
  if (!content?.length) return null;

  const items: TranscriptContentItem[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      const text = block.text;
      if (text.length > 0) items.push({ type: "text", text });
      continue;
    }
    if (block.type === "tool_use" && typeof block.name === "string") {
      items.push({
        type: "tool_use",
        name: block.name,
        input:
          block.input && typeof block.input === "object" ? block.input : {},
      });
    }
  }

  return items.length > 0 ? { items } : null;
}
