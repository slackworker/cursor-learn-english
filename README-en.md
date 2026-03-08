# thinking-get-hook

A data collection and visualization tool built on **Cursor Hooks**. It automatically captures AI Agent "thinking" (reasoning) output and other conversation events, then serves them in a **Next.js 16** web dashboard. Use it to inspect model reasoning, analyze usage stats, and—as a bonus—practice reading English from real AI thinking text.

---

## Cursor Hooks setup

Collection runs via Cursor **user-level Hooks**, configured under `~/.cursor/`.

### 1. Directory and scripts

Set up config and scripts in your home Cursor directory (you can copy from this repo):

```text
~/.cursor/
├── hooks.json                   # See config below
└── scripts/
    ├── capture-event.mjs        # Writes all events → cursor-events.jsonl
    ├── capture-thinking.mjs     # Writes thinking blocks → thinking-corpus.jsonl
    ├── capture-response-to-txt.mjs
    ├── capture-thinking.sh      # Optional; requires jq
    └── test.sh
```

User-level hooks run with **working directory** `~/.cursor/`, so use `./scripts/xxx.mjs` in `hooks.json`.

### 2. hooks.json example

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [{ "command": "node ./scripts/capture-event.mjs" }],
    "afterAgentResponse": [{ "command": "node ./scripts/capture-event.mjs" }],
    "afterAgentThought": [
      { "command": "node ./scripts/capture-thinking.mjs" },
      { "command": "node ./scripts/capture-event.mjs" }
    ],
    "postToolUse": [{ "command": "node ./scripts/capture-event.mjs" }],
    "postToolUseFailure": [{ "command": "node ./scripts/capture-event.mjs" }],
    "sessionStart": [{ "command": "node ./scripts/capture-event.mjs" }],
    "sessionEnd": [{ "command": "node ./scripts/capture-event.mjs" }],
    "stop": [{ "command": "node ./scripts/capture-event.mjs" }],
    "preCompact": [{ "command": "node ./scripts/capture-event.mjs" }],
    "afterFileEdit": [{ "command": "node ./scripts/capture-event.mjs" }]
  }
}
```

### 3. Data output paths

| File | Written by | Description |
|------|------------|-------------|
| `~/thinking-corpus.jsonl` | `capture-thinking.mjs` | One JSON object per line: `text`, `timestamp`, `model`, `duration_ms`, etc. |
| `~/cursor-events.jsonl` | `capture-event.mjs` | One event per line: `event_type`, `timestamp`, `conversation_id`, plus event-specific fields. |

Override paths with environment variables:

- `THINKING_CORPUS_PATH` → path to thinking corpus file
- `CURSOR_EVENTS_PATH` → path to events file

### 4. Dependencies and running

- **Scripts**: require **Node.js** only (no npm install for the hook scripts).
- **Web dashboard**: From the project root run `npm install` then `npm run dev`; open the app in your browser. The API reads the two JSONL paths above by default. Override with `EVENTS_JSONL_PATH` and `CORPUS_JSONL_PATH` if needed.

For event payload details, see [hooks.md](hooks.md).

---

## Project structure

```
thinking-get-hook/
├── .cursor-plugin/
│   └── plugin.json              # Cursor Plugin manifest (optional, for plugin distribution)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # Dashboard home
│   ├── globals.css
│   ├── api/
│   │   ├── events/route.ts      # GET events aggregated by day/type
│   │   ├── stats/route.ts       # GET summary stats
│   │   ├── thinking/route.ts    # GET thinking corpus (paginated)
│   │   └── sessions/route.ts    # GET sessions list
│   ├── daily/page.tsx           # Daily stats page
│   ├── thinking/page.tsx       # Thinking corpus page
│   └── sessions/page.tsx       # Sessions list page
├── components/
│   ├── StatCards.tsx            # Stat cards
│   ├── DailyChart.tsx          # Daily trend chart (ECharts)
│   ├── ThinkingList.tsx        # Thinking list (Markdown rendered)
│   └── SessionTable.tsx         # Sessions table
├── lib/
│   ├── events.ts                # Read cursor-events.jsonl, aggregate by day
│   └── thinking.ts              # Read thinking-corpus.jsonl, paginate
├── hooks/
│   └── hooks.json               # Hooks config (copy to ~/.cursor)
├── scripts/
│   ├── capture-event.mjs        # Event capture → cursor-events.jsonl
│   ├── capture-thinking.mjs    # Thinking capture → thinking-corpus.jsonl
│   ├── capture-thinking.sh     # Optional; requires jq
│   ├── capture-response-to-txt.mjs
│   └── test.sh
├── hooks.md                     # Hook event reference
├── package.json
├── next.config.ts
└── README.md
```

## References

- [Cursor Hooks documentation](https://cursor.com/docs/agent/hooks)
