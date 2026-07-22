import fs from "fs";
import os from "os";
import path from "path";

export const PATHS_CONFIG_BASENAME = "cursor-learn-english.paths.json";

export function getHomeDir(): string {
  return os.platform() === "win32"
    ? process.env.USERPROFILE || os.homedir()
    : process.env.HOME || os.homedir();
}

/** ~/.cursor (or %USERPROFILE%\.cursor on Windows) */
export function getCursorDir(): string {
  return path.join(getHomeDir(), ".cursor");
}

export function getPathsConfigPath(cursorDir: string = getCursorDir()): string {
  return path.join(cursorDir, PATHS_CONFIG_BASENAME);
}

/**
 * Read dataDir from ~/.cursor/cursor-learn-english.paths.json if present.
 * Written by setup-cursor-hooks.mjs so Hooks / Web share one data root.
 */
export function readConfiguredDataDir(
  cursorDir: string = getCursorDir()
): string | null {
  const configPath = getPathsConfigPath(cursorDir);
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { dataDir?: unknown };
    if (parsed && typeof parsed.dataDir === "string" && parsed.dataDir.trim()) {
      return parsed.dataDir.trim();
    }
  } catch {
    // missing or invalid
  }
  return null;
}

/**
 * Priority:
 * 1. CURSOR_DASHBOARD_DATA_DIR env
 * 2. ~/.cursor/cursor-learn-english.paths.json
 * 3. ~/projects/cursor-learn-english/data
 */
export function getDataDir(): string {
  if (process.env.CURSOR_DASHBOARD_DATA_DIR) {
    return process.env.CURSOR_DASHBOARD_DATA_DIR;
  }
  const configured = readConfiguredDataDir();
  if (configured) return configured;
  return path.join(getHomeDir(), "projects", "cursor-learn-english", "data");
}

export function defaultEventsPath(): string {
  return path.join(getDataDir(), "cursor-events.jsonl");
}

export function defaultThinkingCorpusPath(): string {
  return path.join(getDataDir(), "thinking-corpus.jsonl");
}

export function defaultPromptCorpusPath(): string {
  return path.join(getDataDir(), "prompt-corpus.jsonl");
}
