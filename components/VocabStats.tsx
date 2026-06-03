"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { Surface } from "@/components/ui/Surface";

type WordFreq = { word: string; count: number };
type PhraseFreq = { phrase: string; count: number };
type VocabData = {
  words: WordFreq[];
  phrases: PhraseFreq[];
  totalTokens: number;
  totalRecords: number;
};

type Tab = "words" | "phrases";

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
        grid: { left: 120, right: 30, top: 10, bottom: 30 },
        xAxis: { type: "value" },
        yAxis: {
          type: "category",
          data: top30.map((d) => d.name),
          axisLabel: { fontSize: 12 },
        },
        series: [
          {
            type: "bar",
            data: top30.map((d) => d.value),
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
  return <div ref={chartRef} className="h-[500px] w-full" />;
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
  const router = useRouter();
  const [data, setData] = useState<VocabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("words");
  const [search, setSearch] = useState("");
  const [showChart, setShowChart] = useState(true);
  const [starredWords, setStarredWords] = useState<string[]>([]);
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [minCount, setMinCount] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch("/api/vocab?wordLimit=1000&phraseLimit=1000")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

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

  const filteredWords = useMemo(() => {
    if (!data) return [];
    let items = data.words;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((w) => w.word.includes(q));
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
      items = items.filter((p) => p.phrase.includes(q));
    }
    if (minCount > 1) {
      items = items.filter((p) => p.count >= minCount);
    }
    const sorted = [...items].sort((a, b) => (sortAsc ? a.count - b.count : b.count - a.count));
    return sorted;
  }, [data, search, sortAsc, minCount]);

  const toggleStar = (word: string) => {
    setStarredWords((prev) => (prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]));
  };

  const handleExport = () => {
    const items = tab === "words" ? filteredWords : filteredPhrases;
    if (items.length === 0) return;

    const lines = [
      tab === "words" ? "rank,word,count" : "rank,phrase,count",
      ...items.map((item, index) => {
        const text = "word" in item ? item.word : (item as PhraseFreq).phrase;
        const safeText = `"${text.replace(/\"/g, '\"\"')}"`;
        return `${index + 1},${safeText},${item.count}`;
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

  if (loading) {
    return <LoadingState>正在分析词频…</LoadingState>;
  }

  if (!data || (data.words.length === 0 && data.phrases.length === 0)) {
    return (
      <EmptyState>
        暂无数据。请确认 thinking-corpus.jsonl 中有记录。
      </EmptyState>
    );
  }

  const chartItems = (tab === "words" ? filteredWords : filteredPhrases).map((d) => ({
    name: "word" in d ? d.word : (d as PhraseFreq).phrase,
    value: d.count,
  }));

  const currentItems = tab === "words" ? filteredWords : filteredPhrases;

  return (
    <div className="space-y-6">
      <div className="stat-grid md:grid-cols-4 lg:grid-cols-4">
        {[
          { label: "Thinking 条数", value: data.totalRecords },
          { label: "总词数（含重复）", value: data.totalTokens.toLocaleString() },
          { label: "不重复单词", value: data.words.length },
          { label: "高频短语", value: data.phrases.length },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-card-accent" aria-hidden />
            <p className="stat-card-label">{c.label}</p>
            <p className="stat-card-value">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="toolbar">
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
            短语频次
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
            disabled={currentItems.length === 0}
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
        {currentItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-base-content/40">无匹配结果</div>
        ) : (
          <div className="vocab-grid">
            {currentItems.map((item, index) => {
              const isWord = "word" in item;
              const text = isWord ? item.word : (item as PhraseFreq).phrase;
              const starred = isWord && starredWords.includes(text);
              return (
                <div
                  key={text}
                  className={`vocab-card ${starred ? "vocab-card-starred" : ""}`}
                  onClick={() => {
                    router.push(`/thinking?highlight=${encodeURIComponent(text)}`);
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-1">
                    <div className="break-words font-mono text-xs md:text-sm">
                      <span className="mr-1 text-[10px] text-base-content/35">#{index + 1}</span>
                      {text}
                    </div>
                    {isWord && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(text);
                        }}
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
                    <span>{tab === "words" ? "单词" : "短语"}</span>
                    <span className="font-semibold tabular-nums text-base-content/70">
                      {item.count} 次
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
