import { PageShell } from "@/components/ui/PageShell";
import { VocabStats } from "@/components/VocabStats";

export default function VocabPage() {
  return (
    <PageShell
      title="高频词汇"
      description="从 Thinking 语料提取的高频单词与短语，支持生词标记与语料跳转。"
    >
      <VocabStats />
    </PageShell>
  );
}
