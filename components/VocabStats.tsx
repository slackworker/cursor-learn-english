"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, Undo2, X } from "lucide-react";
import { DialogueTtsPlayButton } from "@/components/DialogueTtsContext";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Surface } from "@/components/ui/Surface";
import { VocabSettingsDrawer } from "@/components/VocabSettingsDrawer";
import { useVocabPass } from "@/hooks/useVocabPass";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { buildVocabSpeakText } from "@/lib/tts";
import type { VocabPassKind } from "@/lib/vocab-pass";
import {
  DEFAULT_DIFFICULTY_FILTER,
  isBasicWord,
  loadDifficultyFilter,
  normalizeDifficultyFilter,
  saveDifficultyFilter,
  type CefrLevel,
  type DifficultyFilter,
} from "@/lib/word-difficulty-shared";

type VocabSource = "prompt" | "thinking" | "response";

type WordFreq = {
  word: string;
  count: number;
  gloss?: string;
  glosses?: Array<{ gloss: string; pos?: string }>;
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
  glosses?: Array<{ gloss: string; pos?: string }>;
  ipa?: string;
  pos?: string;
  category?: string;
  orphan?: boolean;
  ngslRank?: number;
  cefr?: CefrLevel;
  zipf?: number;
};

const PAGE_SIZE = 100;

/** Tooltip text for word difficulty (CEFR / NGSL / Zipf). */
function wordDifficultyTitle(
  item: Pick<DisplayItem, "cefr" | "ngslRank" | "zipf">
): string | undefined {
  const parts: string[] = [];
  if (item.cefr) parts.push(`CEFR ${item.cefr.toUpperCase()}`);
  if (item.ngslRank != null) parts.push(`NGSL #${item.ngslRank}`);
  if (item.zipf != null) parts.push(`Zipf ${item.zipf.toFixed(1)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function glossMatchesQuery(
  gloss: string | undefined,
  glosses: Array<{ gloss: string; pos?: string }> | undefined,
  q: string
): boolean {
  if (gloss && gloss.toLowerCase().includes(q)) return true;
  if (!glosses) return false;
  return glosses.some(
    (g) =>
      g.gloss.toLowerCase().includes(q) ||
      Boolean(g.pos && g.pos.toLowerCase().includes(q))
  );
}

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

      const narrow = chartRef.current.clientWidth < 420;
      const top30 = items.slice(0, 30).reverse();
      chart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: {
          left: narrow ? 72 : 130,
          right: narrow ? 12 : 30,
          top: 8,
          bottom: 24,
        },
        xAxis: { type: "value" },
        yAxis: {
          type: "category",
          data: top30.map((d) => d.name),
          axisLabel: {
            fontSize: narrow ? 10 : 11,
            interval: 0,
            hideOverlap: false,
            width: narrow ? 64 : 118,
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
    <div className="toolbar-search">
      <input
        type="text"
        placeholder="搜索…"
        className={`toolbar-input${value ? " toolbar-input--clearable" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="toolbar-search-clear"
          aria-label="清除搜索"
          onClick={() => onChange("")}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
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
  const [showChart, setShowChart] = useState(false);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setDiffFilter(loadDifficultyFilter());
    setDiffHydrated(true);
  }, []);

  useEffect(() => {
    if (!diffHydrated) return;
    saveDifficultyFilter(diffFilter);
  }, [diffFilter, diffHydrated]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const unlockScroll = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [settingsOpen]);

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
            !glossMatchesQuery(hit.gloss, hit.glosses, q) &&
            !(hit.ipa && hit.ipa.toLowerCase().includes(q)) &&
            !(hit.pos && hit.pos.toLowerCase().includes(q))
          ) {
            continue;
          }
          out.push({
            text: hit.word,
            count: hit.count,
            gloss: hit.gloss,
            glosses: hit.glosses,
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
            glossMatchesQuery(w.gloss, w.glosses, q) ||
            Boolean(w.ipa && w.ipa.toLowerCase().includes(q)) ||
            Boolean(w.pos && w.pos.toLowerCase().includes(q))
        );
      }
      if (minCount > 1) items = items.filter((w) => w.count >= minCount);
      return sortByCount(items, sortAsc).map((w) => ({
        text: w.word,
        count: w.count,
        gloss: w.gloss,
        glosses: w.glosses,
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

  useEffect(() => {
    if (!lastUndone) return;
    const timer = window.setTimeout(() => setLastUndone(null), 2500);
    return () => window.clearTimeout(timer);
  }, [lastUndone]);

  if (loading && !data) {
    return <LoadingState>正在分析词频…</LoadingState>;
  }

  if (!loading && (!data || (data.words.length === 0 && data.phrases.length === 0))) {
    return (
      <div className="space-y-6">
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5 ml-auto"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            筛选
          </button>
        </div>
        <EmptyState>
          暂无数据。请确认提问、Thinking 或回复语料中有英文记录。
        </EmptyState>
        {portalReady
          ? createPortal(
              <VocabSettingsDrawer
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                sources={sources}
                onToggleSource={toggleSource}
                minCount={minCount}
                onMinCountChange={setMinCount}
                isWordTab
                diffFilter={diffFilter}
                onDiffFilterChange={updateDiffFilter}
                sortAsc={sortAsc}
                onSortAscChange={setSortAsc}
                showChart={showChart}
                onShowChartChange={setShowChart}
                showPassed={showPassed}
                onShowPassedChange={setShowPassed}
                passedCount={passedList.length}
              />,
              document.body
            )
          : null}
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
      <p className="text-sm leading-relaxed text-base-content/60">
        待学单词{" "}
        <span className="tabular-nums text-base-content/80">
          {remainingWords.toLocaleString()} / {uniqueWords.toLocaleString()}
        </span>
        <span className="mx-1.5 text-base-content/25 sm:mx-2">·</span>
        <span className="inline-block">
          待学短语{" "}
          <span className="tabular-nums text-base-content/80">
            {remainingPhrases.toLocaleString()} / {uniquePhrases.toLocaleString()}
          </span>
        </span>
        <span className="mx-1.5 text-base-content/25 sm:mx-2">·</span>
        <span className="inline-block">
          Passed 单词 {passedWords.length} · 短语 {passedPhrases.length}
        </span>
        {hiddenBasicCount > 0 ? (
          <>
            <span className="mx-1.5 text-base-content/25 sm:mx-2">·</span>
            <span className="inline-block">
              已排除过易词 {hiddenBasicCount.toLocaleString()}
            </span>
          </>
        ) : null}
      </p>

      <div className="space-y-2">
        <div className="vocab-toolbar">
          <div className="toolbar-tabs shrink-0" role="tablist" aria-label="词库类型">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "words"}
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
              aria-selected={tab === "phrases"}
              className={`toolbar-tab ${tab === "phrases" ? "toolbar-tab-active" : ""}`}
              onClick={() => {
                setTab("phrases");
                setSearch("");
                setLastUndone(null);
              }}
            >
              短语
            </button>
          </div>

          <SearchInput value={search} onChange={setSearch} />

          <div className="vocab-toolbar-actions">
            <div className="relative">
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
                <span
                  role="status"
                  className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-base-100/95 px-2 py-0.5 text-xs text-success shadow-sm"
                >
                  已恢复「{lastUndone}」
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square text-base-content/55"
              onClick={() => setSettingsOpen(true)}
              aria-expanded={settingsOpen}
              aria-label="筛选设置"
              title="筛选设置"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {showPassed ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-success/25 bg-success/5 px-3 py-2 text-sm">
            <span className="text-base-content/65">
              正在查看 Passed
              {passedList.length > 0 ? (
                <>
                  {" "}
                  <span className="tabular-nums text-base-content/80">
                    {passedList.length}
                  </span>
                </>
              ) : null}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-xs shrink-0"
              onClick={() => setShowPassed(false)}
            >
              返回待学
            </button>
          </div>
        ) : null}
      </div>

      {portalReady
        ? createPortal(
            <VocabSettingsDrawer
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              sources={sources}
              onToggleSource={toggleSource}
              minCount={minCount}
              onMinCountChange={setMinCount}
              isWordTab={isWordTab}
              diffFilter={diffFilter}
              onDiffFilterChange={updateDiffFilter}
              sortAsc={sortAsc}
              onSortAscChange={setSortAsc}
              showChart={showChart}
              onShowChartChange={setShowChart}
              showPassed={showPassed}
              onShowPassedChange={setShowPassed}
              passedCount={passedList.length}
            />,
            document.body
          )
        : null}

      {showChart && !showPassed && (
        <Surface>
          <BarChart items={chartItems} />
        </Surface>
      )}

      <Surface padding="sm">
        {pageItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-base-content/40">
            {showPassed
              ? `还没有 Pass 过任何${isWordTab ? "单词" : "短语"}`
              : "无匹配结果（或已全部 Pass）"}
          </div>
        ) : (
          <>
            <div className="vocab-grid">
              {pageItems.map((item, index) => {
                const rank = pageStart + index;
                const diffTitle = isWordTab
                  ? wordDifficultyTitle(item)
                  : undefined;
                return (
                  <div
                    key={item.text}
                    className={`vocab-card ${showPassed ? "vocab-card-passed" : ""}`}
                  >
                    <div className="mb-2">
                      <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1 break-words font-mono text-xs leading-7 md:text-sm">
                          {item.text}
                        </div>
                        <DialogueTtsPlayButton
                          id={`vocab-${tab}-${item.text}`}
                          text={buildVocabSpeakText(item.text, item.gloss)}
                          raw
                          className="btn-xs h-7 w-7 min-h-0 shrink-0"
                        />
                      </div>
                      {item.ipa ? (
                        <p className="vocab-ipa text-primary/80">{item.ipa}</p>
                      ) : null}
                      {item.gloss ? (
                        <div className="mt-1 text-xs leading-snug text-base-content/55">
                          <p>
                            {item.pos ? (
                              <span className="mr-1 select-none text-base-content/35">
                                {item.pos}.
                              </span>
                            ) : null}
                            {item.gloss}
                          </p>
                          {item.glosses && item.glosses.length > 1 ? (
                            <details className="vocab-gloss-more mt-0.5">
                              <summary className="cursor-pointer select-none text-[10px] text-base-content/40 hover:text-base-content/60">
                                另有 {item.glosses.length - 1} 义
                              </summary>
                              <ul className="mt-1 space-y-0.5 text-xs leading-snug text-base-content/55">
                                {item.glosses.slice(1).map((g) => (
                                  <li key={`${g.pos ?? ""}:${g.gloss}`}>
                                    {g.pos ? (
                                      <span className="mr-1 select-none text-base-content/35">
                                        {g.pos}.
                                      </span>
                                    ) : null}
                                    {g.gloss}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </div>
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
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-base-content/45">
                      <span
                        className={`select-none tabular-nums text-[10px] text-base-content/35${diffTitle ? " cursor-default" : ""}`}
                        title={diffTitle}
                      >
                        #{rank}
                        {item.count != null ? (
                          <span className="ml-1.5">{item.count} 次</span>
                        ) : null}
                      </span>
                      {showPassed ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs h-7 min-h-0 px-2 text-base-content/50 hover:text-primary"
                          onClick={() => handleUnpass(item.text)}
                          aria-label="从 Passed 列表恢复"
                        >
                          恢复
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs h-7 min-h-0 px-2 text-base-content/45 hover:text-success"
                          onClick={() => handlePass(item.text)}
                          aria-label="Pass：已学会，不再显示"
                        >
                          Pass
                        </button>
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
          <> · 短语词典 {data.dictionarySize.toLocaleString()} 条</>
        ) : null}
      </p>
    </div>
  );
}
