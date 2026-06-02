import { Suspense } from "react";
import { ThinkingList } from "@/components/ThinkingList";

function ThinkingListFallback() {
  return (
    <div className="card bg-base-200 p-6">
      <span className="loading loading-spinner loading-sm" /> 加载中…
    </div>
  );
}

export default function ThinkingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm opacity-60">
        按“整轮对话”展示用户问题、助手完整回复、thinking 与工具调用轨迹。
      </p>
      <Suspense fallback={<ThinkingListFallback />}>
        <ThinkingList />
      </Suspense>
    </main>
  );
}
