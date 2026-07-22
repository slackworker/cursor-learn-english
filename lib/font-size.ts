export const FONT_SIZE_KEY = "font-size";

export type FontSizeScale = "sm" | "md" | "lg";

export const FONT_SIZE_SCALES: FontSizeScale[] = ["sm", "md", "lg"];

export const DEFAULT_FONT_SIZE: FontSizeScale = "md";

export const FONT_SIZE_LABELS: Record<FontSizeScale, string> = {
  sm: "小",
  md: "中",
  lg: "大",
};

export function isFontSizeScale(value: string | null | undefined): value is FontSizeScale {
  return value === "sm" || value === "md" || value === "lg";
}

export function applyFontSize(scale: FontSizeScale): void {
  document.documentElement.setAttribute("data-font-size", scale);
  try {
    localStorage.setItem(FONT_SIZE_KEY, scale);
  } catch {
    /* ignore quota / private mode */
  }
}

export function cycleFontSize(current: FontSizeScale): FontSizeScale {
  const idx = FONT_SIZE_SCALES.indexOf(current);
  return FONT_SIZE_SCALES[(idx + 1) % FONT_SIZE_SCALES.length]!;
}

export function readStoredFontSize(): FontSizeScale {
  try {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    if (isFontSizeScale(saved)) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_FONT_SIZE;
}
