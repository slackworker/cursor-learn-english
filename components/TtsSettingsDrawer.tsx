"use client";

import { useMemo } from "react";
import { TTS_LANG_OPTIONS, type TtsSettings } from "@/lib/tts-settings";

type TtsSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  settings: TtsSettings;
  onChange: (patch: Partial<TtsSettings>) => void;
  onReset: () => void;
  voicesForLang: SpeechSynthesisVoice[];
  allVoicesCount: number;
  speechSupported: boolean;
  previewPlaying: boolean;
  onPreview: () => void;
  onPreviewStop: () => void;
};

function formatPercent(value: number, min: number, max: number): string {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return `${pct}%`;
}

export function TtsSettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
  onReset,
  voicesForLang,
  allVoicesCount,
  speechSupported,
  previewPlaying,
  onPreview,
  onPreviewStop,
}: TtsSettingsDrawerProps) {
  const voiceOptions = useMemo(() => {
    const sorted = [...voicesForLang].sort((a, b) => {
      if (a.default !== b.default) return a.default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [voicesForLang]);

  const handlePreview = () => {
    if (previewPlaying) onPreviewStop();
    else onPreview();
  };

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
        aria-label="朗读设置"
        role="dialog"
      >
        <header className="tts-drawer-header">
          <div>
            <h2 className="tts-drawer-title">朗读设置</h2>
            <p className="tts-drawer-subtitle">使用浏览器语音合成，设置会保存在本机</p>
          </div>
          <button
            type="button"
            className="tts-drawer-close"
            onClick={onClose}
            aria-label="关闭设置"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </header>

        <div className="tts-drawer-body">
          {!speechSupported && (
            <div className="banner-warning mb-4">
              当前浏览器不支持语音朗读（Web Speech API）。
            </div>
          )}

          <fieldset className="tts-fieldset" disabled={!speechSupported}>
            <label className="tts-label" htmlFor="tts-lang">
              语言
            </label>
            <select
              id="tts-lang"
              className="tts-select"
              value={settings.lang}
              onChange={(e) => onChange({ lang: e.target.value })}
            >
              {TTS_LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <label className="tts-label mt-4" htmlFor="tts-voice">
              音色
              <span className="tts-label-hint">
                {voiceOptions.length > 0
                  ? `${voiceOptions.length} 个可用`
                  : allVoicesCount === 0
                    ? "加载中…"
                    : "无匹配音色，将使用系统默认"}
              </span>
            </label>
            <select
              id="tts-voice"
              className="tts-select"
              value={settings.voiceURI}
              onChange={(e) => onChange({ voiceURI: e.target.value })}
            >
              <option value="">系统默认</option>
              {voiceOptions.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                  {v.default ? " · 默认" : ""}
                  {v.localService ? "" : " · 在线"}
                </option>
              ))}
            </select>

            <div className="tts-slider-block mt-4">
              <div className="tts-slider-head">
                <label className="tts-label mb-0" htmlFor="tts-rate">
                  语速
                </label>
                <span className="tts-slider-value tabular-nums">{settings.rate.toFixed(1)}×</span>
              </div>
              <input
                id="tts-rate"
                type="range"
                className="tts-range"
                min={0.5}
                max={2}
                step={0.1}
                value={settings.rate}
                onChange={(e) => onChange({ rate: Number(e.target.value) })}
              />
              <div className="tts-range-labels">
                <span>慢</span>
                <span>快</span>
              </div>
            </div>

            <div className="tts-slider-block mt-4">
              <div className="tts-slider-head">
                <label className="tts-label mb-0" htmlFor="tts-volume">
                  音量
                </label>
                <span className="tts-slider-value tabular-nums">
                  {formatPercent(settings.volume, 0, 1)}
                </span>
              </div>
              <input
                id="tts-volume"
                type="range"
                className="tts-range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={(e) => onChange({ volume: Number(e.target.value) })}
              />
            </div>

            <div className="tts-slider-block mt-4">
              <div className="tts-slider-head">
                <label className="tts-label mb-0" htmlFor="tts-pitch">
                  音调
                </label>
                <span className="tts-slider-value tabular-nums">{settings.pitch.toFixed(1)}</span>
              </div>
              <input
                id="tts-pitch"
                type="range"
                className="tts-range"
                min={0.5}
                max={1.5}
                step={0.1}
                value={settings.pitch}
                onChange={(e) => onChange({ pitch: Number(e.target.value) })}
              />
              <div className="tts-range-labels">
                <span>低</span>
                <span>高</span>
              </div>
            </div>
          </fieldset>

          <p className="tts-drawer-note mt-6">
            可用音色取决于操作系统与浏览器。若列表为空，请稍候或刷新页面；部分环境需联网语音包。
          </p>
        </div>

        <footer className="tts-drawer-footer">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset} disabled={!speechSupported}>
            恢复默认
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handlePreview}
            disabled={!speechSupported}
          >
            {previewPlaying ? "停止试听" : "试听"}
          </button>
        </footer>
      </aside>
    </>
  );
}
