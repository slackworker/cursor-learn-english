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
  assignStepTimestamps,
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
  askTree.slice(0, 2).map(label),
  ["text", "activity:Explored interleave-transcript.ts, 5 searches"],
  "Thought before text+explore same step nests inside Explored, not L1 above narration"
);
const askExplore = askTree.find((n) => n.kind === "activity");
assert.ok(askExplore && askExplore.kind === "activity");
assert.equal(askExplore.summary, "Explored interleave-transcript.ts, 5 searches");
assert.deepEqual(activityLabels(askExplore), [
  "Thought for 15s",
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
  false,
  "phase-leading Thought with same-step explore tools nests under Explored"
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

// --- CallMcpTool hooks are MCP:${toolName}; without this, MCP steps lose
// timestamps and all later Thoughts collapse into the previous Explored. ---
const mcpHookSteps = [
  {
    items: [
      {
        type: "tool_use" as const,
        name: "CallMcpTool",
        input: {
          server: "cursor-ide-browser",
          toolName: "browser_tabs",
          arguments: { action: "list" },
        },
      },
    ],
  },
  {
    items: [
      {
        type: "tool_use" as const,
        name: "GetMcpTools",
        input: { server: "cursor-ide-browser", toolName: "browser_navigate" },
      },
    ],
  },
  {
    items: [
      {
        type: "tool_use" as const,
        name: "CallMcpTool",
        input: {
          server: "cursor-ide-browser",
          toolName: "browser_navigate",
          arguments: { url: "http://localhost:3000/sessions" },
        },
      },
    ],
  },
];
const mcpHookTools = [
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-20T08:48:40.600Z",
    tool_name: "MCP:browser_tabs",
  },
  {
    event_type: "postToolUse" as const,
    timestamp: "2026-07-20T08:48:53.260Z",
    tool_name: "MCP:browser_navigate",
  },
];
assert.deepEqual(
  assignStepTimestamps(mcpHookSteps, mcpHookTools),
  ["2026-07-20T08:48:40.600Z", undefined, "2026-07-20T08:48:53.260Z"],
  "CallMcpTool matches MCP:* hooks; GetMcpTools has no hook of its own"
);
const mcpInterleaveThinking = [
  thinking("after tabs", 3, "2026-07-20T08:48:47.000Z"),
  thinking("before nav", 2, "2026-07-20T08:48:52.000Z"),
];
const mcpInterleaveUnits = flattenPhasesToUnits(
  buildInterleavedTranscriptPhases(
    mcpInterleaveThinking,
    mcpHookSteps,
    mcpHookTools
  )
);
assert.deepEqual(
  mcpInterleaveUnits.map((u) =>
    u.kind === "thinking"
      ? "thinking"
      : u.step.items
          .map((it) =>
            it.type === "tool_use"
              ? it.name === "CallMcpTool"
                ? `CallMcp:${it.input.toolName}`
                : it.name === "GetMcpTools"
                  ? "GetMcp"
                  : it.name
              : "text"
          )
          .join("+")
  ),
  [
    "CallMcp:browser_tabs",
    "thinking",
    "thinking",
    "GetMcp",
    "CallMcp:browser_navigate",
  ],
  "GetMcpTools back-fills from next CallMcp so it stays after intervening Thoughts"
);
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

// --- Browser MCP nests inside Explored (Cursor: N browser actions) ---
assert.equal(
  toolActivityLine({
    type: "tool_use",
    name: "GetMcpTools",
    input: { server: "cursor-ide-browser", toolName: "browser_tabs" },
  }),
  "Explored available tools"
);
assert.equal(
  toolActivityLine({
    type: "tool_use",
    name: "CallMcpTool",
    input: {
      server: "cursor-ide-browser",
      toolName: "browser_navigate",
      arguments: { url: "http://localhost:3000/sessions/5ee232c4-8899-4f40-ab4d-0112746c0ad5" },
    },
  }),
  "Navigated to http://localhost:3000/sessions/5ee232c4-8899-..."
);
assert.equal(
  toolActivityLine({
    type: "tool_use",
    name: "CallMcpTool",
    input: {
      server: "cursor-ide-browser",
      toolName: "browser_cdp",
      arguments: { method: "Runtime.evaluate", params: {} },
    },
  }),
  "CDP Runtime.evaluate"
);
assert.equal(
  summarizeActivity("explore", [
    {
      type: "tool_use",
      name: "Read",
      input: { path: "components/process-fold.css" },
    },
    {
      type: "tool_use",
      name: "Read",
      input: { path: "terminals/62.txt" },
    },
    {
      type: "tool_use",
      name: "GetMcpTools",
      input: { server: "cursor-ide-browser", toolName: "browser_tabs" },
    },
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_tabs",
        arguments: { action: "list" },
      },
    },
    {
      type: "tool_use",
      name: "Grep",
      input: { pattern: "dev:host|localhost|port" },
    },
  ]),
  "Explored 2 files, 2 searches, 1 browser action"
);

const browserMcpUnits: ProcessTimelineUnit[] = [
  step("narr1", [
    { type: "text", text: "我误删了 chevron 样式，马上补回去。" },
    {
      type: "tool_use",
      name: "Read",
      input: { path: "components/process-fold.css" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief after css", 3, "2026-07-20T10:00:01.000Z"),
  },
  step("explore1", [
    {
      type: "tool_use",
      name: "Read",
      input: { path: "terminals/62.txt" },
    },
    {
      type: "tool_use",
      name: "GetMcpTools",
      input: { server: "cursor-ide-browser", toolName: "browser_tabs" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief before tabs", 2, "2026-07-20T10:00:02.000Z"),
  },
  step("tabs", [
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_tabs",
        arguments: { action: "list" },
      },
    },
    {
      type: "tool_use",
      name: "Grep",
      input: { pattern: "dev:host|localhost|port" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief before shell", 2, "2026-07-20T10:00:03.000Z"),
  },
  step("shell", [
    {
      type: "tool_use",
      name: "Shell",
      input: { command: "head -n 30 terminals/62.txt" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief after shell", 2, "2026-07-20T10:00:04.000Z"),
  },
  step("nav", [
    {
      type: "tool_use",
      name: "GetMcpTools",
      input: { server: "cursor-ide-browser", toolName: "browser_navigate" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief", 1, "2026-07-20T10:00:05.000Z"),
  },
  step("nav2", [
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_navigate",
        arguments: { url: "http://localhost:3000/sessions" },
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief", 1, "2026-07-20T10:00:06.000Z"),
  },
  step("cdp-schema", [
    {
      type: "tool_use",
      name: "GetMcpTools",
      input: { server: "cursor-ide-browser", toolName: "browser_cdp" },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief", 1, "2026-07-20T10:00:07.000Z"),
  },
  step("cdp1", [
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_cdp",
        arguments: { method: "Runtime.evaluate", params: {} },
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief", 1, "2026-07-20T10:00:08.000Z"),
  },
  step("nav3", [
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_navigate",
        arguments: {
          url: "http://localhost:3000/sessions/5ee232c4-8899-4f40-ab4d-0112746c0ad5",
        },
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief", 1, "2026-07-20T10:00:09.000Z"),
  },
  step("cdp2", [
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_cdp",
        arguments: { method: "Runtime.evaluate", params: {} },
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("brief", 1, "2026-07-20T10:00:10.000Z"),
  },
  step("cdp3", [
    {
      type: "tool_use",
      name: "CallMcpTool",
      input: {
        server: "cursor-ide-browser",
        toolName: "browser_cdp",
        arguments: { method: "Runtime.evaluate", params: {} },
      },
    },
  ]),
  {
    kind: "thinking",
    thinking: thinking("measure animation", 13000, "2026-07-20T10:00:23.000Z"),
  },
  step("narr2", [
    {
      type: "text",
      text: "测量显示延迟 content-visibility 会让高度无法过渡、直接跳变。",
    },
  ]),
];

const browserMcpTree = buildProcessActivityTree(browserMcpUnits);
assert.deepEqual(
  browserMcpTree.map(label),
  [
    "text",
    "activity:Explored 2 files, 2 searches, 1 browser action",
    "tool-line:Ran head -n 30 terminals/62.txt",
    "activity:Explored 2 searches, 5 browser actions",
    "text",
  ],
  "browser MCP + Grep collapse into Explored with browser action counts; Shell stays L1"
);
const browserFirst = browserMcpTree[1];
assert.ok(browserFirst && browserFirst.kind === "activity");
assert.deepEqual(activityLabels(browserFirst), [
  "Read components/process-fold.css",
  "Thought briefly",
  "Read terminals/62.txt",
  "Explored available tools",
  "Thought briefly",
  "Browser tabs",
  "Grepped dev:host|localhost|port",
  "Thought briefly",
]);
const browserSecond = browserMcpTree[3];
assert.ok(browserSecond && browserSecond.kind === "activity");
assert.deepEqual(activityLabels(browserSecond), [
  "Thought briefly",
  "Explored available tools",
  "Thought briefly",
  "Navigated to http://localhost:3000/sessions",
  "Thought briefly",
  "Explored available tools",
  "Thought briefly",
  "CDP Runtime.evaluate",
  "Thought briefly",
  "Navigated to http://localhost:3000/sessions/5ee232c4-8899-...",
  "Thought briefly",
  "CDP Runtime.evaluate",
  "Thought briefly",
  "CDP Runtime.evaluate",
  "Thought for 13s",
]);
assert.equal(
  browserMcpTree.some((n) => n.kind === "tool-line" && n.tool.name === "CallMcpTool"),
  false,
  "CallMcpTool must nest inside Explored, not appear as L1 tool-line"
);
assert.equal(
  browserMcpTree.filter((n) => n.kind === "thinking").length,
  0,
  "Thoughts after Shell nest inside the next Explored, not L1"
);

// --- Thought + text+Read same step: phaseId decides L1 vs Explored ---
const textToolThoughtUnits = flattenPhasesToUnits([
  {
    // Empty-phase Thought — must stay L1 above narration.
    thinking: thinking(
      "替换时误删了 chevron 的样式。",
      2,
      "2026-07-20T08:48:30.471Z"
    ),
    steps: [],
  },
  {
    // Same phase as text+Read — nests inside Explored.
    thinking: thinking("confirm chevron styles", 6399, "2026-07-20T08:48:38.508Z"),
    steps: [
      {
        items: [
          { type: "text", text: "我误删了 chevron 样式，马上补回去。" },
          {
            type: "tool_use",
            name: "Read",
            input: { path: "components/process-fold.css" },
          },
        ],
      },
    ],
  },
  {
    thinking: thinking("brief after read", 3, "2026-07-20T08:48:40.397Z"),
    steps: [
      {
        items: [
          { type: "tool_use", name: "Grep", input: { pattern: "chevron" } },
        ],
      },
    ],
  },
]);
const textToolThoughtTree = buildProcessActivityTree(textToolThoughtUnits);
assert.deepEqual(
  textToolThoughtTree.map(label),
  [
    "thinking:Thought briefly",
    "text",
    "activity:Explored process-fold.css, 1 search",
  ],
  "earlier Thought briefly stays above narration; paired Thought for 6s nests in Explored"
);
const textToolExplore = textToolThoughtTree[2];
assert.ok(textToolExplore && textToolExplore.kind === "activity");
assert.deepEqual(activityLabels(textToolExplore), [
  "Thought for 6s",
  "Read components/process-fold.css",
  "Thought briefly",
  "Grepped chevron",
]);
assert.equal(
  textToolThoughtTree.some(
    (n) => n.kind === "thinking" && thoughtFoldLabel(n.thinking) === "Thought briefly"
  ),
  true,
  "leading Thought briefly remains L1 above「我误删了…」"
);

// Sole empty-phase Thought before text+explore must stay L1 (not nest).
const soleEmptyPhaseUnits = flattenPhasesToUnits([
  {
    thinking: thinking("empty phase only", 2, "2026-07-20T08:00:00.000Z"),
    steps: [],
  },
  {
    steps: [
      {
        items: [
          { type: "text", text: "旁白后立刻探索" },
          {
            type: "tool_use",
            name: "Read",
            input: { path: "lib/process-activity.ts" },
          },
        ],
      },
    ],
  },
]);
const soleEmptyPhaseTree = buildProcessActivityTree(soleEmptyPhaseUnits);
assert.deepEqual(
  soleEmptyPhaseTree.map(label),
  [
    "thinking:Thought briefly",
    "text",
    "activity:Explored 1 file",
  ],
  "sole empty-phase Thought stays L1 above text+explore (phase marker, not pop heuristic)"
);
assert.equal(
  soleEmptyPhaseTree.some(
    (n) =>
      n.kind === "activity" &&
      n.items.some(
        (it) =>
          it.kind === "thinking" &&
          thoughtFoldLabel(it.thinking) === "Thought briefly"
      )
  ),
  false,
  "empty-phase Thought must not be pulled into Explored"
);

// Two Thoughts in the same phase as text+explore both nest (not only last).
const twoPairedPhaseUnits: ProcessTimelineUnit[] = [
  {
    kind: "thinking",
    phaseId: 0,
    thinking: thinking("first paired", 1000, "2026-07-20T08:01:00.000Z"),
  },
  {
    kind: "thinking",
    phaseId: 0,
    thinking: thinking("second paired", 2000, "2026-07-20T08:01:02.000Z"),
  },
  {
    kind: "step",
    phaseId: 0,
    stepKey: "same-phase",
    step: {
      items: [
        { type: "text", text: "同 phase 双 Thought" },
        {
          type: "tool_use",
          name: "Grep",
          input: { pattern: "phaseId" },
        },
      ],
    },
  },
];
const twoPairedPhaseTree = buildProcessActivityTree(twoPairedPhaseUnits);
assert.deepEqual(
  twoPairedPhaseTree.map(label),
  ["text", "activity:Explored 1 search"],
  "all same-phase Thoughts nest; none remain L1"
);
const twoPairedExplore = twoPairedPhaseTree[1];
assert.ok(twoPairedExplore && twoPairedExplore.kind === "activity");
assert.deepEqual(activityLabels(twoPairedExplore), [
  "Thought for 1s",
  "Thought for 2s",
  "Grepped phaseId",
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
  browserMcp: browserMcpTree.map(label),
  textToolThought: textToolThoughtTree.map(label),
  soleEmptyPhase: soleEmptyPhaseTree.map(label),
  twoPairedPhase: twoPairedPhaseTree.map(label),
});
