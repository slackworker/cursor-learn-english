import os from "os";
import path from "path";

export function getHomeDir(): string {
  return os.platform() === "win32"
    ? process.env.USERPROFILE || os.homedir()
    : process.env.HOME || os.homedir();
}

/** Override with CURSOR_DASHBOARD_DATA_DIR; default: ~/projects/cursor-learn-english/data */
export function getDataDir(): string {
  if (process.env.CURSOR_DASHBOARD_DATA_DIR) {
    return process.env.CURSOR_DASHBOARD_DATA_DIR;
  }
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
