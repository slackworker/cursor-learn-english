export type ResponseSegment = {
  text: string;
  timestamp: string;
  model?: string | null;
};

export type TimelineThinking = {
  text: string;
  timestamp: string;
  model: string;
  duration_ms: number;
  generation_id: string;
};

export type TimelineTool = {
  event_type: "postToolUse" | "postToolUseFailure";
  timestamp: string;
  tool_name?: string | null;
  duration?: number;
  failure_type?: string | null;
};

export type TimelineRoundInput = {
  thinking: TimelineThinking[];
  tools: TimelineTool[];
  response?: {
    text: string;
    timestamp: string;
    model?: string | null;
  };
  response_segments?: ResponseSegment[];
};

export type DialogueTimelineBlock =
  | { kind: "thinking"; timestamp: string; data: TimelineThinking }
  | { kind: "response"; timestamp: string; data: { text: string; model?: string | null } }
  | { kind: "tool"; timestamp: string; data: TimelineTool }
  | { kind: "tool-group"; timestamp: string; endTimestamp: string; tools: TimelineTool[] };

const TRANSCRIPT_TS_PREFIX = "__transcript_";

function isSyntheticTimestamp(ts: string): boolean {
  return ts.startsWith(TRANSCRIPT_TS_PREFIX);
}

/** Prefer transcript text when segment counts align; keep event timestamps for ordering. */
export function mergeTranscriptSegments(
  responseSegments: ResponseSegment[],
  transcriptSegments: string[]
): ResponseSegment[] {
  if (transcriptSegments.length === 0) return responseSegments;
  if (responseSegments.length === 0) {
    return transcriptSegments.map((text, i) => ({
      text,
      timestamp: `${TRANSCRIPT_TS_PREFIX}${i}`,
    }));
  }
  if (transcriptSegments.length === responseSegments.length) {
    return responseSegments.map((seg, i) => ({
      ...seg,
      text: transcriptSegments[i] || seg.text,
    }));
  }
  if (transcriptSegments.length > responseSegments.length) {
    const lastModel = responseSegments[responseSegments.length - 1]?.model;
    return transcriptSegments.map((text, i) => ({
      text,
      timestamp:
        responseSegments[i]?.timestamp ?? `${TRANSCRIPT_TS_PREFIX}${i}`,
      model: responseSegments[i]?.model ?? lastModel,
    }));
  }
  return responseSegments;
}

function getResponseSegments(
  round: Pick<TimelineRoundInput, "response" | "response_segments">,
  transcriptSegments?: string[]
): ResponseSegment[] {
  let segments = round.response_segments ?? [];
  if (segments.length === 0 && round.response?.text) {
    segments = [
      {
        text: round.response.text,
        timestamp: round.response.timestamp,
        model: round.response.model,
      },
    ];
  }
  if (transcriptSegments?.length) {
    segments = mergeTranscriptSegments(segments, transcriptSegments);
  }
  return segments;
}

function responseSegmentBlock(seg: ResponseSegment): DialogueTimelineBlock {
  return {
    kind: "response",
    timestamp: isSyntheticTimestamp(seg.timestamp) ? "" : seg.timestamp,
    data: { text: seg.text, model: seg.model },
  };
}

/**
 * Interleave transcript segments with thinking/tools when per-segment event
 * timestamps are missing or duplicated. Matches Cursor: thinking → reply →
 * tools in that thinking window → next thinking …
 */
function interleaveByThinkingPhases(
  thinking: TimelineThinking[],
  segments: ResponseSegment[],
  tools: TimelineTool[]
): DialogueTimelineBlock[] {
  const sortedThinking = [...thinking].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const sortedTools = [...tools].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const blocks: DialogueTimelineBlock[] = [];
  const usedToolIndices = new Set<number>();

  const appendToolsBetween = (afterTs: string, beforeTs?: string) => {
    for (let i = 0; i < sortedTools.length; i += 1) {
      if (usedToolIndices.has(i)) continue;
      const tool = sortedTools[i];
      if (tool.timestamp <= afterTs) continue;
      if (beforeTs && tool.timestamp >= beforeTs) continue;
      usedToolIndices.add(i);
      blocks.push({ kind: "tool", timestamp: tool.timestamp, data: tool });
    }
  };

  if (sortedThinking.length === 0) {
    for (const seg of segments) blocks.push(responseSegmentBlock(seg));
    for (const data of sortedTools) {
      blocks.push({ kind: "tool", timestamp: data.timestamp, data });
    }
    return blocks;
  }

  for (let i = 0; i < sortedThinking.length; i += 1) {
    const think = sortedThinking[i];
    blocks.push({ kind: "thinking", timestamp: think.timestamp, data: think });
    if (i < segments.length) blocks.push(responseSegmentBlock(segments[i]));
    appendToolsBetween(think.timestamp, sortedThinking[i + 1]?.timestamp);
  }

  for (let i = sortedThinking.length; i < segments.length; i += 1) {
    blocks.push(responseSegmentBlock(segments[i]));
  }

  const lastThinkTs = sortedThinking[sortedThinking.length - 1]?.timestamp ?? "";
  appendToolsBetween(lastThinkTs);

  return blocks;
}

function shouldInterleaveByPhase(segments: ResponseSegment[]): boolean {
  if (segments.some((s) => isSyntheticTimestamp(s.timestamp))) return true;
  if (segments.length <= 1) return false;
  const uniqueTs = new Set(segments.map((s) => s.timestamp).filter(Boolean));
  return uniqueTs.size < segments.length;
}

const KIND_ORDER: Record<DialogueTimelineBlock["kind"], number> = {
  thinking: 0,
  tool: 1,
  "tool-group": 1,
  response: 2,
};

function groupConsecutiveToolBlocks(blocks: DialogueTimelineBlock[]): DialogueTimelineBlock[] {
  const result: DialogueTimelineBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.kind !== "tool") {
      result.push(block);
      i += 1;
      continue;
    }
    const tools: TimelineTool[] = [];
    let startTs = block.timestamp;
    let endTs = block.timestamp;
    while (i < blocks.length && blocks[i].kind === "tool") {
      const toolBlock = blocks[i] as Extract<DialogueTimelineBlock, { kind: "tool" }>;
      tools.push(toolBlock.data);
      endTs = toolBlock.timestamp;
      i += 1;
    }
    result.push({ kind: "tool-group", timestamp: startTs, endTimestamp: endTs, tools });
  }
  return result;
}

export function summarizeToolNames(tools: TimelineTool[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const name = tool.tool_name || "unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))
    .join(", ");
}

export function buildDialogueTimeline(
  round: TimelineRoundInput,
  transcriptSegments?: string[]
): DialogueTimelineBlock[] {
  const segments = getResponseSegments(round, transcriptSegments);
  const hasContent =
    segments.length > 0 || round.thinking.length > 0 || round.tools.length > 0;
  if (!hasContent) return [];

  const allHaveRealTimestamps =
    segments.every((s) => s.timestamp && !isSyntheticTimestamp(s.timestamp)) &&
    round.thinking.every((t) => Boolean(t.timestamp)) &&
    round.tools.every((t) => Boolean(t.timestamp));

  if (!shouldInterleaveByPhase(segments) && allHaveRealTimestamps) {
    const timed: DialogueTimelineBlock[] = [];
    for (const data of round.thinking) {
      timed.push({ kind: "thinking", timestamp: data.timestamp, data });
    }
    for (const seg of segments) {
      timed.push({
        kind: "response",
        timestamp: seg.timestamp,
        data: { text: seg.text, model: seg.model },
      });
    }
    for (const data of round.tools) {
      timed.push({ kind: "tool", timestamp: data.timestamp, data });
    }
    timed.sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp);
      if (cmp !== 0) return cmp;
      return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    });
    return groupConsecutiveToolBlocks(timed);
  }

  return groupConsecutiveToolBlocks(
    interleaveByThinkingPhases(round.thinking, segments, round.tools)
  );
}

export function formatTimelineTime(timestamp: string): string {
  if (!timestamp || isSyntheticTimestamp(timestamp)) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) {
    return timestamp.slice(0, 19).replace("T", " ");
  }
  return timestamp;
}
