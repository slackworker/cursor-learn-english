"use client";

import { Check } from "lucide-react";
import {
  CEFR_HIDE_PRESETS,
  DEFAULT_DIFFICULTY_FILTER,
  NGSL_HIDE_PRESETS,
  ZIPF_HIDE_PRESETS,
  type CefrLevel,
  type DifficultyFilter,
  type DifficultyProfile,
} from "@/lib/word-difficulty-shared";

type VocabSource = "prompt" | "thinking" | "response";

const SOURCE_OPTIONS: { id: VocabSource; label: string }[] = [
  { id: "prompt", label: "提问" },
  { id: "thinking", label: "Thinking" },
  { id: "response", label: "回复" },
];

const PROFILE_OPTIONS: { id: DifficultyProfile; label: string }[] = [
  { id: "off", label: "不排除" },
  { id: "ngsl", label: "NGSL" },
  { id: "cefr", label: "CEFR-J" },
  { id: "zipf", label: "Zipf" },
];

type VocabSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  sources: VocabSource[];
  onToggleSource: (id: VocabSource) => void;
  minCount: number;
  onMinCountChange: (n: number) => void;
  isWordTab: boolean;
  diffFilter: DifficultyFilter;
  onDiffFilterChange: (patch: Partial<DifficultyFilter>) => void;
  sortAsc: boolean;
  onSortAscChange: (asc: boolean) => void;
  showChart: boolean;
  onShowChartChange: (show: boolean) => void;
  showPassed: boolean;
};

export function VocabSettingsDrawer({
  open,
  onClose,
  sources,
  onToggleSource,
  minCount,
  onMinCountChange,
  isWordTab,
  diffFilter,
  onDiffFilterChange,
  sortAsc,
  onSortAscChange,
  showChart,
  onShowChartChange,
  showPassed,
}: VocabSettingsDrawerProps) {
  return (
    <>
      <div
        className={`tts-drawer-backdrop fixed inset-0 z-[90] transition-opacity duration-300 ${
          open
            ? "pointer-events-auto bg-black/40 opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        className={`tts-drawer fixed inset-y-0 right-0 z-[100] flex h-full w-full max-w-md flex-col border-l shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
        aria-hidden={!open}
        aria-label="词库筛选设置"
        role="dialog"
      >
        <header className="tts-drawer-header">
          <div>
            <h2 className="tts-drawer-title">筛选设置</h2>
            <p className="tts-drawer-subtitle">
              语料来源、次数与难度等冷门选项
            </p>
          </div>
          <button
            type="button"
            className="tts-drawer-close"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </header>

        <div className="tts-drawer-body space-y-6">
          <section>
            <p className="tts-label">语料来源</p>
            <div className="toolbar-filters" role="group" aria-label="语料来源">
              {SOURCE_OPTIONS.map(({ id, label }) => {
                const active = sources.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`toolbar-chip ${active ? "toolbar-chip-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onToggleSource(id)}
                  >
                    <span className="toolbar-chip-check" aria-hidden>
                      {active ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      ) : null}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <label className="tts-label" htmlFor="vocab-min-count">
              最小次数
            </label>
            <select
              id="vocab-min-count"
              className="tts-select"
              value={minCount}
              onChange={(e) => onMinCountChange(Number(e.target.value) || 1)}
            >
              <option value={1}>≥1</option>
              <option value={2}>≥2</option>
              <option value={3}>≥3</option>
              <option value={5}>≥5</option>
              <option value={10}>≥10</option>
            </select>
          </section>

          {isWordTab ? (
            <section>
              <label className="tts-label" htmlFor="vocab-diff-profile">
                排除过易词
                <span className="tts-label-hint">仅对单词生效</span>
              </label>
              <select
                id="vocab-diff-profile"
                className="tts-select"
                value={diffFilter.profile}
                onChange={(e) =>
                  onDiffFilterChange({
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

              {diffFilter.profile === "ngsl" ? (
                <label className="mt-3 block">
                  <span className="tts-label" id="vocab-ngsl-label">
                    排除范围
                  </span>
                  <select
                    className="tts-select"
                    aria-labelledby="vocab-ngsl-label"
                    value={
                      diffFilter.ngslMaxRank ??
                      DEFAULT_DIFFICULTY_FILTER.ngslMaxRank ??
                      500
                    }
                    onChange={(e) =>
                      onDiffFilterChange({
                        profile: "ngsl",
                        ngslMaxRank: Number(e.target.value),
                      })
                    }
                  >
                    {NGSL_HIDE_PRESETS.map((n) => (
                      <option key={n} value={n}>
                        {n === 2809 ? "全部 NGSL" : `前 ${n} 词`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {diffFilter.profile === "cefr" ? (
                <label className="mt-3 block">
                  <span className="tts-label" id="vocab-cefr-label">
                    排除 ≤
                  </span>
                  <select
                    className="tts-select"
                    aria-labelledby="vocab-cefr-label"
                    value={diffFilter.cefrMax ?? "a2"}
                    onChange={(e) =>
                      onDiffFilterChange({
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
                <label className="mt-3 block">
                  <span className="tts-label" id="vocab-zipf-label">
                    排除 ≥
                  </span>
                  <select
                    className="tts-select"
                    aria-labelledby="vocab-zipf-label"
                    value={diffFilter.zipfMin ?? 5}
                    onChange={(e) =>
                      onDiffFilterChange({
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
            </section>
          ) : null}

          {!showPassed ? (
            <>
              <section>
                <p className="tts-label">排序</p>
                <div className="toolbar-tabs">
                  <button
                    type="button"
                    className={`toolbar-tab ${!sortAsc ? "toolbar-tab-active" : ""}`}
                    onClick={() => onSortAscChange(false)}
                  >
                    次数↓
                  </button>
                  <button
                    type="button"
                    className={`toolbar-tab ${sortAsc ? "toolbar-tab-active" : ""}`}
                    onClick={() => onSortAscChange(true)}
                  >
                    次数↑
                  </button>
                </div>
              </section>

              <section>
                <label className="label cursor-pointer justify-between gap-3 p-0">
                  <span className="tts-label mb-0">显示图表</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={showChart}
                    onChange={() => onShowChartChange(!showChart)}
                  />
                </label>
              </section>
            </>
          ) : null}

          <p className="tts-drawer-note">
            这些选项会即时生效；难度排除设置会保存在本机。
          </p>
        </div>
      </aside>
    </>
  );
}
