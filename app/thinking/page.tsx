import { Suspense } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { LoadingState } from "@/components/ui/EmptyState";
import { ThinkingList } from "@/components/ThinkingList";

export default function ThinkingPage() {
  return (
    <PageShell
      title="完整对话"
      description="按整轮对话展示用户提示词、助手完整回复、Thinking 与工具调用轨迹。"
    >
      <Suspense fallback={<LoadingState />}>
        <ThinkingList />
      </Suspense>
    </PageShell>
  );
}
