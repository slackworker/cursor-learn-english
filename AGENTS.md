# AGENTS.md — navigation for AI agents

Local dashboard: Cursor Hooks JSONL → Next.js API → learning/session UI.

**Prefer the smallest file that owns the concern.** Each package below has a module map in its `index.ts`.

## Where to edit

| Goal | Start here |
|------|------------|
| Session list / detail / subagents / titles | `lib/sessions/` (`index.ts` map) |
| Process nesting (Explored / Thought / edit cards) | `lib/process-activity/tree.ts` |
| Process labels / tool lines / edit diffs | `lib/process-activity/` (see its map) |
| Timeline UI (folds, Shell/Edit cards) | `components/dialogue-timeline/` |
| Interleave transcript ↔ events phases | `lib/interleave-transcript.ts` |
| Vocab stats / pass / dictionaries | `lib/vocab.ts`, `components/VocabStats.tsx` |
| Hooks capture / install paths | `scripts/capture-*.mjs`, `scripts/setup-cursor-hooks.mjs` |
| Shared data root resolution | `lib/default-paths.ts` **and** twin `scripts/default-paths.mjs` (keep in sync) |

## Data flow

```
Cursor Hooks (scripts/*.mjs → ~/.cursor after hooks:install)
  → data/*.jsonl
  → app/api/* → lib/*
  → components + app pages (SWR / fetch)
```

Side inputs: agent-transcripts, Cursor `state.vscdb` titles, generated dictionaries under `data/`.

## Safety notes for agents

- After changing `scripts/capture-*.mjs` or `scripts/default-paths.mjs`, remind the user to re-run `npm run hooks:install` (installed copies under `~/.cursor` do not auto-update).
- Do not commit secrets or machine-local absolute paths.
- Process nesting regressions: `npx --yes tsx scripts/verify-process-activity.ts`

## Intentionally not unified yet

- Dual timeline paths: transcript (`transcript-path.tsx`) vs events fallback (`events-fallback.tsx`).
- `lib/default-paths.ts` ≈ `scripts/default-paths.mjs` (TypeScript vs ESM Hooks runtime).
- Client fetch: sessions use SWR; some widgets still use raw `fetch`.
