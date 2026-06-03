import fs from "fs";
import { readJsonlLines, type ReadJsonlResult } from "./jsonl";

type CacheEntry<T> = {
  mtimeMs: number;
  size: number;
  result: ReadJsonlResult<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Read and parse JSONL with an in-process cache keyed by path + mtime + size.
 * Reuses parsed rows when the file has not changed (e.g. multiple API routes on home).
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

  const result = readJsonlLines(filePath, parse);
  cache.set(filePath, { mtimeMs, size, result });
  return result;
}

/** Test-only: clear all cached entries. */
export function clearJsonlCache(): void {
  cache.clear();
}
