"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 4_000;
/** Startup / reconnect: retry before treating as offline (avoids open-flash). */
const PROBE_ATTEMPTS = 8;
const PROBE_GAP_MS = 400;
/** Need this many consecutive failures before showing the offline banner. */
const OFFLINE_AFTER_FAILURES = 2;

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

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function pingOnce(): Promise<boolean> {
  try {
    const res = await fetch("/api/dashboard-heartbeat", {
      method: "POST",
      signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

/** 定期心跳：刷新闲置计时，并暴露在线状态给离线横幅 */
export function ServerStatusProvider({ children }: { children: ReactNode }) {
  // Optimistic: never flash offline before a confirmed outage.
  const [online, setOnline] = useState(true);
  const onlineRef = useRef(true);
  const failStreakRef = useRef(0);
  const probingRef = useRef(false);

  const setOnlineBoth = useCallback((next: boolean) => {
    onlineRef.current = next;
    setOnline(next);
  }, []);

  const probeUntilReady = useCallback(async () => {
    if (probingRef.current) return;
    probingRef.current = true;
    try {
      for (let i = 0; i < PROBE_ATTEMPTS; i++) {
        if (await pingOnce()) {
          failStreakRef.current = 0;
          setOnlineBoth(true);
          return;
        }
        if (i < PROBE_ATTEMPTS - 1) await sleep(PROBE_GAP_MS);
      }
      failStreakRef.current = OFFLINE_AFTER_FAILURES;
      setOnlineBoth(false);
    } finally {
      probingRef.current = false;
    }
  }, [setOnlineBoth]);

  const checkNow = useCallback(async () => {
    // Offline / reconnect path: keep retrying briefly so a just-started
    // desktop launcher can come up without a one-shot false negative.
    if (!onlineRef.current) {
      await probeUntilReady();
      return;
    }
    if (await pingOnce()) {
      failStreakRef.current = 0;
      setOnlineBoth(true);
      return;
    }
    failStreakRef.current += 1;
    if (failStreakRef.current >= OFFLINE_AFTER_FAILURES) {
      setOnlineBoth(false);
    }
  }, [probeUntilReady, setOnlineBoth]);

  useEffect(() => {
    void probeUntilReady();
    const id = window.setInterval(() => {
      if (probingRef.current) return;
      void checkNow();
    }, HEARTBEAT_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void checkNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [probeUntilReady, checkNow]);

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
