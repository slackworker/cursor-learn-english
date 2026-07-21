"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Surface } from "@/components/ui/Surface";

type VocabSource = "prompt" | "thinking" | "response";

type WordFreq = {
  word: string;
  count: number;
  gloss?: string;
  ipa?: string;
  pos?: string;
};
type PhraseFreq = {
  phrase: string;
  count: number;
  gloss?: string;
  category?: string;
};
type VocabData = {
  words: WordFreq[];
  phrases: PhraseFreq[];
  uniqueWords?: number;
  uniquePhrases?: number;
  totalTokens: number;
  totalRecords: number;
  bySource: Record<VocabSource, number>;
  sources: VocabSource[];
  dictionarySize?: number;
  wordDictionarySize?: number;
};

type Tab = "words" | "phrases";

const PAGE_SIZE = 100;

const SOURCE_OPTIONS: { id: VocabSource; label: string }[] = [
  { id: "prompt", label: "提问" },
  { id: "thinking", label: "Thinking" },
  { id: "response", label: "回复" },
];

function BarChart({ items }: { items: { name: string; value: number }[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReturnType<typeof import("echarts")["init"]> | null>(null);

  useEffect(() => {
    if (!chartRef.current || items.length === 0) return;
    let disposed = false;

    import("echarts").then((echarts) => {
      if (disposed || !chartRef.current) return;
      if (instanceRef.current) instanceRef.current.dispose();

      const chart = echarts.init(chartRef.current);
      instanceRef.current = chart;

      const top30 = items.slice(0, 30).reverse();
      chart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: 130, right: 30, top: 8, bottom: 24 },
        xAxis: { type: "value" },
        yAxis: {
          type: "category",
          data: top30.map((d) => d.name),
          axisLabel: {
            fontSize: 11,
            interval: 0,
            hideOverlap: false,
            width: 118,
            overflow: "truncate",
          },
          axisTick: { alignWithLabel: true },
        },
        series: [
          {
            type: "bar",
            data: top30.map((d) => d.value),
            barCategoryGap: "20%",
            itemStyle: { borderRadius: [0, 4, 4, 0] },
          },
        ],
      });

      const onResize = () => chart.resize();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    });

    return () => {
      disposed = true;
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, [items]);

  if (items.length === 0) return null;
  return <div ref={chartRef} className="h-[640px] w-full" />;
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      placeholder="搜索…"
      className="toolbar-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function VocabStats() {
  const [data, setData] = useState<VocabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("words");
  const [search, setSearch] = useState("");
  const [showChart, setShowChart] = useState(true);
  const [starredWords, setStarredWords] = useState<string[]>([]);
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [minCount, setMinCount] = useState(1);
  const [page, setPage] = useState(1);
  const [sources, setSources] = useState<VocabSource[]>([
    "prompt",
    "thinking",
    "response",
  ]);

  const fetchVocab = useCallback((selected: VocabSource[]) => {
    setLoading(true);
    // No top-N cut — full lists; grid paginates client-side.
    const params = new URLSearchParams({
      sources: selected.join(","),
    });
    fetch(`/api/vocab?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPage(1);
    fetchVocab(sources);
  }, [sources, fetchVocab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("vocab_new_words_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setStarredWords(parsed.filter((w): w is string => typeof w === "string"));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("vocab_new_words_v1", JSON.stringify(starredWords));
    } catch {
      // ignore
    }
  }, [starredWords]);

  const toggleSource = (id: VocabSource) => {
    setSources((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  };

  const filteredWords = useMemo(() => {
    if (!data) return [];
    let items = data.words;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (w) =>
          w.word.includes(q) ||
          (w.gloss && w.gloss.toLowerCase().includes(q)) ||
          (w.ipa && w.ipa.toLowerCase().includes(q)) ||
          (w.pos && w.pos.toLowerCase().includes(q))
      );
    }
    if (onlyStarred) {
      items = items.filter((w) => starredWords.includes(w.word));
    }
    if (minCount > 1) {
      items = items.filter((w) => w.count >= minCount);
    }
    const sorted = [...items].sort((a, b) => (sortAsc ? a.count - b.count : b.count - a.count));
    return sorted;
  }, [data, search, onlyStarred, starredWords, sortAsc, minCount]);

  const filteredPhrases = useMemo(() => {
    if (!data) return [];
    let items = data.phrases;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.phrase.includes(q) ||
          (p.gloss && p.gloss.toLowerCase().includes(q))
      );
    }
    if (minCount > 1) {
      items = items.filter((p) => p.count >= minCount);
    }
    const sorted = [...items].sort((a, b) => (sortAsc ? a.count - b.count : b.count - a.count));
    return sorted;
  }, [data, search, sortAsc, minCount]);

  const filteredTotal =
    tab === "words" ? filteredWords.length : filteredPhrases.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [tab, search, onlyStarred, minCount, sortAsc]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const items = tab === "words" ? filteredWords : filteredPhrases;
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [tab, filteredWords, filteredPhrases, page]);

  const toggleStar = (word: string) => {
    setStarredWords((prev) => (prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]));
  };

  const handleExport = () => {
    const items = tab === "words" ? filteredWords : filteredPhrases;
    if (items.length === 0) return;

    const lines = [
      tab === "words"
        ? "rank,word,ipa,gloss,pos,count"
        : "rank,phrase,count,gloss,category",
      ...items.map((item, index) => {
        if ("word" in item) {
          const w = item as WordFreq;
          const safeText = `"${w.word.replace(/"/g, '""')}"`;
          const safeIpa = `"${(w.ipa ?? "").replace(/"/g, '""')}"`;
          const safeGloss = `"${(w.gloss ?? "").replace(/"/g, '""')}"`;
          const safePos = `"${(w.pos ?? "").replace(/"/g, '""')}"`;
          return `${index + 1},${safeText},${safeIpa},${safeGloss},${safePos},${w.count}`;
        }
        const p = item as PhraseFreq;
        const safePhrase = `"${p.phrase.replace(/"/g, '""')}"`;
        const safeGloss = `"${(p.gloss ?? "").replace(/"/g, '""')}"`;
        return `${index + 1},${safePhrase},${p.count},${safeGloss},${p.category ?? ""}`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab === "words" ? "vocab_words.csv" : "vocab_phrases.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return <LoadingState>正在分析词频…</LoadingState>;
  }

  if (!loading && (!data || (data.words.length === 0 && data.phrases.length === 0))) {
    return (
      <div className="space-y-6">
        <div className="toolbar">
          <div className="toolbar-tabs" role="group" aria-label="语料来源">
            {SOURCE_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`toolbar-tab ${sources.includes(id) ? "toolbar-tab-active" : ""}`}
                onClick={() => toggleSource(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <EmptyState>
          暂无数据。请确认提问、Thinking 或回复语料中有英文记录。
        </EmptyState>
      </div>
    );
  }

  const chartItems = (tab === "words" ? filteredWords : filteredPhrases).map((d) => ({
    name: "word" in d ? d.word : (d as PhraseFreq).phrase,
    value: d.count,
  }));

  const uniqueWords = data?.uniqueWords ?? data?.words.length ?? 0;
  const uniquePhrases = data?.uniquePhrases ?? data?.phrases.length ?? 0;
  const bySource = data?.bySource ?? { prompt: 0, thinking: 0, response: 0 };
  const pageStart = filteredTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, filteredTotal);

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <div className="stat-grid md:grid-cols-4 lg:grid-cols-4">
        {[
          { label: "语料条数", value: data?.totalRecords ?? 0 },
          { label: "总词数（含重复）", value: (data?.totalTokens ?? 0).toLocaleString() },
          { label: "不重复单词", value: uniqueWords.toLocaleString() },
          { label: "固定搭配（命中）", value: uniquePhrases.toLocaleString() },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-card-accent" aria-hidden />
            <p className="stat-card-label">{c.label}</p>
            <p className="stat-card-value">{c.value}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-base-content/50">
        来源：提问 {bySource.prompt} · Thinking {bySource.thinking} · 回复{" "}
        {bySource.response}
        {data?.wordDictionarySize != null ? (
          <> · 单词词典 {data.wordDictionarySize.toLocaleString()} 条</>
        ) : null}
        {data?.dictionarySize != null ? (
          <> · 搭配词典 {data.dictionarySize.toLocaleString()} 条</>
        ) : null}
      </p>

      <div className="toolbar">
        <div className="toolbar-tabs" role="group" aria-label="语料来源">
          {SOURCE_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`toolbar-tab ${sources.includes(id) ? "toolbar-tab-active" : ""}`}
              onClick={() => toggleSource(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`toolbar-tab ${tab === "words" ? "toolbar-tab-active" : ""}`}
            onClick={() => {
              setTab("words");
              setSearch("");
            }}
          >
            单词频次
          </button>
          <button
            type="button"
            role="tab"
            className={`toolbar-tab ${tab === "phrases" ? "toolbar-tab-active" : ""}`}
            onClick={() => {
              setTab("phrases");
              setSearch("");
            }}
          >
            固定搭配
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} />
        {tab === "words" && (
          <label className="label cursor-pointer gap-2 p-0">
            <span className="label-text text-sm text-base-content/60">只看生词</span>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={onlyStarred}
              onChange={() => setOnlyStarred((v) => !v)}
            />
          </label>
        )}
        <label className="label cursor-pointer gap-2 p-0">
          <span className="label-text text-sm text-base-content/60">最小次数</span>
          <select
            className="select select-bordered select-sm bg-base-100"
            value={minCount}
            onChange={(e) => setMinCount(Number(e.target.value) || 1)}
          >
            <option value={1}>≥1</option>
            <option value={2}>≥2</option>
            <option value={3}>≥3</option>
            <option value={5}>≥5</option>
            <option value={10}>≥10</option>
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="toolbar-tabs">
            <button
              type="button"
              className={`toolbar-tab ${!sortAsc ? "toolbar-tab-active" : ""}`}
              onClick={() => setSortAsc(false)}
            >
              次数↓
            </button>
            <button
              type="button"
              className={`toolbar-tab ${sortAsc ? "toolbar-tab-active" : ""}`}
              onClick={() => setSortAsc(true)}
            >
              次数↑
            </button>
          </div>
          <label className="label cursor-pointer gap-2 p-0">
            <span className="label-text text-sm text-base-content/60">图表</span>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={showChart}
              onChange={() => setShowChart(!showChart)}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            disabled={filteredTotal === 0}
          >
            导出 CSV
          </button>
        </div>
      </div>

      {showChart && (
        <Surface>
          <BarChart items={chartItems} />
        </Surface>
      )}

      <Surface padding="sm">
        {pageItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-base-content/40">无匹配结果</div>
        ) : (
          <>
            <div className="vocab-grid">
              {pageItems.map((item, index) => {
                const isWord = "word" in item;
                const text = isWord ? item.word : (item as PhraseFreq).phrase;
                const wordItem = isWord ? (item as WordFreq) : null;
                const gloss = isWord
                  ? wordItem?.gloss
                  : (item as PhraseFreq).gloss;
                const ipa = wordItem?.ipa;
                const pos = wordItem?.pos;
                const starred = isWord && starredWords.includes(text);
                const rank = pageStart + index;
                return (
                  <div
                    key={text}
                    className={`vocab-card ${starred ? "vocab-card-starred" : ""}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-mono text-xs md:text-sm">
                          <span className="mr-1 text-[10px] text-base-content/35">
                            #{rank}
                          </span>
                          {text}
                        </div>
                        {ipa ? (
                          <p className="vocab-ipa text-primary/80">{ipa}</p>
                        ) : null}
                        {gloss ? (
                          <p className="mt-1 text-xs leading-snug text-base-content/55">
                            {pos ? (
                              <span className="mr-1 text-base-content/35">
                                {pos}.
                              </span>
                            ) : null}
                            {gloss}
                          </p>
                        ) : null}
                      </div>
                      {isWord && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs px-1"
                          onClick={() => toggleStar(text)}
                          aria-label={starred ? "取消生词标记" : "标记为生词"}
                        >
                          {starred ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="h-3.5 w-3.5 text-warning"
                            >
                              <path d="M12 2.25l2.955 6.016 6.645.967-4.8 4.68 1.133 6.617L12 17.75l-5.933 3.12 1.133-6.617-4.8-4.68 6.645-.967L12 2.25z" />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              className="h-3.5 w-3.5 text-base-content/40"
                            >
                              <path d="M12 2.75l2.7 5.5 6.05.88-4.375 4.27 1.033 6.02L12 16.96l-5.408 2.91 1.033-6.02L3.25 9.13l6.05-.88L12 2.75z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-base-content/45">
                      <span>{tab === "words" ? "单词" : "搭配"}</span>
                      <span className="font-semibold tabular-nums text-base-content/70">
                        {item.count} 次
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              disabled={loading}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              summary={
                filteredTotal === 0
                  ? `每页 ${PAGE_SIZE} 条`
                  : `第 ${pageStart}–${pageEnd} 条 · 共 ${filteredTotal} 条 · 每页 ${PAGE_SIZE}`
              }
            />
          </>
        )}
      </Surface>
    </div>
  );
}
