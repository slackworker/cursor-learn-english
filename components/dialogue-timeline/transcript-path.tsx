"use client";

import {
  buildInterleavedTranscriptPhases,
  flattenPhasesToUnits,
  splitProcessAndFinalUnits,
} from "@/lib/interleave-transcript";
import {
  buildProcessActivityTree,
  workedFoldSummary,
} from "@/lib/process-activity";
import type { TimelineRoundInput } from "@/lib/dialogue-timeline";
import type { TranscriptAssistantStep } from "@/lib/transcript-content";
import { ProcessFold } from "./fold";
import {
  renderProcessActivityNodes,
  renderProcessUnits,
} from "./process-activity-views";

/** Transcript steps interleaved with thinking via postToolUse / afterAgentThought timestamps. */
export function TranscriptStepsTimeline({
  steps,
  thinking,
  tools,
  replyAfterTimestamp,
}: {
  steps: TranscriptAssistantStep[];
  thinking: TimelineRoundInput["thinking"];
  tools: TimelineRoundInput["tools"];
  replyAfterTimestamp?: string;
}) {
  const phases = buildInterleavedTranscriptPhases(thinking, steps, tools, {
    replyAfterTimestamp,
  });
  const { process, final } = splitProcessAndFinalUnits(
    flattenPhasesToUnits(phases)
  );

  const activityNodes = buildProcessActivityTree(process);
  const processNodes =
    activityNodes.length > 0 ? (
      <ProcessFold summary={workedFoldSummary(process, tools)}>
        {renderProcessActivityNodes(activityNodes)}
      </ProcessFold>
    ) : null;

  const finalNodes = renderProcessUnits(final);

  if (!processNodes && finalNodes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {processNodes}
      {finalNodes.length > 0 ? (
        <div className="space-y-2">{finalNodes}</div>
      ) : null}
    </div>
  );
}
