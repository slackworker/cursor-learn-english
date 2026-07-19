/** 会话列表 / 详情的 SWR 刷新策略（本地 JSONL 无推送） */
export const SESSIONS_REFRESH_INTERVAL_MS = 12_000;

export const sessionsSwrOptions = {
  refreshInterval: SESSIONS_REFRESH_INTERVAL_MS,
  /** 覆盖全局 30s，否则短间隔轮询会被去重吞掉 */
  dedupingInterval: 5_000,
  revalidateOnFocus: true,
} as const;
