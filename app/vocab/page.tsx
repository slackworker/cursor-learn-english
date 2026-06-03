import { PageShell } from "@/components/ui/PageShell";
import { VocabStats } from "@/components/VocabStats";

export default function VocabPage() {
  return (
    <PageShell
      title="词频统计"
      description="从 Thinking 语料中提取的高频单词与短语，基于 n-gram 分词与停用词过滤。"
    >
      <VocabStats />
    </PageShell>
  );
}
