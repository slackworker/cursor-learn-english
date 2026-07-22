import { appendJsonlLine } from './jsonl-daily.mjs';
import { defaultEventsPath } from './default-paths.mjs';
import { logHookError, readHookStdinJson } from './hook-log.mjs';

const MAX_TEXT_LEN = 20000;

function getEventsPath() {
  if (process.env.EVENTS_JSONL_PATH) return process.env.EVENTS_JSONL_PATH;
  if (process.env.CURSOR_EVENTS_PATH) return process.env.CURSOR_EVENTS_PATH;
  return defaultEventsPath();
}

function trimText(s, max = MAX_TEXT_LEN) {
  if (typeof s !== 'string') return '';
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/** Strip whitespace/newlines from Cursor hook ids (tool_call_id sometimes embeds \\n). */
function sanitizeId(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, '').trim();
  return cleaned || null;
}

/** Extract subagent id from .../subagents/<id>.jsonl (or .txt) paths. */
function subagentIdFromTranscriptPath(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
  const normalized = transcriptPath.replace(/\\/g, '/');
  const marker = '/subagents/';
  const idx = normalized.lastIndexOf(marker);
  if (idx < 0) return null;
  const rest = normalized.slice(idx + marker.length);
  const file = rest.split('/')[0] || '';
  const id = file.replace(/\.(jsonl|txt)$/i, '');
  return id || null;
}

/** Parent session id from .../<parent>/subagents/<id>.jsonl */
function parentIdFromTranscriptPath(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
  const normalized = transcriptPath.replace(/\\/g, '/');
  const marker = '/subagents/';
  const idx = normalized.lastIndexOf(marker);
  if (idx < 0) return null;
  const before = normalized.slice(0, idx);
  const parts = before.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function buildPayload(eventType, input) {
  const base = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    conversation_id: sanitizeId(input.conversation_id),
    model: input.model ?? null,
  };
  switch (eventType) {
    case 'beforeSubmitPrompt':
      return {
        ...base,
        prompt_length: (input.prompt || '').length,
        prompt_text: trimText(input.prompt || ''),
      };
    case 'afterAgentResponse':
      return {
        ...base,
        text_length: (input.text || '').length,
        response_text: trimText(input.text || ''),
      };
    case 'afterAgentThought':
      return {
        ...base,
        duration_ms: input.duration_ms ?? 0,
        generation_id: input.generation_id ?? null,
        text_preview: trimText(input.text, 500),
      };
    case 'postToolUse':
      return {
        ...base,
        tool_name: input.tool_name ?? null,
        duration: input.duration ?? 0,
      };
    case 'postToolUseFailure':
      return {
        ...base,
        tool_name: input.tool_name ?? null,
        failure_type: input.failure_type ?? null,
      };
    case 'sessionStart':
      return {
        ...base,
        conversation_id: sanitizeId(input.conversation_id) ?? base.conversation_id,
        session_id:
          sanitizeId(input.session_id) ?? sanitizeId(input.conversation_id) ?? null,
        composer_mode: input.composer_mode ?? null,
        is_background_agent: input.is_background_agent ?? null,
      };
    case 'sessionEnd':
      return {
        ...base,
        conversation_id: sanitizeId(input.conversation_id) ?? base.conversation_id,
        session_id: sanitizeId(input.session_id) ?? sanitizeId(input.conversation_id) ?? null,
        reason: input.reason ?? null,
        duration_ms: input.duration_ms ?? 0,
        is_background_agent: input.is_background_agent ?? null,
      };
    case 'stop':
      return { ...base, status: input.status ?? null, loop_count: input.loop_count ?? 0 };
    case 'preCompact':
      return {
        ...base,
        context_tokens: input.context_tokens ?? 0,
        context_usage_percent: input.context_usage_percent ?? 0,
        message_count: input.message_count ?? 0,
      };
    case 'afterFileEdit':
      return {
        ...base,
        file_path: input.file_path ?? null,
        edits_count: Array.isArray(input.edits) ? input.edits.length : 0,
      };
    case 'subagentStart': {
      // Hook subagent_id is often a tool_call_id (call-…), not the transcript UUID.
      const hookId =
        sanitizeId(input.subagent_id) ?? sanitizeId(input.tool_call_id) ?? null;
      const parentId = sanitizeId(input.parent_conversation_id);
      return {
        ...base,
        conversation_id: hookId ?? sanitizeId(input.conversation_id),
        session_id: hookId,
        subagent_id: hookId,
        parent_session_id: parentId,
        subagent_type: input.subagent_type ?? null,
        task: trimText(input.task || '', 2000),
        tool_call_id: sanitizeId(input.tool_call_id) ?? hookId,
        subagent_model: input.subagent_model ?? null,
        is_parallel_worker: input.is_parallel_worker ?? null,
        git_branch: input.git_branch ?? null,
        model: input.subagent_model ?? input.model ?? null,
      };
    }
    case 'subagentStop': {
      const fromPath = sanitizeId(
        subagentIdFromTranscriptPath(input.agent_transcript_path)
      );
      const hookId =
        sanitizeId(input.subagent_id) ?? sanitizeId(input.tool_call_id) ?? null;
      // Prefer transcript UUID when present; call-* is kept as tool_call_id.
      const canonicalId = fromPath ?? hookId ?? sanitizeId(input.conversation_id);
      const parentFromPath = sanitizeId(
        parentIdFromTranscriptPath(input.agent_transcript_path)
      );
      return {
        ...base,
        conversation_id: canonicalId,
        session_id: canonicalId,
        subagent_id: hookId ?? canonicalId,
        parent_session_id:
          sanitizeId(input.parent_conversation_id) ?? parentFromPath,
        subagent_type: input.subagent_type ?? null,
        status: input.status ?? null,
        task: trimText(input.task || '', 2000),
        description: trimText(input.description || '', 500),
        summary: trimText(input.summary || '', 2000),
        duration_ms: input.duration_ms ?? 0,
        message_count: input.message_count ?? null,
        tool_call_count: input.tool_call_count ?? null,
        loop_count: input.loop_count ?? 0,
        modified_files: Array.isArray(input.modified_files)
          ? input.modified_files.slice(0, 50)
          : null,
        agent_transcript_path: input.agent_transcript_path ?? null,
        tool_call_id: sanitizeId(input.tool_call_id) ?? hookId,
      };
    }
    default:
      return base;
  }
}

try {
  const input = readHookStdinJson();
  const eventType = input.hook_event_name || input.event_type;
  if (!eventType) process.exit(0);

  const payload = buildPayload(eventType, input);
  appendJsonlLine(getEventsPath(), JSON.stringify(payload) + '\n');
} catch (err) {
  logHookError('capture-event', err);
  process.exit(0);
}
