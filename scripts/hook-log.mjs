import fs from 'fs';
import path from 'path';
import { getCursorDir } from './default-paths.mjs';

/**
 * Read Cursor hook stdin as JSON.
 * Windows Cursor often prefixes the payload with a UTF-8 BOM (U+FEFF);
 * JSON.parse rejects that, so strip it before parsing.
 */
export function readHookStdinJson() {
  let raw = fs.readFileSync(0, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return JSON.parse(raw || '{}');
}

/** Append hook failures for diagnosis (capture scripts otherwise exit 0 silently). */
export function logHookError(scope, err) {
  try {
    const file = path.join(getCursorDir(), 'cursor-learn-english.hook-errors.log');
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    fs.appendFileSync(file, `${new Date().toISOString()} [${scope}] ${msg}\n`);
  } catch {
    // never throw from logger
  }
}
