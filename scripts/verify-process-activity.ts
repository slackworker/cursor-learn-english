/**
 * Quick sanity checks for Cursor-like process activity nesting.
 * Run: npx --yes tsx scripts/verify-process-activity.ts
 */
import assert from "node:assert/strict";
import {
  buildProcessActivityTree,
  summarizeActivity,
  thoughtFoldLabel,
  toolActivityLine,
  workedFoldSummary,
} from "../lib/process-activity";
import {
  buildInterleavedTranscriptPhases,
  flattenPhasesToUnits,
  type ProcessTimelineUnit,
} from "../lib/interleave-transcript";
import type { TimelineThinking } from "../lib/dialogue-timeline";

function thinking(
  text: string,
  duration_ms: number,
  timestamp: string
): TimelineThinking {
  return {
    text,
    duration_ms,
    timestamp,
    model: "test",
    generation_id: "g",
  };
}

function tool(
  name: string,
  input: Record<string, unknown> = {}
): ProcessTimelineUnit {
  return {
    kind: "step",
    stepKey: `s-${name}`,
    step: { items: [{ type: "tool_use", name, input }] },
  };
}

function label(node: ReturnType<typeof buildProcessActivityTree>[number]): string {
  if (node.kind === "activity") return `${node.kind}:${node.summary}`;
  if (node.kind === "thinking") {
    return `thinking:${thoughtFoldLabel(node.thinking)}`;
  }
  if (node.kind === "tool-line") return `tool-line:${toolActivityLine(node.tool)}`;
  return node.kind;
}

// --- Explore nests Thought; L1 Thought splits explore batches ---
const exploreUnits: ProcessTimelineUnit[] = [
  { kind: "thinking", thinking: thinking("plan parent link", 1000, "2026-07-20T03:00:00.000Z") },
  tool("Task", { description: "Explore session parent/subagent UI" }),
  tool("Grep", { pattern: "parentSession" }),
  tool("Glob", { glob_pattern: "**/sessions/**/*.{ts,tsx}" }),
  { kind: "thinking", thinking: thinking("brief after search", 40, "2026-07-20T03:00:10.000Z") },
  { kind: "thinking", thinking: thinking("relation exists", 800, "2026-07-20T03:00:20.000Z") },
  tool("Read", { path: "lib/sessions.ts" }),
  tool("Read", { path: "app/sessions/[id]/page.tsx" }),
  tool("Grep", { pattern: "listSubagentIdsForParent" }),
  { kind: "thinking", thinking: thinking("brief mid", 50, "2026-07-20T03:01:00.000Z") },
  tool("Read", { path: "lib/sessions.ts" }),
  { kind: "thinking", thinking: thinking("long mid explore", 16000, "2026-07-20T03:01:30.000Z") },
];

const exploreTree = buildProcessActivityTree(exploreUnits);
assert.equal(exploreTree[0]?.kind, "thinking");
assert.equal(exploreTree[1]?.kind, "task");
assert.equal(exploreTree[2]?.kind, "activity");
if (exploreTree[2].kind === "activity") {
  assert.equal(exploreTree[2].summary, "Explored 2 searches");
  assert.equal(exploreTree[2].items[2]?.kind, "thinking");
}
assert.equal(exploreTree[3]?.kind, "thinking");
assert.equal(exploreTree[4]?.kind, "activity");
if (exploreTree[4].kind === "activity") {
  assert.equal(exploreTree[4].summary, "Explored 3 files, 1 search");
  const nested = exploreTree[4].items.filter((i) => i.kind === "thinking");
  assert.equal(nested.length, 2);
  assert.equal(
    thoughtFoldLabel(nested[1].kind === "thinking" ? nested[1].thinking : thinking("", 0, "")),
    "Thought for 16s"
  );
}

// --- Edit: Thought is sibling; splits Edited N files ---
const editUnits: ProcessTimelineUnit[] = [
  tool("StrReplace", { path: "a.ts" }),
  tool("StrReplace", { path: "b.ts" }),
  tool("Write", { path: "c.ts" }),
  { kind: "thinking", thinking: thinking("after three edits", 3000, "2026-07-20T03:02:00.000Z") },
  tool("StrReplace", { path: "d.ts" }),
  tool("Delete", { path: "e.ts" }),
  { kind: "thinking", thinking: thinking("after two edits", 1000, "2026-07-20T03:02:10.000Z") },
];

const editTree = buildProcessActivityTree(editUnits);
assert.deepEqual(editTree.map(label), [
  "activity:Edited 3 files",
  "thinking:Thought for 3s",
  "activity:Edited 2 files",
  "thinking:Thought for 1s",
]);
assert.ok(editTree[0]?.kind === "activity" && editTree[0].items.every((i) => i.kind === "tool"));

// --- Shell: inline, sibling of Thought (not folded, no nested Thought) ---
const shellUnits: ProcessTimelineUnit[] = [
  tool("Shell", { command: "npx tsc --noEmit" }),
  { kind: "thinking", thinking: thinking("brief after cmd", 40, "2026-07-20T03:03:00.000Z") },
  tool("Shell", { command: "npx tsx scripts/verify-process-activity.ts" }),
  { kind: "thinking", thinking: thinking("after second cmd", 900, "2026-07-20T03:03:10.000Z") },
];

const shellTree = buildProcessActivityTree(shellUnits);
assert.deepEqual(shellTree.map(label), [
  "tool-line:Ran npx tsc --noEmit",
  "thinking:Thought briefly",
  "tool-line:Ran npx tsx scripts/verify-process-activity.ts",
  "thinking:Thought for 1s",
]);

assert.equal(
  toolActivityLine({
    type: "tool_use",
    name: "Grep",
    input: { pattern: "parentSession" },
  }),
  "Grepped parentSession"
);

assert.equal(
  summarizeActivity("explore", [
    { type: "tool_use", name: "Read", input: { path: "a" } },
    { type: "tool_use", name: "Grep", input: { pattern: "x" } },
  ]),
  "Explored 1 file, 1 search"
);

assert.match(workedFoldSummary(exploreUnits), /^Worked for /);

// --- Same-ms boundary: tools at tNext stay with the next Thought ---
const sameMsThinking = [
  thinking("after first grep batch", 4, "2026-07-19T16:28:02.963Z"),
  thinking("before three reads", 4, "2026-07-19T16:28:06.303Z"),
  thinking("plan after reads", 16000, "2026-07-19T16:28:26.723Z"),
];
const sameMsSteps = [
  {
    items: [
      {
        type: "tool_use" as const,
        name: "Grep",
        input: { pattern: "listSubagentIdsForParent|getSessionDetail" },
      },
    ],
  },
  {
    items: [
      {
        type: "tool_use" as const,
        name: "Grep",
        input: { pattern: "parent_session_title" },
      },
    ],
  },
  {
    items: [
      { type: "tool_use" as const, name: "Read", input: { path: "sessions.ts" } },
      { type: "tool_use" as const, name: "Read", input: { path: "sessions.ts" } },
      {
        type: "tool_use" as const,
        name: "Read",
        input: { path: "SessionTitleView.tsx" },
      },
    ],
  },
];
const sameMsTools = [
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-19T16:28:02.970Z",
    tool_name: "Grep",
  },
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-19T16:28:03.438Z",
    tool_name: "Grep",
  },
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-19T16:28:06.303Z",
    tool_name: "Read",
  },
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-19T16:28:06.310Z",
    tool_name: "Read",
  },
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-19T16:28:06.329Z",
    tool_name: "Read",
  },
];
const sameMsUnits = flattenPhasesToUnits(
  buildInterleavedTranscriptPhases(sameMsThinking, sameMsSteps, sameMsTools)
);
const sameMsTree = buildProcessActivityTree(sameMsUnits);
const sameMsExplore = sameMsTree.find(
  (n) => n.kind === "activity" && n.activityKind === "explore"
);
assert.ok(sameMsExplore && sameMsExplore.kind === "activity");
const sameMsLabels = sameMsExplore.items.map((it) =>
  it.kind === "thinking"
    ? thoughtFoldLabel(it.thinking)
    : it.kind === "tool"
      ? toolActivityLine(it.tool)
      : "text"
);
// Regression: must NOT be [Grepped…, Reads…, Thought briefly, Thought for 16s@L1]
assert.deepEqual(sameMsLabels, [
  "Grepped listSubagentIdsForParent|getSessionDetail",
  "Grepped parent_session_title",
  "Thought briefly",
  "Read sessions.ts",
  "Read sessions.ts",
  "Read SessionTitleView.tsx",
  "Thought for 16s",
]);
assert.equal(
  sameMsTree.some(
    (n) => n.kind === "thinking" && thoughtFoldLabel(n.thinking) === "Thought for 16s"
  ),
  false,
  "Thought for 16s must stay nested in explore"
);

console.log("verify-process-activity: ok");
console.log({
  explore: exploreTree.map(label),
  edit: editTree.map(label),
  shell: shellTree.map(label),
  sameMs: sameMsLabels,
});
