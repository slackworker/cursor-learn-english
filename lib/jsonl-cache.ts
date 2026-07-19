import fs from "fs";
import { readJsonlLines, type ReadJsonlResult } from "./jsonl";

type CacheEntry<T> = {
  mtimeMs: number;
  size: number;
  result: ReadJsonlResult<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

function parseJsonlChunk<T>(
  raw: string,
  parse: (line: string) => T | null
): T[] {
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const item = parse(line);
    if (item != null) out.push(item);
  }
  return out;
}

/**
 * Read and parse JSONL with an in-process cache keyed by path + mtime + size.
 * Reuses parsed rows when the file has not changed (e.g. multiple API routes on home).
 * When an append-only file grows, only the new bytes are parsed and appended.
 */
export function readJsonlLinesCached<T>(
  filePath: string,
  parse: (line: string) => T | null
): ReadJsonlResult<T> {
  if (!fs.existsSync(filePath)) {
    return readJsonlLines(filePath, parse);
  }

  const { mtimeMs, size } = fs.statSync(filePath);
  const hit = cache.get(filePath) as CacheEntry<T> | undefined;
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) {
    return hit.result;
  }

  // Append-only fast path: reuse prior parse and read only the new tail.
  // Skip when the prior read was a truncated tail window (offsets are not absolute).
  if (hit && size > hit.size && !hit.result.truncated) {
    const fd = fs.openSync(filePath, "r");
    try {
      const added = Buffer.alloc(size - hit.size);
      fs.readSync(fd, added, 0, added.length, hit.size);
      const text = added.toString("utf-8");
      const newItems = parseJsonlChunk(text, parse);
      const result: ReadJsonlResult<T> = {
        items: hit.result.items.concat(newItems),
        truncated: false,
      };
      cache.set(filePath, { mtimeMs, size, result });
      return result;
    } finally {
      fs.closeSync(fd);
    }
  }

  const result = readJsonlLines(filePath, parse);
  cache.set(filePath, { mtimeMs, size, result });
  return result;
}

/** Test-only: clear all cached entries. */
export function clearJsonlCache(): void {
  cache.clear();
}
