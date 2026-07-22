"use client";

import { useMemo } from "react";
import { TTS_PREVIEW_ID, useTts } from "@/components/TtsProvider";
import { Surface } from "@/components/ui/Surface";
import { TTS_LANG_OPTIONS } from "@/lib/tts-settings";

function formatPercent(value: number, min: number, max: number): string {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return `${pct}%`;
}

export function TtsSettingsPanel() {
  const {
    settings,
    updateSettings,
    resetSettings,
    voices,
    voicesForLang,
    speakingId,
    preview,
    stop,
    speechSupported,
  } = useTts();

  const voiceOptions = useMemo(() => {
    const sorted = [...voicesForLang].sort((a, b) => {
      if (a.default !== b.default) return a.default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [voicesForLang]);

  const previewPlaying = speakingId === TTS_PREVIEW_ID;

  return (
    <Surface className="space-y-4">
      {!speechSupported && (
        <div className="banner-warning">
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
          onChange={(e) => updateSettings({ lang: e.target.value })}
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
              : voices.length === 0
                ? "加载中…"
                : "无匹配音色，将使用系统默认"}
          </span>
        </label>
        <select
          id="tts-voice"
          className="tts-select"
          value={settings.voiceURI}
          onChange={(e) => updateSettings({ voiceURI: e.target.value })}
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
            <span className="tts-slider-value tabular-nums">
              {settings.rate.toFixed(1)}×
            </span>
          </div>
          <input
            id="tts-rate"
            type="range"
            className="tts-range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.rate}
            onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
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
            onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
          />
        </div>

        <div className="tts-slider-block mt-4">
          <div className="tts-slider-head">
            <label className="tts-label mb-0" htmlFor="tts-pitch">
              音调
            </label>
            <span className="tts-slider-value tabular-nums">
              {settings.pitch.toFixed(1)}
            </span>
          </div>
          <input
            id="tts-pitch"
            type="range"
            className="tts-range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={settings.pitch}
            onChange={(e) => updateSettings({ pitch: Number(e.target.value) })}
          />
          <div className="tts-range-labels">
            <span>低</span>
            <span>高</span>
          </div>
        </div>
      </fieldset>

      <p className="tts-drawer-note">
        可用音色取决于操作系统与浏览器。若列表为空，请稍候或刷新页面；部分环境需联网语音包。设置会保存在本机。
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={resetSettings}
          disabled={!speechSupported}
        >
          恢复默认
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => (previewPlaying ? stop() : preview())}
          disabled={!speechSupported}
        >
          {previewPlaying ? "停止试听" : "试听"}
        </button>
      </div>
    </Surface>
  );
}
