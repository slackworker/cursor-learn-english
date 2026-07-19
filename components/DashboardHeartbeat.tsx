"use client";

import { useEffect } from "react";

/** 标签页打开时定期心跳，关闭后闲置看门狗可停服 */
export default function DashboardHeartbeat() {
  useEffect(() => {
    const beat = () => {
      void fetch("/api/dashboard-heartbeat", { method: "POST" }).catch(() => {});
    };
    beat();
    const id = window.setInterval(beat, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
