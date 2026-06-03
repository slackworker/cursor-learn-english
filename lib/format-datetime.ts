/** 将 ISO / 可解析时间戳格式化为浏览器本地时区显示。 */
export function formatLocalDateTime(value?: string, empty = "—"): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    // 仅对 ISO 8601（如 2026-06-02T10:45:00）做 T 替换；transcript 的
    // <timestamp>Tuesday, Jun 2, …</timestamp> 含字母 T，不能用 replace("T")
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value.slice(0, 19).replace("T", " ");
    }
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
