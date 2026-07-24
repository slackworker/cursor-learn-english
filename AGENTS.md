# AGENTS.md — 给 AI 的项目导航

本地看板：Cursor Hooks JSONL → Next.js API → 学习/会话 UI。

**优先改“管这件事的最小文件”。** 各包入口见对应目录的 `index.ts`。

## 改哪里

| 目标 | 从这里开始 |
|------|------------|
| 会话列表 / 详情 / 子代理 / 标题 | `lib/sessions/` |
| 进程嵌套（Explored / Thought / 编辑卡片） | `lib/process-activity/tree.ts` |
| 进程标签 / 工具行 / 编辑 diff | `lib/process-activity/` |
| 时间线 UI（折叠、Shell/Edit 卡片） | `components/dialogue-timeline/` |
| transcript 与 events 交织 | `lib/interleave-transcript.ts` |
| 词表统计 / 词典 | `lib/vocab.ts`、`components/VocabStats.tsx` |
| Hooks 采集 / 安装 | `scripts/capture-*.mjs`、`scripts/setup-cursor-hooks.mjs` |
| 数据根路径 | `lib/default-paths.ts` 与 `scripts/default-paths.mjs`（保持同步） |

## 数据流

```
Cursor Hooks（scripts/*.mjs → hooks:install 后到 ~/.cursor）
  → data/*.jsonl
  → app/api/* → lib/*
  → components + 页面（SWR / fetch）
```

旁路输入：agent-transcripts、Cursor `state.vscdb` 标题、`data/` 下生成的词典。

## 注意

- 改了 `scripts/capture-*.mjs` 或 `scripts/default-paths.mjs` 后，提醒用户执行 `npm run hooks:install`（`~/.cursor` 里的副本不会自动更新）。
- 不要提交密钥或本机绝对路径。
- 进程嵌套回归：`npx --yes tsx scripts/verify-process-activity.ts`

## 暂未统一（别擅自合并）

- 双时间线：`transcript-path.tsx` vs `events-fallback.tsx`
- `lib/default-paths.ts` ≈ `scripts/default-paths.mjs`（TS vs Hooks ESM）
- 会话用 SWR，部分组件仍用裸 `fetch`
