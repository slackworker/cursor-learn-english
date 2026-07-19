import fs from 'fs';
import { appendJsonlLine } from './jsonl-daily.mjs';
import { defaultEventsPath } from './default-paths.mjs';

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
    conversation_id: input.conversation_id ?? null,
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
        session_id: input.session_id ?? input.conversation_id ?? null,
        composer_mode: input.composer_mode ?? null,
        is_background_agent: input.is_background_agent ?? null,
      };
    case 'sessionEnd':
      return {
        ...base,
        session_id: input.session_id ?? null,
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
      const subagentId = input.subagent_id ?? null;
      return {
        ...base,
        // Prefer subagent_id as the conversation key (matches thinking/transcript ids).
        conversation_id: subagentId ?? input.conversation_id ?? null,
        session_id: subagentId,
        subagent_id: subagentId,
        parent_session_id: input.parent_conversation_id ?? null,
        subagent_type: input.subagent_type ?? null,
        task: trimText(input.task || '', 2000),
        tool_call_id: input.tool_call_id ?? null,
        subagent_model: input.subagent_model ?? null,
        is_parallel_worker: input.is_parallel_worker ?? null,
        git_branch: input.git_branch ?? null,
        model: input.subagent_model ?? input.model ?? null,
      };
    }
    case 'subagentStop': {
      const fromPath = subagentIdFromTranscriptPath(input.agent_transcript_path);
      const subagentId = input.subagent_id ?? fromPath ?? input.conversation_id ?? null;
      const parentFromPath = parentIdFromTranscriptPath(input.agent_transcript_path);
      return {
        ...base,
        conversation_id: subagentId,
        session_id: subagentId,
        subagent_id: subagentId,
        parent_session_id:
          input.parent_conversation_id ?? parentFromPath ?? null,
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
      };
    }
    default:
      return base;
  }
}

try {
  const raw = fs.readFileSync(0, 'utf8');
  const input = JSON.parse(raw || '{}');
  const eventType = input.hook_event_name || input.event_type;
  if (!eventType) process.exit(0);

  const payload = buildPayload(eventType, input);
  appendJsonlLine(getEventsPath(), JSON.stringify(payload) + '\n');
} catch {
  process.exit(0);
}
