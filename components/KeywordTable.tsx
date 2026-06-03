"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";

export type KeywordRow = {
  score: number;
  country: string;
  name: string;
  msg: string;
  time: number;
  reviewed?: boolean;
  interested?: boolean;
};

type SortKey = "time" | "score";
type SortDir = "asc" | "desc";
type KeywordTableProps = {
  selectedDate?: string;
};

function parseJsonl(text: string): KeywordRow[] {
  const rows: KeywordRow[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as KeywordRow;
      if (
        typeof o.score === "number" &&
        typeof o.country === "string" &&
        typeof o.name === "string" &&
        typeof o.msg === "string" &&
        typeof o.time === "number"
      ) {
        rows.push(o);
      }
    } catch {
      /* skip bad line */
    }
  }
  return rows;
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseDateStart(date: string) {
  return new Date(`${date}T00:00:00`).getTime() / 1000;
}

function parseDateEnd(date: string) {
  return new Date(`${date}T23:59:59`).getTime() / 1000;
}

export function KeywordTable({ selectedDate }: KeywordTableProps) {
  const [raw, setRaw] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<string>("");
  const [showZeroScore, setShowZeroScore] = useState(false);
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const [onlyInterested, setOnlyInterested] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/keyword")
      .then((r) => r.json())
      .then((res) => setRaw(Array.isArray(res.rows) ? (res.rows as KeywordRow[]) : []))
      .catch(() => setRaw([]))
      .finally(() => setLoading(false));
  }, []);

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of raw) s.add(r.country);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [raw]);

  const filteredSorted = useMemo(() => {
    let list = country ? raw.filter((r) => r.country === country) : [...raw];
    if (!showZeroScore) {
      list = list.filter((r) => r.score !== 0);
    }
    if (onlyReviewed) {
      list = list.filter((r) => Boolean(r.reviewed));
    }
    if (onlyInterested) {
      list = list.filter((r) => Boolean(r.interested));
    }
    if (selectedDate) {
      const startTs = parseDateStart(selectedDate);
      if (!Number.isNaN(startTs)) {
        list = list.filter((r) => r.time >= startTs);
      }
      const endTs = parseDateEnd(selectedDate);
      if (!Number.isNaN(endTs)) {
        list = list.filter((r) => r.time <= endTs);
      }
    }
    const mul = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = sortKey === "time" ? a.time : a.score;
      const vb = sortKey === "time" ? b.time : b.score;
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return a.name.localeCompare(b.name) * mul;
    });
    return list;
  }, [raw, country, showZeroScore, onlyReviewed, onlyInterested, selectedDate, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "time" ? "desc" : "desc");
    }
  }

  function sortHint(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  async function updateFlag(
    row: KeywordRow,
    patch: Pick<KeywordRow, "reviewed" | "interested">,
    savingSuffix: "reviewed" | "interested",
  ) {
    const key = `${row.time}-${row.name}`;
    setSavingKey(`${key}-${savingSuffix}`);
    const previous = raw;
    setRaw((list) =>
      list.map((item) =>
        item.time === row.time && item.name === row.name ? { ...item, ...patch } : item,
      ),
    );
    try {
      const res = await fetch("/api/keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: row.name, time: row.time, ...patch }),
      });
      if (!res.ok) {
        setRaw(previous);
      }
    } catch {
      setRaw(previous);
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (raw.length === 0) {
    return (
      <EmptyState>
        暂无关键词数据。请将 JSONL 放到{" "}
        <code className="text-xs">public/keyword-data.jsonl</code>。
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="toolbar">
        <span className="text-xs font-medium uppercase tracking-wide text-base-content/45">国家/地区</span>
        <div className="toolbar-tabs">
          <button
            type="button"
            className={`toolbar-tab ${country === "" ? "toolbar-tab-active" : ""}`}
            onClick={() => setCountry("")}
          >
            全部
          </button>
          {countries.map((c) => (
            <button
              key={c}
              type="button"
              className={`toolbar-tab ${country === c ? "toolbar-tab-active" : ""}`}
              onClick={() => setCountry(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="label cursor-pointer gap-2 p-0">
          <span className="text-sm text-base-content/60">显示分数为 0</span>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={showZeroScore}
            onChange={(e) => setShowZeroScore(e.target.checked)}
          />
        </label>
        <label className="label cursor-pointer gap-2 p-0">
          <span className="text-sm text-base-content/60">仅看已阅</span>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={onlyReviewed}
            onChange={(e) => setOnlyReviewed(e.target.checked)}
          />
        </label>
        <label className="label cursor-pointer gap-2 p-0">
          <span className="text-sm text-base-content/60">仅看感兴趣</span>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={onlyInterested}
            onChange={(e) => setOnlyInterested(e.target.checked)}
          />
        </label>
        <span className="text-sm text-base-content/45">共 {filteredSorted.length} 条</span>
      </div>

      <div className="data-table-wrap overflow-x-auto">
        <table className="data-table min-w-[640px]">
          <thead>
            <tr>
              <th>国家</th>
              <th>关键词</th>
              <th>说明</th>
              <th>
                <button
                  type="button"
                  className="font-semibold underline-offset-2 hover:underline"
                  onClick={() => toggleSort("score")}
                >
                  分数{sortHint("score")}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="font-semibold underline-offset-2 hover:underline"
                  onClick={() => toggleSort("time")}
                >
                  时间{sortHint("time")}
                </button>
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((r, i) => (
              <tr key={`${r.time}-${r.name}-${i}`}>
                <td className="whitespace-nowrap">{r.country}</td>
                <td className="max-w-[140px] font-medium">
                  <a
                    href={`https://x.com/search?q=${encodeURIComponent(r.name)}&src=typed_query`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="data-table-link"
                  >
                    {r.name}
                  </a>
                </td>
                <td className="max-w-md">{r.msg}</td>
                <td className="whitespace-nowrap tabular-nums">{r.score}</td>
                <td className="whitespace-nowrap font-mono text-xs">{formatTime(r.time)}</td>
                <td className="whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    <label className="label cursor-pointer justify-start gap-2 p-0">
                      <span className="text-xs">{r.reviewed ? "已阅" : "未查看"}</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-sm toggle-primary"
                        checked={Boolean(r.reviewed)}
                        disabled={savingKey === `${r.time}-${r.name}-reviewed`}
                        onChange={(e) =>
                          updateFlag(r, { reviewed: e.target.checked }, "reviewed")
                        }
                      />
                    </label>
                    <label className="label cursor-pointer justify-start gap-2 p-0">
                      <span className="text-xs">{r.interested ? "感兴趣" : "不感兴趣"}</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-sm toggle-primary"
                        checked={Boolean(r.interested)}
                        disabled={savingKey === `${r.time}-${r.name}-interested`}
                        onChange={(e) =>
                          updateFlag(r, { interested: e.target.checked }, "interested")
                        }
                      />
                    </label>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
