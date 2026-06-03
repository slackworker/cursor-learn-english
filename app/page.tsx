import { PageShell } from "@/components/ui/PageShell";
import { HomeSections } from "@/components/HomeSections";

export default function Home() {
  return (
    <PageShell
      title="数据概览"
      description="按日聚合提问数、工具调用与会话数。上下文 token 为 preCompact 近似值。"
    >
      <HomeSections />
    </PageShell>
  );
}
