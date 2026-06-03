import { PageShell } from "@/components/ui/PageShell";
import { VocabStats } from "@/components/VocabStats";

export default function VocabPage() {
  return (
    <PageShell title="高频词汇">
      <VocabStats />
    </PageShell>
  );
}
