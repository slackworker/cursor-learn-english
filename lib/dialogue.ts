import { getEvents } from "./events";
import { getThinking, getPromptCorpusPath } from "./thinking";
import { readMergedJsonlLinesCached } from "./jsonl-daily";

type PromptRecord = {
  conversation_id: string;
  prompt: string;
  timestamp: string;
};

type ResponseEvent = {
  event_type: "afterAgentResponse";
  conversation_id: string | null;
  timestamp: string;
  model?: string | null;
  response_text?: string;
};

type ToolEvent = {
  event_type: "postToolUse" | "postToolUseFailure";
  conversation_id: string | null;
  timestamp: string;
  tool_name?: string | null;
  duration?: number;
  failure_type?: string | null;
};

type ThinkingItem = {
  text: string;
  timestamp: string;
  model: string;
  duration_ms: number;
  generation_id: string;
};

export type DialogueRound = {
  id: string;
  conversation_id: string;
  prompt: string;
  prompt_timestamp: string;
  response?: {
    text: string;
    timestamp: string;
    model?: string | null;
    segment_count?: number;
  };
  thinking: ThinkingItem[];
  tools: Array<{
    event_type: "postToolUse" | "postToolUseFailure";
    timestamp: string;
    tool_name?: string | null;
    duration?: number;
    failure_type?: string | null;
  }>;
};

function parseJsonlLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function readPrompts(opts?: { from?: string; to?: string }): { items: PromptRecord[]; truncated: boolean } {
  return readMergedJsonlLinesCached(getPromptCorpusPath(), parseJsonlLine<PromptRecord>, opts);
}

function groupByConversation<T extends { conversation_id: string | null }>(items: T[]) {
  const byConv = new Map<string, T[]>();
  for (const item of items) {
    const cid = item.conversation_id || "";
    if (!cid) continue;
    const list = byConv.get(cid) ?? [];
    list.push(item);
    byConv.set(cid, list);
  }
  return byConv;
}

export function getDialogueRounds(params: {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  highlight?: string;
  conversationId?: string;
}): { rounds: DialogueRound[]; total: number; truncated: boolean } {
  const { page = 1, pageSize = 10, from, to, highlight, conversationId } = params;

  const { items: prompts, truncated: promptsTruncated } = readPrompts({ from, to });
  const { events, truncated: eventsTruncated } = getEvents(from, to);
  const { groups: thinkingGroups, truncated: thinkingTruncated } = getThinking({
    page: 1,
    pageSize: 100000,
    from,
    to,
  });

  const responses = events.filter(
    (e): e is ResponseEvent => e.event_type === "afterAgentResponse"
  );
  const tools = events.filter(
    (e): e is ToolEvent =>
      e.event_type === "postToolUse" || e.event_type === "postToolUseFailure"
  );

  const responseByConv = groupByConversation(responses);
  const toolsByConv = groupByConversation(tools);

  const thinkingFlat = thinkingGroups.flatMap((g) =>
    g.items.map((i) => ({
      ...i,
      conversation_id: g.conversation_id,
    }))
  );
  const thinkingByConv = groupByConversation(thinkingFlat);

  const promptsByConv = new Map<string, PromptRecord[]>();
  for (const p of prompts) {
    const cid = p.conversation_id || "";
    if (!cid) continue;
    const list = promptsByConv.get(cid) ?? [];
    list.push(p);
    promptsByConv.set(cid, list);
  }

  const rounds: DialogueRound[] = [];
  for (const [cid, list] of promptsByConv.entries()) {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const convResponses = (responseByConv.get(cid) ?? []).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    const convTools = (toolsByConv.get(cid) ?? []).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    const convThinking = (thinkingByConv.get(cid) ?? []).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    for (let i = 0; i < list.length; i += 1) {
      const prompt = list[i];
      const nextPromptTs = list[i + 1]?.timestamp;
      const inWindow = (ts: string) => ts >= prompt.timestamp && (!nextPromptTs || ts < nextPromptTs);

      const windowResponses = convResponses.filter((r) => inWindow(r.timestamp));
      const responseSegments = windowResponses
        .map((r) => r.response_text?.trim() ?? "")
        .filter(Boolean);
      const lastResponse = windowResponses[windowResponses.length - 1];
      const windowTools = convTools.filter((t) => inWindow(t.timestamp));
      const windowThinking = convThinking.filter((t) => inWindow(t.timestamp));

      rounds.push({
        id: `${cid}::${prompt.timestamp}`,
        conversation_id: cid,
        prompt: prompt.prompt,
        prompt_timestamp: prompt.timestamp,
        response: responseSegments.length > 0 && lastResponse
          ? {
              text: responseSegments.join("\n\n"),
              timestamp: lastResponse.timestamp,
              model: lastResponse.model ?? null,
              segment_count: responseSegments.length,
            }
          : undefined,
        thinking: windowThinking.map((t) => ({
          text: t.text,
          timestamp: t.timestamp,
          model: t.model,
          duration_ms: t.duration_ms,
          generation_id: t.generation_id,
        })),
        tools: windowTools.map((t) => ({
          event_type: t.event_type,
          timestamp: t.timestamp,
          tool_name: t.tool_name,
          duration: t.duration,
          failure_type: t.failure_type,
        })),
      });
    }
  }

  const sorted = rounds.sort((a, b) => b.prompt_timestamp.localeCompare(a.prompt_timestamp));
  const filtered = !highlight
    ? sorted
    : sorted.filter((r) => {
        const q = highlight.toLowerCase();
        if (r.prompt.toLowerCase().includes(q)) return true;
        if (r.response?.text.toLowerCase().includes(q)) return true;
        if (r.thinking.some((t) => t.text.toLowerCase().includes(q))) return true;
        return r.tools.some((t) => (t.tool_name || "").toLowerCase().includes(q));
      });

  const byConversation = conversationId
    ? filtered.filter((r) => r.conversation_id === conversationId)
    : filtered;
  const total = byConversation.length;
  const start = (page - 1) * pageSize;
  const pageItems = byConversation.slice(start, start + pageSize);
  return {
    rounds: pageItems,
    total,
    truncated: promptsTruncated || eventsTruncated || thinkingTruncated,
  };
}
