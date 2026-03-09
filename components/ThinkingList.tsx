"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ThinkingRecord = {
  text: string;
  timestamp: string;
  model: string;
  conversation_id: string;
  generation_id: string;
  duration_ms: number;
};

type ThinkingGroup = {
  user_prompt?: string;
  prompt_timestamp?: string;
  conversation_id: string;
  items: ThinkingRecord[];
};

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-base-300 px-1.5 py-0.5 text-sm">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-base-300 p-3 text-sm">{children}</pre>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link link-primary">
      {children}
    </a>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-2 mt-3 text-lg font-semibold">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-2 mt-3 text-base font-semibold">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-base-300 pl-3 opacity-70">
      {children}
    </blockquote>
  ),
};

function ThinkingItem({ record, index }: { record: ThinkingRecord; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = (record.text.match(/\n/g) ?? []).length + 1;
  const canExpand = lineCount > 4;

  return (
    <div className="border-l-2 border-base-300 pl-4 py-2">
      <div className="flex items-center gap-3 text-xs opacity-60">
        <span className="badge badge-sm badge-ghost">#{index + 1}</span>
        <span>{record.timestamp.slice(0, 19).replace("T", " ")}</span>
        <span>{record.model}</span>
        <span>{record.duration_ms}ms</span>
      </div>
      <div className={`mt-1 break-words ${expanded ? "" : "line-clamp-4"}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {record.text}
        </ReactMarkdown>
      </div>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="btn btn-xs btn-ghost mt-1 opacity-70"
        >
          {expanded ? "收起" : "展开"}
        </button>
      )}
    </div>
  );
}

function GroupCard({ group }: { group: ThinkingGroup }) {
  return (
    <li className="p-4">
      {group.user_prompt && (
        <div className="rounded-lg border border-info/30 bg-info/10 p-3 mb-3">
          <span className="mb-1 block text-xs font-medium text-info">
            我的问题
          </span>
          <p className="whitespace-pre-wrap break-words text-sm">
            {group.user_prompt}
          </p>
        </div>
      )}

      <span className="mb-2 block text-xs font-medium text-success">
        Thinking ({group.items.length} 条)
      </span>
      <div className="space-y-3">
        {group.items.map((r, i) => (
          <ThinkingItem
            key={`${r.generation_id}-${i}`}
            record={r}
            index={i}
          />
        ))}
      </div>
    </li>
  );
}

export function ThinkingList() {
  const [groups, setGroups] = useState<ThinkingGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 10;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/thinking?page=${page}&pageSize=${pageSize}`)
      .then((r) => r.json())
      .then((res) => {
        setGroups(res.groups ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading && groups.length === 0) {
    return <div className="card bg-base-200 p-6"><span className="loading loading-spinner loading-sm"></span> 加载中…</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="card bg-base-200 p-6">
        <p className="opacity-60">暂无 Thinking 记录。请使用带 thinking 的模型（如 Claude Opus thinking）并确保 Hooks 已采集。</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="card bg-base-200">
        <ul className="divide-y divide-base-300">
          {groups.map((g, i) => (
            <GroupCard key={`${g.conversation_id}-${g.prompt_timestamp ?? i}`} group={g} />
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm opacity-60">共 {total} 组</p>
        <div className="join">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="join-item btn btn-sm"
          >
            上一页
          </button>
          <span className="join-item btn btn-sm btn-disabled">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="join-item btn btn-sm"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
