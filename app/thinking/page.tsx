import { Suspense } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { LoadingState } from "@/components/ui/EmptyState";
import { ThinkingList } from "@/components/ThinkingList";

export default function ThinkingPage() {
  return (
    <PageShell
      title="轮次语料"
      description="跨会话按轮展示：提示词、完整回复、Thinking 与工具调用。"
    >
      <Suspense fallback={<LoadingState />}>
        <ThinkingList />
      </Suspense>
    </PageShell>
  );
}
