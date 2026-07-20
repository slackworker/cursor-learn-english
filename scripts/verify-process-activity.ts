/**
 * Quick sanity checks for Cursor-like process activity nesting.
 * Run: npx --yes tsx scripts/verify-process-activity.ts
 */
import assert from "node:assert/strict";
import {
  buildProcessActivityTree,
  estimateWorkedMs,
  formatDurationShort,
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
  input: Record<string, unknown> = {},
  stepKey?: string
): ProcessTimelineUnit {
  return {
    kind: "step",
    stepKey: stepKey ?? `s-${name}-${Math.random().toString(36).slice(2, 6)}`,
    step: { items: [{ type: "tool_use", name, input }] },
  };
}

function step(
  stepKey: string,
  items: import("../lib/transcript-content").TranscriptContentItem[]
): ProcessTimelineUnit {
  return { kind: "step", stepKey, step: { items } };
}

function label(node: ReturnType<typeof buildProcessActivityTree>[number]): string {
  if (node.kind === "activity") return `${node.kind}:${node.summary}`;
  if (node.kind === "thinking") {
    return `thinking:${thoughtFoldLabel(node.thinking)}`;
  }
  if (node.kind === "tool-line") return `tool-line:${toolActivityLine(node.tool)}`;
  if (node.kind === "text") return `text`;
  return node.kind;
}

function activityLabels(
  node: Extract<ReturnType<typeof buildProcessActivityTree>[number], { kind: "activity" }>
): string[] {
  return node.items.map((it) =>
    it.kind === "thinking"
      ? thoughtFoldLabel(it.thinking)
      : it.kind === "tool"
        ? it.line ?? toolActivityLine(it.tool)
        : "text"
  );
}

// --- Explore nests Thought; L1 Thought splits explore batches ---
const exploreUnits: ProcessTimelineUnit[] = [
  { kind: "thinking", thinking: thinking("plan parent link", 1000, "2026-07-20T03:00:00.000Z") },
  tool("Task", { description: "Explore session parent/subagent UI" }, "s-task"),
  step("s-search", [
    { type: "tool_use", name: "Grep", input: { pattern: "parentSession" } },
    { type: "tool_use", name: "Glob", input: { glob_pattern: "**/sessions/**/*.{ts,tsx}" } },
  ]),
  { kind: "thinking", thinking: thinking("brief after search", 40, "2026-07-20T03:00:10.000Z") },
  step("s-gap", [
    { type: "text", text: "关系数据已有，只是父会话详情没往回链。" },
  ]),
  step("s-files", [
    { type: "tool_use", name: "Read", input: { path: "lib/sessions.ts" } },
    { type: "tool_use", name: "Read", input: { path: "app/sessions/[id]/page.tsx" } },
    { type: "tool_use", name: "Grep", input: { pattern: "listSubagentIdsForParent" } },
  ]),
  { kind: "thinking", thinking: thinking("brief mid", 50, "2026-07-20T03:01:00.000Z") },
  step("s-more", [
    { type: "tool_use", name: "Read", input: { path: "lib/sessions.ts" } },
  ]),
  { kind: "thinking", thinking: thinking("long mid explore", 16000, "2026-07-20T03:01:30.000Z") },
];

const exploreTree = buildProcessActivityTree(exploreUnits);
assert.deepEqual(
  exploreTree.slice(0, 4).map(label),
  [
    "thinking:Thought for 1s",
    "task",
    "activity:Explored 2 searches",
    "text",
  ]
);
if (exploreTree[2].kind === "activity") {
  assert.deepEqual(activityLabels(exploreTree[2]), [
    "Grepped parentSession",
    "Searched files **/sessions/**/*.{ts,tsx}",
    "Thought briefly",
  ]);
}

const secondExplore = exploreTree.find(
  (n, i) => i > 3 && n.kind === "activity"
);
assert.ok(secondExplore && secondExplore.kind === "activity");
assert.deepEqual(activityLabels(secondExplore), [
  "Read lib/sessions.ts",
  "Read app/sessions/[id]/page.tsx",
  "Grepped listSubagentIdsForParent",
  "Thought briefly",
  "Read lib/sessions.ts",
  "Thought for 16s",
]);

// --- Edit: Thought is sibling; splits Edited N files ---
const editUnits: ProcessTimelineUnit[] = [
  step("e1", [
    { type: "tool_use", name: "StrReplace", input: { path: "a.ts" } },
    { type: "tool_use", name: "StrReplace", input: { path: "b.ts" } },
    { type: "tool_use", name: "Write", input: { path: "c.ts" } },
  ]),
  { kind: "thinking", thinking: thinking("after three edits", 3000, "2026-07-20T03:02:00.000Z") },
  step("e2", [
    { type: "tool_use", name: "StrReplace", input: { path: "d.ts" } },
    { type: "tool_use", name: "Delete", input: { path: "e.ts" } },
  ]),
  { kind: "thinking", thinking: thinking("after two edits", 1000, "2026-07-20T03:02:10.000Z") },
];

const editTree = buildProcessActivityTree(editUnits);
assert.deepEqual(editTree.map(label), [
  "activity:Edited 3 files",
  "thinking:Thought for 3s",
  "activity:Edited 2 files",
  "thinking:Thought for 1s",
]);

// --- Shell: inline, sibling of Thought ---
const shellUnits: ProcessTimelineUnit[] = [
  tool("Shell", { command: "npx tsc --noEmit" }, "sh1"),
  { kind: "thinking", thinking: thinking("brief after cmd", 40, "2026-07-20T03:03:00.000Z") },
  tool("Shell", { command: "npx tsx scripts/verify-process-activity.ts" }, "sh2"),
  { kind: "thinking", thinking: thinking("after second cmd", 900, "2026-07-20T03:03:10.000Z") },
];

const shellTree = buildProcessActivityTree(shellUnits);
assert.deepEqual(shellTree.map(label), [
  "tool-line:Ran npx tsc --noEmit",
  "thinking:Thought briefly",
  "tool-line:Ran npx tsx scripts/verify-process-activity.ts",
  "thinking:Thought for 1s",
]);

// --- AskQuestion skipped; brief between step batches; long at end ---
const askUnits: ProcessTimelineUnit[] = [
  { kind: "thinking", thinking: thinking("before explore", 15000, "2026-07-20T03:04:46.508Z") },
  step("narrate", [
    { type: "text", text: "接着看 interleave 逻辑" },
    {
      type: "tool_use",
      name: "Read",
      input: { path: "lib/interleave-transcript.ts" },
    },
    {
      type: "tool_use",
      name: "Grep",
      input: { pattern: "afterAgentThought|agentThought" },
    },
    {
      type: "tool_use",
      name: "Glob",
      input: { glob_pattern: "**/*interleave*" },
    },
    {
      type: "tool_use",
      name: "Glob",
      input: { glob_pattern: "**/*dialogue-timeline*" },
    },
  ]),
  step("more-search", [
    {
      type: "tool_use",
      name: "Grep",
      input: { pattern: "tool_use|thinking|assistant" },
    },
    {
      type: "tool_use",
      name: "Glob",
      input: { glob_pattern: "**/*transcript*" },
    },
    { type: "tool_use", name: "AskQuestion", input: {} },
  ]),
  { kind: "thinking", thinking: thinking("brief mid", 5, "2026-07-20T03:04:56.105Z") },
  { kind: "thinking", thinking: thinking("later long", 28000, "2026-07-20T03:05:34.442Z") },
];

const askTree = buildProcessActivityTree(askUnits);
assert.equal(
  askTree.some((n) => n.kind === "tool-line" && n.tool.name === "AskQuestion"),
  false,
  "AskQuestion must not appear"
);
assert.deepEqual(
  askTree.slice(0, 3).map(label),
  [
    "thinking:Thought for 15s",
    "text",
    "activity:Explored interleave-transcript.ts, 5 searches",
  ],
  "phase-leading Thought stays L1 above narration before Explored"
);
const askExplore = askTree.find((n) => n.kind === "activity");
assert.ok(askExplore && askExplore.kind === "activity");
assert.equal(askExplore.summary, "Explored interleave-transcript.ts, 5 searches");
assert.deepEqual(activityLabels(askExplore), [
  "Read lib/interleave-transcript.ts",
  "Grepped afterAgentThought|agentThought",
  "Searched files **/*interleave*",
  "Searched files **/*dialogue-timeline*",
  "Grepped tool_use|thinking|assistant",
  "Searched files **/*transcript*",
  "Thought briefly",
  "Thought for 28s",
]);
assert.equal(
  askTree.some(
    (n) => n.kind === "thinking" && thoughtFoldLabel(n.thinking) === "Thought for 15s"
  ),
  true,
  "phase-leading Thought is L1, not nested under Explored"
);

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
  "Explored a, 1 search"
);

assert.match(workedFoldSummary(exploreUnits), /^Worked for /);

// Hook timestamps are end times: span = last.end - first.(end - duration)
const workedMs = estimateWorkedMs([
  {
    kind: "thinking",
    thinking: thinking("first", 8459, "2026-07-20T05:47:28.642Z"),
  },
  {
    kind: "thinking",
    thinking: thinking("last", 1000, "2026-07-20T05:53:54.492Z"),
  },
]);
assert.ok(workedMs != null);
assert.equal(
  formatDurationShort(workedMs),
  "6m 34s",
  "Worked span uses thought start = timestamp - duration_ms"
);

// --- Same-ms boundary still nests Thought for 16s ---
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
const sameMsLabels = activityLabels(sameMsExplore);
assert.ok(sameMsLabels.includes("Thought for 16s"));
assert.equal(
  sameMsTree.some(
    (n) => n.kind === "thinking" && thoughtFoldLabel(n.thinking) === "Thought for 16s"
  ),
  false,
  "Thought for 16s must stay nested in explore"
);

// --- Cursor sandwich: text → one Explored (tools + thoughts + todo) → text ---
const sandwichUnits: ProcessTimelineUnit[] = [
  step("n1", [{ type: "text", text: "着手改这两处，并同步更新相关测试。" }]),
  step("todo", [{ type: "tool_use", name: "TodoWrite", input: {} }]),
  step("s1", [
    { type: "tool_use", name: "Grep", input: { pattern: "timestamp|duration" } },
    {
      type: "tool_use",
      name: "Read",
      input: { path: "scripts/verify-process-activity.ts" },
    },
    {
      type: "tool_use",
      name: "Grep",
      input: { pattern: "postToolUse|duration|timestamp" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief after greps", 40, "2026-07-20T06:00:10.000Z"),
  },
  step("s2", [
    { type: "tool_use", name: "Read", input: { path: "scripts/capture-event.mjs" } },
    { type: "tool_use", name: "Read", input: { path: "lib/dialogue-timeline.ts" } },
    {
      type: "tool_use",
      name: "Read",
      input: { path: "scripts/verify-process-activity.ts" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief mid", 50, "2026-07-20T06:00:20.000Z"),
  },
  step("s3", [
    {
      type: "tool_use",
      name: "Read",
      input: { path: "scripts/verify-process-activity.ts" },
    },
    {
      type: "tool_use",
      name: "Read",
      input: { path: "scripts/verify-process-activity.ts" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("long before next narration", 27000, "2026-07-20T06:00:50.000Z"),
  },
  step("n2", [
    {
      type: "text",
      text: "正在修改 estimateWorkedMs 与 text 分支的 flush 逻辑，并更新测试。",
    },
  ]),
];

const sandwichTree = buildProcessActivityTree(sandwichUnits);
assert.deepEqual(
  sandwichTree.map(label),
  [
    "text",
    "activity:Explored 6 files, 2 searches",
    "text",
  ],
  "middle explore tools + thoughts collapse into one Explored between narrations"
);
const sandwichExplore = sandwichTree.find((n) => n.kind === "activity");
assert.ok(sandwichExplore && sandwichExplore.kind === "activity");
assert.deepEqual(activityLabels(sandwichExplore), [
  "Checked to-do list",
  "Grepped timestamp|duration",
  "Read scripts/verify-process-activity.ts",
  "Grepped postToolUse|duration|timestamp",
  "Thought briefly",
  "Read scripts/capture-event.mjs",
  "Read lib/dialogue-timeline.ts",
  "Read scripts/verify-process-activity.ts",
  "Thought briefly",
  "Read scripts/verify-process-activity.ts",
  "Read scripts/verify-process-activity.ts",
  "Thought for 27s",
]);
assert.equal(
  sandwichTree.some((n) => n.kind === "thinking"),
  false,
  "Thought for 27s must nest inside Explored, not L1 between narrations"
);

// --- TodoWrite-only Explored after Shell (Cursor: bare "Explored") ---
const todoOnlyUnits: ProcessTimelineUnit[] = [
  step("boot", [
    {
      type: "tool_use",
      name: "TodoWrite",
      input: {
        merge: false,
        todos: [
          { id: "1", content: "a", status: "in_progress" },
          { id: "2", content: "b", status: "pending" },
          { id: "3", content: "c", status: "pending" },
        ],
      },
    },
    { type: "tool_use", name: "Grep", input: { pattern: "x" } },
  ]),
  step("edit", [
    { type: "tool_use", name: "StrReplace", input: { path: "a.ts" } },
  ]),
  step("sh", [
    { type: "tool_use", name: "Shell", input: { command: "npx tsx scripts/verify-process-activity.ts" } },
    {
      type: "tool_use",
      name: "TodoWrite",
      input: {
        merge: true,
        todos: [
          { id: "1", status: "completed" },
          { id: "2", status: "completed" },
          { id: "3", status: "in_progress" },
        ],
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("tests passed", 2, "2026-07-20T06:14:22.618Z"),
  },
  step("done", [
    {
      type: "tool_use",
      name: "TodoWrite",
      input: {
        merge: true,
        todos: [{ id: "3", status: "completed" }],
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("summarize", 2, "2026-07-20T06:14:24.054Z"),
  },
  step("final", [{ type: "text", text: "两处都改好了，验证脚本已通过。" }]),
];

const todoOnlyTree = buildProcessActivityTree(todoOnlyUnits);
assert.deepEqual(
  todoOnlyTree.map(label),
  [
    "activity:Explored 1 search",
    "activity:Edited 1 file",
    "tool-line:Ran npx tsx scripts/verify-process-activity.ts",
    "activity:Explored",
    "text",
  ],
  "TodoWrite-only batch after Shell becomes bare Explored, not L1 Thoughts"
);
const todoOnlyExplore = [...todoOnlyTree]
  .reverse()
  .find((n) => n.kind === "activity" && n.summary === "Explored");
assert.ok(todoOnlyExplore && todoOnlyExplore.kind === "activity");
assert.deepEqual(activityLabels(todoOnlyExplore), [
  "Checked to-do list",
  "Thought briefly",
  "Completed 3 of 3 to-dos",
  "Thought briefly",
]);

console.log("verify-process-activity: ok");
console.log({
  explore: exploreTree.map(label),
  edit: editTree.map(label),
  shell: shellTree.map(label),
  ask: askTree.map(label),
  askItems: activityLabels(askExplore),
  sameMs: sameMsLabels,
  sandwich: sandwichTree.map(label),
  todoOnly: todoOnlyTree.map(label),
  todoOnlyItems: activityLabels(todoOnlyExplore),
});
