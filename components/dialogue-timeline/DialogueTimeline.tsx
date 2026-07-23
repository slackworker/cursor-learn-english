"use client";

import type { TimelineRoundInput } from "@/lib/dialogue-timeline";
import type { SessionSubagentLink } from "@/lib/sessions/types";
import type { TranscriptAssistantStep } from "@/lib/transcript-content";
import { TaskSubagentsContext } from "./context";
import { EventsFallbackTimeline } from "./events-fallback";
import { TranscriptStepsTimeline } from "./transcript-path";

export function DialogueTimeline({
  round,
  transcriptSegments,
  transcriptSteps,
  subagents,
  emptyMessage = "（该轮暂无助手文本）",
}: {
  round?: TimelineRoundInput;
  transcriptSegments?: string[];
  /** When set, render from agent-transcripts (text + tool_use) instead of events-only timeline. */
  transcriptSteps?: TranscriptAssistantStep[];
  /** Parent session's Task children — used to link Task chips to subagent pages. */
  subagents?: SessionSubagentLink[];
  emptyMessage?: string;
}) {
  const body = (() => {
    if (transcriptSteps && transcriptSteps.length > 0) {
      const replyAfterTimestamp =
        round?.response_segments?.at(-1)?.timestamp ??
        round?.response?.timestamp;
      return (
        <TranscriptStepsTimeline
          steps={transcriptSteps}
          thinking={round?.thinking ?? []}
          tools={round?.tools ?? []}
          replyAfterTimestamp={replyAfterTimestamp}
        />
      );
    }

    if (!round) {
      return <p className="text-sm opacity-60">{emptyMessage}</p>;
    }

    return (
      <EventsFallbackTimeline
        round={round}
        transcriptSegments={transcriptSegments}
        emptyMessage={emptyMessage}
      />
    );
  })();

  return (
    <TaskSubagentsContext.Provider value={subagents ?? null}>
      {body}
    </TaskSubagentsContext.Provider>
  );
}
