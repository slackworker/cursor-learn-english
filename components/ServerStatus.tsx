"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 4_000;

type ServerStatusValue = {
  online: boolean;
  checkNow: () => void;
};

const ServerStatusContext = createContext<ServerStatusValue>({
  online: true,
  checkNow: () => {},
});

export function useServerStatus() {
  return useContext(ServerStatusContext);
}

/** 定期心跳：刷新闲置计时，并暴露在线状态给顶栏徽章 / 离线横幅 */
export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);

  const checkNow = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard-heartbeat", {
        method: "POST",
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
      });
      setOnline(res.ok || res.status === 204);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void checkNow();
    const id = window.setInterval(() => void checkNow(), HEARTBEAT_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [checkNow]);

  return (
    <ServerStatusContext.Provider
      value={{ online, checkNow: () => void checkNow() }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
}

/** 顶栏下方离线提示（仅服务不可达时显示） */
export function ServerOfflineBanner() {
  const { online, checkNow } = useServerStatus();
  if (online) return null;

  return (
    <div className="server-offline-banner" role="alert">
      <p className="server-offline-banner-text">
        后台服务已停止。请用桌面快捷方式重新启动，再点重试或刷新本页。
      </p>
      <button type="button" className="btn btn-sm btn-ghost" onClick={checkNow}>
        重试连接
      </button>
    </div>
  );
}

/** 顶栏状态点：运行中 / 已停止 */
export function ServerStatusBadge() {
  const { online } = useServerStatus();
  return (
    <span
      className="server-status-badge"
      title={online ? "后台服务运行中" : "后台服务已停止"}
      aria-label={online ? "后台服务运行中" : "后台服务已停止"}
    >
      <span
        className={`server-status-dot ${online ? "server-status-dot-on" : "server-status-dot-off"}`}
        aria-hidden
      />
      <span className="server-status-label hidden sm:inline">
        {online ? "运行中" : "已停止"}
      </span>
    </span>
  );
}
