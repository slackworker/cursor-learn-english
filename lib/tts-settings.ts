export type TtsSettings = {
  lang: string;
  /** Empty string = browser default voice for the language. */
  voiceURI: string;
  rate: number;
  volume: number;
  pitch: number;
};

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  lang: "en-US",
  voiceURI: "",
  rate: 1,
  volume: 1,
  pitch: 1,
};

export const TTS_SETTINGS_STORAGE_KEY = "cursor-learn-english-tts-settings";

export const TTS_LANG_OPTIONS: { value: string; label: string }[] = [
  { value: "en-US", label: "英语（美国）" },
  { value: "en-GB", label: "英语（英国）" },
  { value: "en-AU", label: "英语（澳大利亚）" },
  { value: "zh-CN", label: "中文（简体）" },
  { value: "zh-TW", label: "中文（繁体）" },
  { value: "ja-JP", label: "日语" },
  { value: "ko-KR", label: "韩语" },
  { value: "fr-FR", label: "法语" },
  { value: "de-DE", label: "德语" },
  { value: "es-ES", label: "西班牙语" },
];

const PREVIEW_BY_LANG: Record<string, string> = {
  "zh-CN": "这是一段朗读试听，用于检查语速、音量和音色。",
  "zh-TW": "這是一段朗讀試聽，用於檢查語速、音量和音色。",
  "ja-JP": "これは読み上げの試聴です。",
  "ko-KR": "이것은 음성 합성 미리듣기입니다.",
};

export const TTS_PREVIEW_FALLBACK =
  "This is a short preview to test voice, speed, and volume.";

export function getTtsPreviewText(lang: string): string {
  if (lang.startsWith("zh-CN")) return PREVIEW_BY_LANG["zh-CN"]!;
  if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return PREVIEW_BY_LANG["zh-TW"]!;
  if (lang.startsWith("ja")) return PREVIEW_BY_LANG["ja-JP"]!;
  if (lang.startsWith("ko")) return PREVIEW_BY_LANG["ko-KR"]!;
  return TTS_PREVIEW_FALLBACK;
}

export function loadTtsSettings(): TtsSettings {
  if (typeof window === "undefined") return DEFAULT_TTS_SETTINGS;
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TtsSettings>;
    return {
      lang: typeof parsed.lang === "string" ? parsed.lang : DEFAULT_TTS_SETTINGS.lang,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : "",
      rate: clampNum(parsed.rate, 0.1, 10, DEFAULT_TTS_SETTINGS.rate),
      volume: clampNum(parsed.volume, 0, 1, DEFAULT_TTS_SETTINGS.volume),
      pitch: clampNum(parsed.pitch, 0, 2, DEFAULT_TTS_SETTINGS.pitch),
    };
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}

export function saveTtsSettings(settings: TtsSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TTS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function voiceMatchesLang(voice: SpeechSynthesisVoice, lang: string): boolean {
  const v = voice.lang.toLowerCase().replace("_", "-");
  const target = lang.toLowerCase().replace("_", "-");
  if (v === target) return true;
  const vBase = v.split("-")[0];
  const tBase = target.split("-")[0];
  return vBase === tBase;
}

export function applyTtsSettingsToUtterance(
  utter: SpeechSynthesisUtterance,
  settings: TtsSettings,
  voices: SpeechSynthesisVoice[]
): void {
  utter.lang = settings.lang;
  utter.rate = settings.rate;
  utter.volume = settings.volume;
  utter.pitch = settings.pitch;
  if (settings.voiceURI) {
    const voice = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (voice) utter.voice = voice;
  }
}

export function getTtsTooltipLabel(lang: string): string {
  const opt = TTS_LANG_OPTIONS.find((o) => o.value === lang);
  return opt ? `朗读（${opt.label}）` : "朗读";
}
