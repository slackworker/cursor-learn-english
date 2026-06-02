import fs from "fs";

/** Refuse full-file reads above this size; read only a tail window instead. */
export const MAX_JSONL_BYTES =
  Number(process.env.MAX_JSONL_BYTES) > 0
    ? Number(process.env.MAX_JSONL_BYTES)
    : 50 * 1024 * 1024;

/** When tailing, keep at most this many lines from the end of the file. */
export const MAX_JSONL_TAIL_LINES =
  Number(process.env.MAX_JSONL_TAIL_LINES) > 0
    ? Number(process.env.MAX_JSONL_TAIL_LINES)
    : 100_000;

export type ReadJsonlResult<T> = {
  items: T[];
  /** True when the file exceeded MAX_JSONL_BYTES and only the tail was read. */
  truncated: boolean;
};

function readFileTailUtf8(filePath: string, maxBytes: number): string {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  if (size === 0) return "";

  const readSize = Math.min(size, maxBytes);
  const buffer = Buffer.alloc(readSize);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, readSize, size - readSize);
  } finally {
    fs.closeSync(fd);
  }

  let content = buffer.toString("utf-8");
  if (readSize < size) {
    const firstNewline = content.indexOf("\n");
    if (firstNewline !== -1) {
      content = content.slice(firstNewline + 1);
    }
  }
  return content;
}

function parseJsonlLines<T>(
  raw: string,
  parse: (line: string) => T | null,
  maxLines?: number
): T[] {
  const lines = raw.trim().split("\n").filter(Boolean);
  const slice =
    maxLines != null && lines.length > maxLines
      ? lines.slice(-maxLines)
      : lines;
  const out: T[] = [];
  for (const line of slice) {
    const item = parse(line);
    if (item != null) out.push(item);
  }
  return out;
}

/**
 * Read JSONL from disk. Small files are read whole; large files read only the
 * trailing byte window (append-only logs keep recent events at the end).
 */
export function readJsonlLines<T>(
  filePath: string,
  parse: (line: string) => T | null
): ReadJsonlResult<T> {
  if (!fs.existsSync(filePath)) {
    return { items: [], truncated: false };
  }

  const size = fs.statSync(filePath).size;
  if (size === 0) {
    return { items: [], truncated: false };
  }

  const truncated = size > MAX_JSONL_BYTES;
  const raw = truncated
    ? readFileTailUtf8(filePath, MAX_JSONL_BYTES)
    : fs.readFileSync(filePath, "utf-8");

  const items = parseJsonlLines(
    raw,
    parse,
    truncated ? MAX_JSONL_TAIL_LINES : undefined
  );

  return { items, truncated };
}
