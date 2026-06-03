import { Suspense } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { LoadingState } from "@/components/ui/EmptyState";
import { ThinkingList } from "@/components/ThinkingList";

export default function ThinkingPage() {
  return (
    <PageShell title="轮次语料">
      <Suspense fallback={<LoadingState />}>
        <ThinkingList />
      </Suspense>
    </PageShell>
  );
}
