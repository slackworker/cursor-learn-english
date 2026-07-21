"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Check, Undo2 } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Surface } from "@/components/ui/Surface";
import { useVocabPass } from "@/hooks/useVocabPass";
import type { VocabPassKind } from "@/lib/vocab-pass";
import {
  CEFR_HIDE_PRESETS,
  DEFAULT_DIFFICULTY_FILTER,
  NGSL_HIDE_PRESETS,
  ZIPF_HIDE_PRESETS,
  isBasicWord,
  loadDifficultyFilter,
  normalizeDifficultyFilter,
  saveDifficultyFilter,
  type CefrLevel,
  type DifficultyFilter,
  type DifficultyProfile,
} from "@/lib/word-difficulty-shared";

type VocabSource = "prompt" | "thinking" | "response";

type WordFreq = {
  word: string;
  count: number;
  gloss?: string;
  ipa?: string;
  pos?: string;
  ngslRank?: number;
  cefr?: CefrLevel;
  zipf?: number;
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

type DisplayItem = {
  text: string;
  count?: number;
  gloss?: string;
  ipa?: string;
  pos?: string;
  category?: string;
  orphan?: boolean;
  ngslRank?: number;
  cefr?: CefrLevel;
  zipf?: number;
};

const PAGE_SIZE = 100;

const SOURCE_OPTIONS: { id: VocabSource; label: string }[] = [
  { id: "prompt", label: "提问" },
  { id: "thinking", label: "Thinking" },
  { id: "response", label: "回复" },
];

const PROFILE_OPTIONS: { id: DifficultyProfile; label: string }[] = [
  { id: "off", label: "不过滤" },
  { id: "ngsl", label: "NGSL" },
  { id: "cefr", label: "CEFR-J" },
  { id: "zipf", label: "Zipf" },
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

function SourceFilters({
  sources,
  onToggle,
}: {
  sources: VocabSource[];
  onToggle: (id: VocabSource) => void;
}) {
  return (
    <div className="toolbar-filters" role="group" aria-label="语料来源">
      {SOURCE_OPTIONS.map(({ id, label }) => {
        const active = sources.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`toolbar-chip ${active ? "toolbar-chip-active" : ""}`}
            aria-pressed={active}
            onClick={() => onToggle(id)}
          >
            <span className="toolbar-chip-check" aria-hidden>
              {active ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function sortByCount<T extends { count: number }>(items: T[], asc: boolean): T[] {
  return [...items].sort((a, b) => (asc ? a.count - b.count : b.count - a.count));
}

export function VocabStats() {
  const [data, setData] = useState<VocabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("words");
  const [search, setSearch] = useState("");
  const [showChart, setShowChart] = useState(true);
  const [showPassed, setShowPassed] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [minCount, setMinCount] = useState(2);
  const [page, setPage] = useState(1);
  const [sources, setSources] = useState<VocabSource[]>([
    "prompt",
    "thinking",
    "response",
  ]);
  const [lastUndone, setLastUndone] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<DifficultyFilter>({
    ...DEFAULT_DIFFICULTY_FILTER,
  });
  const [diffHydrated, setDiffHydrated] = useState(false);

  useEffect(() => {
    setDiffFilter(loadDifficultyFilter());
    setDiffHydrated(true);
  }, []);

  useEffect(() => {
    if (!diffHydrated) return;
    saveDifficultyFilter(diffFilter);
  }, [diffFilter, diffHydrated]);

  const updateDiffFilter = (patch: Partial<DifficultyFilter>) => {
    setDiffFilter((prev) => normalizeDifficultyFilter({ ...prev, ...patch }));
  };

  const {
    passedWords,
    passedPhrases,
    passedWordSet,
    passedPhraseSet,
    pass,
    unpass,
    undo,
  } = useVocabPass();

  const passKind: VocabPassKind = tab === "words" ? "words" : "phrases";
  const passedList = tab === "words" ? passedWords : passedPhrases;

  const fetchVocab = useCallback((selected: VocabSource[]) => {
    setLoading(true);
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

  const toggleSource = (id: VocabSource) => {
    setSources((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  };

  const wordByKey = useMemo(() => {
    const map = new Map<string, WordFreq>();
    if (!data) return map;
    for (const w of data.words) map.set(w.word, w);
    return map;
  }, [data]);

  const phraseByKey = useMemo(() => {
    const map = new Map<string, PhraseFreq>();
    if (!data) return map;
    for (const p of data.phrases) map.set(p.phrase, p);
    return map;
  }, [data]);

  const displayItems = useMemo((): DisplayItem[] => {
    if (!data) return [];
    const q = search.trim().toLowerCase();

    if (showPassed) {
      if (tab === "words") {
        const out: DisplayItem[] = [];
        for (const text of [...passedWords].reverse()) {
          const hit = wordByKey.get(text);
          if (!hit) {
            if (!q || text.includes(q)) out.push({ text, orphan: true });
            continue;
          }
          if (minCount > 1 && hit.count < minCount) continue;
          if (
            q &&
            !hit.word.includes(q) &&
            !(hit.gloss && hit.gloss.toLowerCase().includes(q)) &&
            !(hit.ipa && hit.ipa.toLowerCase().includes(q)) &&
            !(hit.pos && hit.pos.toLowerCase().includes(q))
          ) {
            continue;
          }
          out.push({
            text: hit.word,
            count: hit.count,
            gloss: hit.gloss,
            ipa: hit.ipa,
            pos: hit.pos,
            ngslRank: hit.ngslRank,
            cefr: hit.cefr,
            zipf: hit.zipf,
          });
        }
        return out;
      }

      const out: DisplayItem[] = [];
      for (const text of [...passedPhrases].reverse()) {
        const hit = phraseByKey.get(text);
        if (!hit) {
          if (!q || text.includes(q)) out.push({ text, orphan: true });
          continue;
        }
        if (minCount > 1 && hit.count < minCount) continue;
        if (
          q &&
          !hit.phrase.includes(q) &&
          !(hit.gloss && hit.gloss.toLowerCase().includes(q))
        ) {
          continue;
        }
        out.push({
          text: hit.phrase,
          count: hit.count,
          gloss: hit.gloss,
          category: hit.category,
        });
      }
      return out;
    }

    if (tab === "words") {
      let items = data.words.filter((w) => !passedWordSet.has(w.word));
      if (diffFilter.profile !== "off") {
        items = items.filter((w) => !isBasicWord(w, diffFilter));
      }
      if (q) {
        items = items.filter(
          (w) =>
            w.word.includes(q) ||
            Boolean(w.gloss && w.gloss.toLowerCase().includes(q)) ||
            Boolean(w.ipa && w.ipa.toLowerCase().includes(q)) ||
            Boolean(w.pos && w.pos.toLowerCase().includes(q))
        );
      }
      if (minCount > 1) items = items.filter((w) => w.count >= minCount);
      return sortByCount(items, sortAsc).map((w) => ({
        text: w.word,
        count: w.count,
        gloss: w.gloss,
        ipa: w.ipa,
        pos: w.pos,
        ngslRank: w.ngslRank,
        cefr: w.cefr,
        zipf: w.zipf,
      }));
    }

    let items = data.phrases.filter((p) => !passedPhraseSet.has(p.phrase));
    if (q) {
      items = items.filter(
        (p) =>
          p.phrase.includes(q) ||
          Boolean(p.gloss && p.gloss.toLowerCase().includes(q))
      );
    }
    if (minCount > 1) items = items.filter((p) => p.count >= minCount);
    return sortByCount(items, sortAsc).map((p) => ({
      text: p.phrase,
      count: p.count,
      gloss: p.gloss,
      category: p.category,
    }));
  }, [
    data,
    tab,
    search,
    showPassed,
    minCount,
    sortAsc,
    diffFilter,
    passedWords,
    passedPhrases,
    passedWordSet,
    passedPhraseSet,
    wordByKey,
    phraseByKey,
  ]);

  const filteredTotal = displayItems.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [tab, search, showPassed, minCount, sortAsc, diffFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return displayItems.slice(start, start + PAGE_SIZE);
  }, [displayItems, page]);

  const handlePass = (text: string) => {
    pass(passKind, text);
    setLastUndone(null);
  };

  const handleUnpass = (text: string) => {
    unpass(passKind, text);
  };

  const handleUndo = () => {
    const undone = undo(passKind);
    if (undone) setLastUndone(undone);
  };

  if (loading && !data) {
    return <LoadingState>正在分析词频…</LoadingState>;
  }

  if (!loading && (!data || (data.words.length === 0 && data.phrases.length === 0))) {
    return (
      <div className="space-y-6">
        <div className="toolbar">
          <SourceFilters sources={sources} onToggle={toggleSource} />
        </div>
        <EmptyState>
          暂无数据。请确认提问、Thinking 或回复语料中有英文记录。
        </EmptyState>
      </div>
    );
  }

  const chartItems = showPassed
    ? []
    : displayItems.map((d) => ({
        name: d.text,
        value: d.count ?? 0,
      }));

  const uniqueWords = data?.uniqueWords ?? data?.words.length ?? 0;
  const uniquePhrases = data?.uniquePhrases ?? data?.phrases.length ?? 0;
  const remainingWords = data
    ? data.words.filter((w) => {
        if (passedWordSet.has(w.word)) return false;
        if (minCount > 1 && w.count < minCount) return false;
        if (diffFilter.profile !== "off" && isBasicWord(w, diffFilter)) {
          return false;
        }
        return true;
      }).length
    : 0;
  const remainingPhrases = data
    ? data.phrases.filter((p) => {
        if (passedPhraseSet.has(p.phrase)) return false;
        if (minCount > 1 && p.count < minCount) return false;
        return true;
      }).length
    : 0;
  const hiddenBasicCount = data
    ? data.words.filter(
        (w) =>
          !passedWordSet.has(w.word) &&
          diffFilter.profile !== "off" &&
          isBasicWord(w, diffFilter)
      ).length
    : 0;
  const bySource = data?.bySource ?? { prompt: 0, thinking: 0, response: 0 };
  const pageStart = filteredTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, filteredTotal);
  const isWordTab = tab === "words";

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <p className="text-sm text-base-content/60">
        待学单词{" "}
        <span className="tabular-nums text-base-content/80">
          {remainingWords.toLocaleString()} / {uniqueWords.toLocaleString()}
        </span>
        <span className="mx-2 text-base-content/25">·</span>
        待学搭配{" "}
        <span className="tabular-nums text-base-content/80">
          {remainingPhrases.toLocaleString()} / {uniquePhrases.toLocaleString()}
        </span>
        <span className="mx-2 text-base-content/25">·</span>
        已 Pass 单词 {passedWords.length} · 搭配 {passedPhrases.length}
        {hiddenBasicCount > 0 ? (
          <>
            <span className="mx-2 text-base-content/25">·</span>
            已隐藏基础词 {hiddenBasicCount.toLocaleString()}
          </>
        ) : null}
      </p>

      <div className="toolbar">
        <SourceFilters sources={sources} onToggle={toggleSource} />
        <div className="toolbar-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`toolbar-tab ${tab === "words" ? "toolbar-tab-active" : ""}`}
            onClick={() => {
              setTab("words");
              setSearch("");
              setLastUndone(null);
            }}
          >
            单词
          </button>
          <button
            type="button"
            role="tab"
            className={`toolbar-tab ${tab === "phrases" ? "toolbar-tab-active" : ""}`}
            onClick={() => {
              setTab("phrases");
              setSearch("");
              setLastUndone(null);
            }}
          >
            固定搭配
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} />
        <label className="label cursor-pointer gap-2 p-0">
          <span className="label-text text-sm text-base-content/60">已 Pass</span>
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={showPassed}
            onChange={() => setShowPassed((v) => !v)}
          />
        </label>
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
        {isWordTab ? (
          <>
            <label
              className="label cursor-pointer gap-2 p-0"
              title="隐藏过易单词：NGSL / CEFR-J / Zipf 三套方案可切换"
            >
              <span className="label-text text-sm text-base-content/60">基础词</span>
              <select
                className="select select-bordered select-sm bg-base-100"
                value={diffFilter.profile}
                onChange={(e) =>
                  updateDiffFilter({
                    profile: e.target.value as DifficultyProfile,
                  })
                }
              >
                {PROFILE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {diffFilter.profile === "ngsl" ? (
              <label className="label cursor-pointer gap-2 p-0">
                <span className="label-text text-sm text-base-content/60">
                  隐藏 ≤
                </span>
                <select
                  className="select select-bordered select-sm bg-base-100"
                  value={diffFilter.ngslMaxRank ?? DEFAULT_DIFFICULTY_FILTER.ngslMaxRank ?? 500}
                  onChange={(e) =>
                    updateDiffFilter({
                      profile: "ngsl",
                      ngslMaxRank: Number(e.target.value),
                    })
                  }
                >
                  {NGSL_HIDE_PRESETS.map((n) => (
                    <option key={n} value={n}>
                      {n === 2809 ? "全部 NGSL" : `NGSL 前 ${n}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {diffFilter.profile === "cefr" ? (
              <label className="label cursor-pointer gap-2 p-0">
                <span className="label-text text-sm text-base-content/60">
                  隐藏 ≤
                </span>
                <select
                  className="select select-bordered select-sm bg-base-100"
                  value={diffFilter.cefrMax ?? "a2"}
                  onChange={(e) =>
                    updateDiffFilter({
                      profile: "cefr",
                      cefrMax: e.target.value as CefrLevel,
                    })
                  }
                >
                  {CEFR_HIDE_PRESETS.map((lv) => (
                    <option key={lv} value={lv}>
                      {lv.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {diffFilter.profile === "zipf" ? (
              <label className="label cursor-pointer gap-2 p-0">
                <span className="label-text text-sm text-base-content/60">
                  隐藏 ≥
                </span>
                <select
                  className="select select-bordered select-sm bg-base-100"
                  value={diffFilter.zipfMin ?? 5}
                  onChange={(e) =>
                    updateDiffFilter({
                      profile: "zipf",
                      zipfMin: Number(e.target.value),
                    })
                  }
                >
                  {ZIPF_HIDE_PRESETS.map((z) => (
                    <option key={z} value={z}>
                      Zipf {z.toFixed(1)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!showPassed && (
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
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1"
            onClick={handleUndo}
            disabled={passedList.length === 0}
            title={
              passedList.length > 0
                ? `撤销最近一次 Pass：${passedList[passedList.length - 1]}`
                : "暂无可回退的 Pass"
            }
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            回退
          </button>
          {lastUndone ? (
            <span className="text-xs text-success/80">已恢复「{lastUndone}」</span>
          ) : null}
          {!showPassed && (
            <label className="label cursor-pointer gap-2 p-0">
              <span className="label-text text-sm text-base-content/60">图表</span>
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={showChart}
                onChange={() => setShowChart(!showChart)}
              />
            </label>
          )}
        </div>
      </div>

      {showChart && !showPassed && (
        <Surface>
          <BarChart items={chartItems} />
        </Surface>
      )}

      <Surface padding="sm">
        {pageItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-base-content/40">
            {showPassed
              ? `还没有 Pass 过任何${isWordTab ? "单词" : "搭配"}`
              : "无匹配结果（或已全部 Pass）"}
          </div>
        ) : (
          <>
            <div className="vocab-grid">
              {pageItems.map((item, index) => {
                const rank = pageStart + index;
                return (
                  <div
                    key={item.text}
                    className={`vocab-card ${showPassed ? "vocab-card-passed" : ""}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="break-words font-mono text-xs md:text-sm">
                          {item.text}
                        </div>
                        {item.ipa ? (
                          <p className="vocab-ipa text-primary/80">{item.ipa}</p>
                        ) : null}
                        {item.gloss ? (
                          <p className="mt-1 text-xs leading-snug text-base-content/55">
                            {item.pos ? (
                              <span className="mr-1 text-base-content/35">
                                {item.pos}.
                              </span>
                            ) : null}
                            {item.gloss}
                          </p>
                        ) : item.orphan ? (
                          <p className="mt-1 text-xs text-base-content/40">
                            当前语料未命中
                          </p>
                        ) : null}
                        {!isWordTab && item.category ? (
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-base-content/35">
                            {item.category}
                          </p>
                        ) : null}
                        {isWordTab &&
                        (item.cefr ||
                          item.ngslRank != null ||
                          item.zipf != null) ? (
                          <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] tabular-nums text-base-content/40">
                            {item.cefr ? (
                              <span title="CEFR-J / Octanove">
                                {item.cefr.toUpperCase()}
                              </span>
                            ) : null}
                            {item.ngslRank != null ? (
                              <span title="NGSL 1.2 rank">
                                NGSL#{item.ngslRank}
                              </span>
                            ) : null}
                            {item.zipf != null ? (
                              <span title="Approx Zipf (OpenSubtitles)">
                                z{item.zipf.toFixed(1)}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                      {showPassed ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs shrink-0"
                          onClick={() => handleUnpass(item.text)}
                          aria-label="从 Pass 列表恢复"
                        >
                          恢复
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs shrink-0 text-base-content/50 hover:text-success"
                          onClick={() => handlePass(item.text)}
                          aria-label="Pass：已学会，不再显示"
                        >
                          Pass
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-base-content/45">
                      <span className="select-none tabular-nums text-[10px] text-base-content/35">
                        #{rank}
                      </span>
                      {item.count != null ? (
                        <span className="font-semibold tabular-nums text-base-content/70">
                          {item.count} 次
                        </span>
                      ) : (
                        <span className="text-base-content/35">—</span>
                      )}
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

      <p className="text-xs text-base-content/40">
        语料 {(data?.totalRecords ?? 0).toLocaleString()} 条 · 总词数{" "}
        {(data?.totalTokens ?? 0).toLocaleString()} · 来源：提问 {bySource.prompt}{" "}
        · Thinking {bySource.thinking} · 回复 {bySource.response}
        {data?.wordDictionarySize != null ? (
          <> · 单词词典 {data.wordDictionarySize.toLocaleString()} 条</>
        ) : null}
        {data?.dictionarySize != null ? (
          <> · 搭配词典 {data.dictionarySize.toLocaleString()} 条</>
        ) : null}
      </p>
    </div>
  );
}
