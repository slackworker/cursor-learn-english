import { PageShell } from "@/components/ui/PageShell";
import { VocabStats } from "@/components/VocabStats";

export default function VocabPage() {
  return (
    <PageShell title="高频词汇" description="Pass 掉已学会的单词与短语，它们将不再出现；可随时回退。">
      <VocabStats />
    </PageShell>
  );
}
