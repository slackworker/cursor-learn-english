/**
 * Deduplicate twin afterAgentThought captures.
 * Cursor often fires the same thought twice ~10ms apart with generation_ids
 * like `<uuid>` and `<uuid>-N-xxxx` (same text / duration_ms / conversation_id).
 */
import fs from 'fs';
import path from 'path';

/** Max gap between twin writes to treat as the same thought. */
export const TWIN_WINDOW_MS = 5_000;

/** How many trailing bytes to scan for recent duplicates on append. */
export const RECENT_TAIL_BYTES = 256 * 1024;

const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 5;

export function isThinkingDuplicate(a, b, windowMs = TWIN_WINDOW_MS) {
  if (!a || !b) return false;
  if ((a.conversation_id || '') !== (b.conversation_id || '')) return false;
  if ((a.text || '') !== (b.text || '')) return false;
  if ((Number(a.duration_ms) || 0) !== (Number(b.duration_ms) || 0)) return false;

  const ta = Date.parse(a.timestamp || '');
  const tb = Date.parse(b.timestamp || '');
  if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > windowMs) {
    return false;
  }
  return true;
}

/**
 * Keep first of each twin pair (order-preserving).
 * @returns {{ kept: object[], removed: number }}
 */
export function dedupeThinkingRecords(records, windowMs = TWIN_WINDOW_MS) {
  const kept = [];
  let removed = 0;
  for (const rec of records) {
    const prev = kept[kept.length - 1];
    if (prev && isThinkingDuplicate(prev, rec, windowMs)) {
      removed += 1;
      continue;
    }
    kept.push(rec);
  }
  return { kept, removed };
}

/** Parse JSONL text into records; skip blank / invalid lines. */
export function parseThinkingJsonl(raw) {
  const records = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // keep unparsable lines as opaque pass-through via null sentinel — callers filter
    }
  }
  return records;
}

/**
 * Read the tail of a JSONL file and return recent parsed records (oldest → newest).
 */
export function readRecentThinkingRecords(filePath, maxBytes = RECENT_TAIL_BYTES) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return [];
  }
  try {
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size <= 0) return [];
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    let text = buf.toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl >= 0) text = text.slice(nl + 1);
    }
    return parseThinkingJsonl(text);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * True if `record` duplicates a recent line already in the append target.
 */
export function isDuplicateOfRecentFile(filePath, record, windowMs = TWIN_WINDOW_MS) {
  const recent = readRecentThinkingRecords(filePath);
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const prev = recent[i];
    const tp = Date.parse(prev.timestamp || '');
    const tr = Date.parse(record.timestamp || '');
    if (Number.isFinite(tp) && Number.isFinite(tr) && tr - tp > windowMs) {
      break;
    }
    if (isThinkingDuplicate(prev, record, windowMs)) return true;
  }
  return false;
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

/**
 * Exclusive create lock so twin hook processes serialize check+append.
 * @returns {() => void} unlock
 */
export function acquireAppendLock(targetPath) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = `${targetPath}.appendlock`;
  const started = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      return () => {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore
        }
      };
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      if (Date.now() - started >= LOCK_WAIT_MS) {
        // Stale lock: take over so capture never blocks the agent forever.
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // ignore
        }
        continue;
      }
      sleepSync(LOCK_POLL_MS);
    }
  }
}

/**
 * Under lock: skip if recent twin exists, otherwise run `append`.
 * @returns {'written' | 'duplicate'}
 */
export function appendThinkingUnlessDuplicate(targetPath, record, append) {
  const unlock = acquireAppendLock(targetPath);
  try {
    if (isDuplicateOfRecentFile(targetPath, record)) {
      return 'duplicate';
    }
    append();
    return 'written';
  } finally {
    unlock();
  }
}
